import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CANARY_INVARIANTS,
  CANARY_PARAMETER_SET,
  CanaryError,
  CanaryPlan,
  CanaryRouteRegistry,
  MAX_CANARY_ROUTES,
  messageId,
  testCanaryPlan,
  testPolicy,
  validateCanaryPlan,
} from './route-canary-limits';

const SPEC_DOC = join(__dirname, '..', 'docs', 'ROUTE_CANARY_LIMITS.md');
const START = 1_700_000_000_000;

function registry(overrides: Partial<CanaryPlan> = {}) {
  return new CanaryRouteRegistry(testCanaryPlan(overrides), { now: START });
}

function expectError(fn: () => unknown, code?: string): CanaryError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(CanaryError);
    if (code) expect((error as CanaryError).code).toBe(code);
    return error as CanaryError;
  }
  throw new Error(`expected CanaryError ${code ?? ''}`);
}

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => (state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0) / 0x1_0000_0000;
}

describe('route canary limits specification (#1523)', () => {
  it('documents every invariant and the parameter set in the normative spec', () => {
    const doc = readFileSync(SPEC_DOC, 'utf8');
    for (const id of CANARY_INVARIANTS) expect(doc).toContain(`\`${id}\``);
    expect(doc).toContain(CANARY_PARAMETER_SET);
    expect(doc).toContain('notional');
  });

  it('validates policy boundaries before exposing any route', () => {
    const base = testCanaryPlan();
    expect(validateCanaryPlan(base).routes).toHaveLength(1);
    expectError(() => validateCanaryPlan({ ...base, schemaVersion: 2 }), 'unsupported-schema');
    expectError(() => validateCanaryPlan({ ...base, parameterSetVersion: 'x' }), 'unsupported-parameter-set');
    expectError(() => validateCanaryPlan({ ...base, routes: [] }), 'invalid-routes');
    expectError(() => validateCanaryPlan({ ...base, operators: [] }), 'invalid-plan');
    expectError(() => validateCanaryPlan({ ...base, operators: ['operator', 'operator'] }), 'invalid-plan');
    expectError(
      () => validateCanaryPlan(testCanaryPlan({ routes: [testPolicy(), testPolicy()] })),
      'duplicate-route',
    );
    expectError(
      () => validateCanaryPlan(testCanaryPlan({ routes: [testPolicy({ minWindowMs: 5, windowMs: 1 })] })),
      'invalid-policy',
    );
    expectError(
      () => validateCanaryPlan(testCanaryPlan({ routes: [testPolicy({ maxTransferMinorUnits: '2000000' })] })),
      'invalid-policy',
    );
    expectError(
      () => validateCanaryPlan(testCanaryPlan({ routes: [testPolicy({ sourceChain: 'evm-1', destinationChain: 'evm-1' })] })),
      'invalid-policy',
    );
    expectError(
      () => validateCanaryPlan(testCanaryPlan({ routes: Array.from({ length: MAX_CANARY_ROUTES + 1 }, (_, i) => testPolicy({ routeId: `route-${i}` })) })),
      'invalid-routes',
    );
  });

  it('accepts transfers up to the per-window notional and count caps', () => {
    const r = registry();
    r.activate('operator', 'eth-to-sol');
    expect(r.submit({ messageId: messageId('a'), routeId: 'eth-to-sol', amountMinorUnits: '400000', observedAt: START })).toBe('accepted');
    expect(r.submit({ messageId: messageId('b'), routeId: 'eth-to-sol', amountMinorUnits: '400000', observedAt: START })).toBe('accepted');
    expectError(
      () => r.submit({ messageId: messageId('c'), routeId: 'eth-to-sol', amountMinorUnits: '400000', observedAt: START }),
      'notional-cap',
    );
    expect(r.state('eth-to-sol').windows[0].transfers).toBe(2);
    expect(r.state('eth-to-sol').windows[0].notionalMinorUnits).toBe('800000');
  });

  it('enforces per-transfer cap, count cap and rejects malformed amounts', () => {
    const r = registry();
    r.activate('operator', 'eth-to-sol');
    expectError(
      () => r.submit({ messageId: messageId('big'), routeId: 'eth-to-sol', amountMinorUnits: '500001', observedAt: START }),
      'per-transfer-cap',
    );
    expectError(
      () => r.submit({ messageId: messageId('neg'), routeId: 'eth-to-sol', amountMinorUnits: '-1', observedAt: START }),
      'invalid-policy',
    );
    for (let i = 0; i < 5; i++) {
      r.submit({ messageId: messageId(`n${i}`), routeId: 'eth-to-sol', amountMinorUnits: '100000', observedAt: START });
    }
    expectError(
      () => r.submit({ messageId: messageId('n5'), routeId: 'eth-to-sol', amountMinorUnits: '100000', observedAt: START }),
      'transfer-count-cap',
    );
    expect(r.state('eth-to-sol').windows[0].transfers).toBe(5);
  });

  it('ignores replayed messages without mutating counters', () => {
    const r = registry();
    r.activate('operator', 'eth-to-sol');
    const transfer = { messageId: messageId('replay'), routeId: 'eth-to-sol', amountMinorUnits: '100000', observedAt: START };
    expect(r.submit(transfer)).toBe('accepted');
    expect(r.submit(transfer)).toBe('duplicate');
    expect(r.state('eth-to-sol').windows[0].transfers).toBe(1);
    expect(r.invariantViolations()).toEqual([]);
  });

  it('blocks transfers on unknown or non-canary routes', () => {
    const r = registry();
    expectError(
      () => r.submit({ messageId: messageId('x'), routeId: 'eth-to-sol', amountMinorUnits: '100000', observedAt: START }),
      'route-not-canary',
    );
    expectError(
      () => r.submit({ messageId: messageId('y'), routeId: 'unknown', amountMinorUnits: '100000', observedAt: START }),
      'unsupported-route',
    );
  });

  it('requires operator authorization for every state transition', () => {
    const r = registry();
    expectError(() => r.activate('intruder', 'eth-to-sol'), 'unauthorized-operator');
    expectError(() => r.promote('intruder', 'eth-to-sol'), 'unauthorized-operator');
    expectError(() => r.rollback('intruder', 'eth-to-sol'), 'unauthorized-operator');
    r.activate('operator', 'eth-to-sol');
    expect(r.state('eth-to-sol').status).toBe('canary');
    expectError(() => r.activate('operator', 'eth-to-sol'), 'invalid-transition');
    expectError(() => r.promote('operator', 'eth-to-sol'), 'canary-window-not-elapsed');
    r.rollback('operator', 'eth-to-sol');
    expect(r.state('eth-to-sol').status).toBe('rolled-back');
  });

  it('promotes only after a full canary window without cap violations', () => {
    const r = registry();
    r.activate('operator', 'eth-to-sol');
    r.submit({ messageId: messageId('p'), routeId: 'eth-to-sol', amountMinorUnits: '100000', observedAt: START });
    r.setNow(START + 3_600_000);
    r.promote('operator', 'eth-to-sol');
    expect(r.state('eth-to-sol').status).toBe('promoted');
    expect(r.invariantViolations()).toEqual([]);
  });

  it('prunes old windows so tracked work stays bounded', () => {
    const r = registry();
    r.activate('operator', 'eth-to-sol');
    for (let i = 1; i <= 12; i++) {
      r.setNow(START + i * 3_600_000);
      r.submit({ messageId: messageId(`w${i}`), routeId: 'eth-to-sol', amountMinorUnits: '100000', observedAt: r.now });
    }
    expect(r.state('eth-to-sol').windows.length).toBeLessThanOrEqual(4);
    expect(r.invariantViolations()).toEqual([]);
  });

  it('rejects stale transfers and clock regressions', () => {
    const r = registry();
    expectError(() => r.setNow(START - 1), 'clock-must-not-go-backwards');
    r.activate('operator', 'eth-to-sol');
    expectError(
      () => r.submit({ messageId: messageId('stale'), routeId: 'eth-to-sol', amountMinorUnits: '1', observedAt: START - 1 }),
      'stale-transfer',
    );
  });

  it('holds canary invariants across randomized multi-step transitions', () => {
    const random = rng(1523);
    for (let run = 0; run < 50; run++) {
      const r = registry();
      try {
        r.activate('operator', 'eth-to-sol');
      } catch {
        /* ignore */
      }
      for (let step = 0; step < 30; step++) {
        const action = random();
        const amount = String(Math.floor(random() * 600000) + 1);
        const id = messageId(`${run}-${step}`);
        if (action < 0.7) {
          try {
            r.submit({ messageId: id, routeId: 'eth-to-sol', amountMinorUnits: amount, observedAt: r.now });
          } catch {
            /* rejected adversarial input */
          }
          try {
            r.submit({ messageId: id, routeId: 'eth-to-sol', amountMinorUnits: amount, observedAt: r.now });
          } catch {
            /* replay attempted */
          }
        } else if (action < 0.85) {
          try {
            r.promote('operator', 'eth-to-sol');
          } catch {
            /* no-op */
          }
        } else {
          try {
            r.rollback('operator', 'eth-to-sol');
          } catch {
            /* no-op */
          }
        }
        expect(r.invariantViolations().filter((v) => v === 'C-2' || v === 'C-3' || v === 'C-7')).toEqual([]);
      }
    }
  });
});
