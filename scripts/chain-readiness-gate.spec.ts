import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_IN_FLIGHT_MESSAGES,
  MAX_READINESS_CHAINS,
  READINESS_INVARIANTS,
  READINESS_PARAMETER_SET,
  ProductionReadinessGate,
  ReadinessError,
  ReadinessObservation,
  ReadinessPlan,
  testObservation,
  testPlan,
  testProfile,
  validateReadinessPlan,
} from './chain-readiness-gate';

const SPEC_DOC = join(__dirname, '..', 'docs', 'CHAIN_READINESS_GATE.md');

function gate(overrides: Partial<ReadinessPlan> = {}) {
  return new ProductionReadinessGate(testPlan(overrides), { now: 1_700_000_000_000 });
}

function ready(g: ProductionReadinessGate): void {
  for (const chain of g['plan'].chains) {
    for (const observer of g['plan'].observers.slice(0, chain.minObservers)) {
      g.submit(observer, testObservation({ observerId: observer, chainId: chain.chainId }));
    }
  }
}

function expectError(fn: () => unknown, code?: string): ReadinessError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ReadinessError);
    if (code) expect((error as ReadinessError).code).toBe(code);
    return error as ReadinessError;
  }
  throw new Error(`expected ReadinessError ${code ?? ''}`);
}

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => (state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0) / 0x1_0000_0000;
}

describe('chain readiness gate specification (#1522)', () => {
  it('documents every invariant and the parameter set in the normative spec', () => {
    const doc = readFileSync(SPEC_DOC, 'utf8');
    for (const id of READINESS_INVARIANTS) expect(doc).toContain(`\`${id}\``);
    expect(doc).toContain(READINESS_PARAMETER_SET);
    expect(doc).toContain('halt');
    expect(doc).toContain('restart');
  });

  it('reports ready only when every chain has a fresh, reorg-safe quorum', () => {
    const g = gate();
    expect(g.evaluate().ready).toBe(false);
    ready(g);
    const report = g.evaluate();
    expect(report.ready).toBe(true);
    expect(report.chains).toHaveLength(2);
    for (const chain of report.chains) {
      expect(chain.checks.every((c) => c.status === 'passed')).toBe(true);
    }
  });

  it('validates plan boundaries before reading any state', () => {
    const base = testPlan();
    expect(validateReadinessPlan(base).chains).toHaveLength(2);
    expectError(() => validateReadinessPlan({ ...base, schemaVersion: 2 }), 'unsupported-schema');
    expectError(() => validateReadinessPlan({ ...base, parameterSetVersion: 'x' }), 'unsupported-parameter-set');
    expectError(() => validateReadinessPlan({ ...base, releaseId: 'bad' }), 'invalid-plan');
    expectError(() => validateReadinessPlan({ ...base, chains: [] }), 'invalid-chains');
    expectError(() => validateReadinessPlan({ ...base, chains: [testProfile(), testProfile()] }), 'duplicate-chain');
    expectError(() => validateReadinessPlan({ ...base, observers: [] }), 'invalid-plan');
    expectError(() => validateReadinessPlan({ ...base, operators: ['operator', 'operator'] }), 'invalid-plan');
    expectError(
      () => validateReadinessPlan(testPlan({ chains: [testProfile({ minObservers: 9 })] })),
      'invalid-plan',
    );
    expectError(
      () => validateReadinessPlan(testPlan({ chains: [testProfile({ minConfirmations: 0 })] })),
      'invalid-plan',
    );
    expectError(
      () => validateReadinessPlan(testPlan({ chains: [testProfile({ maxInFlightMessages: MAX_IN_FLIGHT_MESSAGES + 1 })] })),
      'invalid-plan',
    );
    expectError(
      () => validateReadinessPlan(testPlan({ chains: Array.from({ length: MAX_READINESS_CHAINS + 1 }, (_, i) => testProfile({ chainId: `evm:${i + 1}` })) })),
      'invalid-chains',
    );
  });

  it('rejects malformed, unknown-chain and unauthorized observations', () => {
    const g = gate();
    expectError(() => g.submit('intruder', testObservation()), 'unauthorized-observer');
    expectError(() => g.submit('observer-a', { ...testObservation(), halted: 'no' }), 'invalid-observation');
    expectError(() => g.submit('observer-a', { ...testObservation(), inFlightMessages: -1 }), 'invalid-observation');
    expectError(() => g.submit('observer-a', testObservation({ chainId: 'evm:999' })), 'unsupported-chain');
    expectError(() => g.submit('observer-b', testObservation({ observerId: 'observer-a' })), 'observer-mismatch');
    expect(g.invariantViolations()).not.toContain('R-4');
  });

  it('ignores duplicate and replayed observations', () => {
    const g = gate();
    g.submit('observer-a', testObservation());
    expectError(() => g.submit('observer-a', testObservation()), 'replay-or-bound');
    expect(g['accepted'].size).toBe(1);
  });

  it('never mutates state on unauthorized or invalid calls', () => {
    const g = gate();
    g.submit('observer-a', testObservation());
    const before = JSON.stringify(g.evaluate());
    expectError(() => g.submit('intruder', testObservation()), 'unauthorized-observer');
    expectError(() => g.halt('intruder', 'evm:1'), 'unauthorized-operator');
    expect(JSON.stringify(g.evaluate())).toBe(before);
  });

  it('fails closed when any observer reports a halt or a shallow pin', () => {
    const g = gate();
    g.submit('observer-a', testObservation());
    g.submit('observer-b', testObservation({ observerId: 'observer-b', halted: true }));
    g.submit('observer-c', testObservation({ observerId: 'observer-c', pinnedBlock: 99 }));
    const report = g.evaluate();
    expect(report.ready).toBe(false);
    expect(report.chains[0].checks.find((c) => c.id === 'chain-not-halted')?.status).toBe('failed');
    expect(report.chains[0].checks.find((c) => c.id === 'reorg-depth')?.status).toBe('failed');
  });

  it('fails closed on stale observations and disagreeing pinned blocks', () => {
    const g = gate();
    g.submit('observer-a', testObservation());
    g.submit('observer-b', testObservation({ observerId: 'observer-b', observedAt: 0 }));
    g.submit('observer-c', testObservation({ observerId: 'observer-c', pinnedBlock: 80 }));
    const chain = g.evaluate().chains[0];
    expect(chain.checks.find((c) => c.id === 'freshness')?.status).toBe('failed');
    expect(chain.checks.find((c) => c.id === 'consistent-pin')?.status).toBe('failed');
  });

  it('only an operator may halt, and a halt blocks readiness', () => {
    const g = gate();
    ready(g);
    expect(g.evaluate().ready).toBe(true);
    expectError(() => g.halt('intruder', 'evm:1'), 'unauthorized-operator');
    expectError(() => g.halt('operator', 'evm:999'), 'unsupported-chain');
    g.halt('operator', 'evm:1');
    expect(g.evaluate().ready).toBe(false);
    expect(g.evaluate().chains[0].lifecycle).toBe('halted');
    expect(g.invariantViolations()).toContain('R-3');
  });

  it('restarts only on a bounded quorum and advances the epoch monotonically', () => {
    const g = gate();
    ready(g);
    g.halt('operator', 'evm:1');
    expectError(() => g.restart('intruder', 'evm:1', 2), 'unauthorized-operator');
    expectError(() => g.restart('operator', 'evm:1', 1), 'epoch-must-advance');
    const empty = gate();
    empty.halt('operator', 'evm:1');
    expectError(() => empty.restart('operator', 'evm:1', 2), 'restart-quorum-not-met');

    const fresh = gate();
    fresh.submit('observer-a', testObservation());
    fresh.submit('observer-b', testObservation({ observerId: 'observer-b' }));
    fresh.halt('operator', 'evm:1');
    fresh.restart('operator', 'evm:1', 2);
    expect(fresh.evaluate().chains[0].restartEpoch).toBe(2);
    expect(fresh.evaluate().chains[0].lifecycle).toBe('active');
    expect(fresh.invariantViolations()).toContain('R-2');
    fresh.submit('observer-a', testObservation({ epoch: 2 }));
    fresh.submit('observer-b', testObservation({ observerId: 'observer-b', epoch: 2 }));
    fresh.submit('observer-a', testObservation({ chainId: 'soroban:stellar' }));
    fresh.submit('observer-b', testObservation({ observerId: 'observer-b', chainId: 'soroban:stellar' }));
    expect(fresh.evaluate().ready).toBe(true);
    expect(fresh.invariantViolations()).toEqual([]);
  });

  it('rejects restart when in-flight messages exceed the reviewed bound', () => {
    const overBound = gate();
    overBound.submit('observer-a', testObservation({ inFlightMessages: 101 }));
    overBound.submit('observer-b', testObservation({ observerId: 'observer-b', inFlightMessages: 101 }));
    overBound.halt('operator', 'evm:1');
    expectError(
      () => overBound.restart('operator', 'evm:1', 2),
      'restart-quorum-not-met',
    );
    const bounded = gate();
    bounded.submit('observer-a', testObservation({ inFlightMessages: 100 }));
    bounded.submit('observer-b', testObservation({ observerId: 'observer-b', inFlightMessages: 100 }));
    bounded.halt('operator', 'evm:1');
    bounded.restart('operator', 'evm:1', 2);
    expect(bounded.evaluate().chains[0].restartEpoch).toBe(2);
  });

  it('never goes backwards in time', () => {
    const g = gate();
    expectError(() => g.setNow(1_700_000_000_000 - 1), 'clock-must-not-go-backwards');
    g.setNow(1_700_000_000_000 + 1);
    expect(g.now).toBe(1_700_000_000_001);
  });

  it('holds readiness invariants across randomized adversarial multi-step transitions', () => {
    const random = rng(1522);
    for (let run = 0; run < 60; run++) {
      const g = gate();
      const chainIds = ['evm:1', 'soroban:stellar'];
      const observers = ['observer-a', 'observer-b', 'observer-c'];
      for (let step = 0; step < 24; step++) {
        const chainId = chainIds[Math.floor(random() * chainIds.length)];
        const observerId = observers[Math.floor(random() * observers.length)];
        const action = random();
        if (action < 0.5) {
          const obs: ReadinessObservation = testObservation({
            observerId,
            chainId,
            epoch: random() < 0.2 ? 99 : 1,
            halted: random() < 0.2,
            inFlightMessages: Math.floor(random() * 200),
            pinnedBlock: random() < 0.2 ? 99 : 88,
          });
          try {
            g.submit(observerId, obs);
          } catch {
            /* adversarial inputs are expected to be rejected */
          }
        } else if (action < 0.7) {
          try {
            g.halt('operator', chainId);
          } catch {
            /* no-op */
          }
        } else if (action < 0.85) {
          try {
            g.restart('operator', chainId, 2 + step);
          } catch {
            /* no-op */
          }
        } else {
          const report = g.evaluate();
          expect(report.ready).toBe(report.chains.every((c) => c.ready));
        }
        expect(g.invariantViolations().filter((v) => v === 'R-4' || v === 'R-8')).toEqual([]);
      }
    }
  });
});
