import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BridgeProxySim,
  RunbookContext,
  RunbookStep,
  RunResult,
  SimError,
  UPGRADE_RUNBOOK,
  findUndocumentedSteps,
  recoverRunbook,
  runRunbook,
  validateRunbook,
} from './upgrade-rollback-runbook';

const OWNER = 'owner';
const OPERATOR = 'operator';
const APPROVER = 'approver';
const ATTACKER = 'attacker';

const LAYOUTS = {
  v1: ['chainId', 'executed'],
  v2: ['chainId', 'executed', 'newField'],
  bad: ['chainId', 'reordered', 'newField'],
};

function makeSim(paused = false): BridgeProxySim {
  const sim = new BridgeProxySim(OWNER, 'v1', LAYOUTS);
  if (paused) sim.pause(OWNER);
  return sim;
}

function makeCtx(sim = makeSim(), overrides: Partial<RunbookContext> = {}): RunbookContext {
  return {
    sim,
    owner: OWNER,
    operator: OPERATOR,
    approver: APPROVER,
    authorizedApprovers: [APPROVER],
    newImpl: 'v2',
    provenanceVerified: true,
    ...overrides,
  };
}

function seed(sim: BridgeProxySim): void {
  sim.deposit('t1', 100n);
  sim.deposit('t2', 200n);
  sim.deposit('t3', 300n);
  sim.execute('t1', true);
}

function expectSimError(fn: () => unknown): void {
  expect(fn).toThrow(SimError);
}

const nonRollbackIds = UPGRADE_RUNBOOK.filter((s) => s.stage !== 'rollback').map((s) => s.id);
const rollbackIds = UPGRADE_RUNBOOK.filter((s) => s.stage === 'rollback').map((s) => s.id);

describe('upgrade and rollback runbook definition', () => {
  it('is well formed', () => {
    expect(validateRunbook(UPGRADE_RUNBOOK)).toEqual([]);
  });

  it('is fully documented in docs/UPGRADE_ROLLBACK_RUNBOOK.md', () => {
    const doc = readFileSync(join(__dirname, '..', 'docs', 'UPGRADE_ROLLBACK_RUNBOOK.md'), 'utf8');
    expect(findUndocumentedSteps(UPGRADE_RUNBOOK, doc)).toEqual([]);
    expect(findUndocumentedSteps([...UPGRADE_RUNBOOK, { ...UPGRADE_RUNBOOK[0], id: 'secret-step' }], doc)).toEqual(['secret-step']);
  });

  const clone = (): RunbookStep[] => UPGRADE_RUNBOOK.map((s) => ({ ...s, after: s.after && [...s.after] }));
  const without = (id: string) => clone().filter((s) => s.id !== id);
  const edit = (id: string, patch: Partial<RunbookStep>) => clone().map((s) => (s.id === id ? { ...s, ...patch } : s));

  it.each<[string, RunbookStep[], string]>([
    ['duplicate id', [...clone(), clone()[0]], 'duplicate step id'],
    ['invalid id', edit('pause-bridge', { id: 'Pause Bridge' }), 'invalid id'],
    ['missing title', edit('pause-bridge', { title: ' ' }), 'title is required'],
    ['missing verification', edit('pause-bridge', { verification: '' }), 'verification is required'],
    ['unknown role', edit('pause-bridge', { role: 'root' as never }), 'unknown role'],
    ['missing rollback stage', clone().filter((s) => s.stage !== 'rollback'), 'missing stage: rollback'],
    ['missing observe stage', without('observe-window'), 'missing stage: observe'],
    ['out of order stage', [...clone().slice(1), clone()[0]], 'out of order'],
    ['mutating step without rollback', edit('pause-bridge', { rollbackStepId: undefined }), 'needs an existing rollbackStepId'],
    ['rollback to unknown step', edit('pause-bridge', { rollbackStepId: 'nope' }), 'needs an existing rollbackStepId'],
    ['rollback to non-mutating step', edit('pause-bridge', { rollbackStepId: 'verify-post-upgrade' }), 'different mutating step'],
    ['rollback to itself', edit('pause-bridge', { rollbackStepId: 'pause-bridge' }), 'different mutating step'],
    ['unknown dependency', edit('upgrade-implementation', { after: ['ghost'] }), 'unknown dependency'],
    ['dependency after step', edit('pause-bridge', { after: ['observe-window'] }), 'must appear earlier'],
    ['approver mutating', edit('pause-bridge', { role: 'approver' }), 'approvers must not perform mutations'],
    ['operator approving', edit('approve-upgrade', { role: 'operator' }), 'approver'],
    ['upgrade without pause', edit('upgrade-implementation', { after: ['approve-upgrade'] }), 'must follow pause-bridge'],
    ['unpause without verification', edit('unpause-bridge', { after: ['upgrade-implementation'] }), 'must follow verify-post-upgrade'],
  ])('rejects %s', (_name, steps, expected) => {
    expect(validateRunbook(steps).join('\n')).toContain(expected);
  });

  it('rejects approval that comes after the first mutation', () => {
    const steps = clone();
    const approvalAt = steps.findIndex((s) => s.id === 'approve-upgrade');
    const [approval] = steps.splice(approvalAt, 1);
    steps.splice(steps.findIndex((s) => s.id === 'upgrade-implementation') + 1, 0, approval);
    expect(validateRunbook(steps).join('\n')).toContain('approval must come before the first mutating step');
  });

  it('refuses to run an invalid runbook', () => {
    expect(() => runRunbook(without('pause-bridge'), makeCtx())).toThrow(SimError);
  });
});

describe('bridge proxy model', () => {
  it('rejects unauthorized callers without mutating state', () => {
    const sim = makeSim();
    seed(sim);
    const before = JSON.stringify(sim.snapshotState(), (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    expectSimError(() => sim.pause(ATTACKER));
    expectSimError(() => sim.unpause(ATTACKER));
    expectSimError(() => sim.upgradeTo(ATTACKER, 'v2'));
    expect(sim.implementation).toBe('v1');
    expect(sim.isPaused).toBe(false);
    expect(JSON.stringify(sim.snapshotState(), (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe(before);
  });

  it('rejects replayed, unknown and layout-incompatible upgrades', () => {
    const sim = makeSim();
    sim.upgradeTo(OWNER, 'v2');
    expectSimError(() => sim.upgradeTo(OWNER, 'v2'));
    expectSimError(() => sim.upgradeTo(OWNER, 'unknown'));
    expectSimError(() => sim.upgradeTo(OWNER, 'bad'));
    expect(sim.implementation).toBe('v2');
    sim.upgradeTo(OWNER, 'v1');
    expect(sim.implementation).toBe('v1');
  });

  it('rejects redundant pause and unpause', () => {
    const sim = makeSim();
    expectSimError(() => sim.unpause(OWNER));
    sim.pause(OWNER);
    expectSimError(() => sim.pause(OWNER));
  });

  it('enforces deposit boundaries and pause', () => {
    const sim = makeSim();
    expectSimError(() => sim.deposit('a', 0n));
    expectSimError(() => sim.deposit('a', -1n));
    sim.deposit('a', 1n);
    expectSimError(() => sim.deposit('a', 1n));
    sim.pause(OWNER);
    expectSimError(() => sim.deposit('b', 1n));
    expect(sim.invariantViolations()).toEqual([]);
  });

  it('a reverting destination changes nothing and can be retried', () => {
    const sim = makeSim();
    sim.deposit('a', 50n);
    const before = sim.snapshotState();
    expectSimError(() => sim.execute('a', false));
    expect(sim.snapshotState()).toEqual(before);
    sim.execute('a', true);
    expectSimError(() => sim.execute('a', true));
    expect(sim.invariantViolations()).toEqual([]);
  });

  it('settles each transfer once across execute and refund', () => {
    const sim = makeSim();
    sim.deposit('a', 50n);
    sim.deposit('b', 70n);
    sim.pause(OWNER);
    expectSimError(() => sim.execute('a', true));
    sim.refund('a');
    expectSimError(() => sim.refund('a'));
    sim.unpause(OWNER);
    sim.execute('b', true);
    expectSimError(() => sim.refund('b'));
    expectSimError(() => sim.refund('missing'));
    expect(sim.lockedIds()).toEqual([]);
    expect(sim.invariantViolations()).toEqual([]);
  });

  it('extends() rejects lost records, rewritten amounts and un-settled transfers', () => {
    const a = makeSim();
    seed(a);
    const snap = a.snapshotState();
    expect(a.extends(snap)).toBe(true);
    a.execute('t2', true);
    a.deposit('t4', 1n);
    expect(a.extends(snap)).toBe(true);

    const base = { owner: OWNER, transfers: [] as Array<[string, bigint, 'locked' | 'executed' | 'refunded']>, deposited: 0n, delivered: 0n, refunded: 0n };
    expect(makeSim().extends({ ...base, transfers: [['t1', 100n, 'locked']] })).toBe(false); // lost record
    const rewritten = makeSim();
    rewritten.deposit('t1', 999n);
    expect(rewritten.extends({ ...base, transfers: [['t1', 100n, 'locked']] })).toBe(false); // rewritten amount
    const unsettled = makeSim();
    unsettled.deposit('t1', 100n);
    expect(unsettled.extends({ ...base, transfers: [['t1', 100n, 'executed']] })).toBe(false); // un-settled
    expect(makeSim().extends({ ...base, deposited: 1n })).toBe(false); // total reduced
    expect(a.extends({ ...snap, owner: 'someone-else' })).toBe(false);
  });
});

describe('runbook execution', () => {
  it('upgrades successfully, in order, preserving accounting', () => {
    const sim = makeSim();
    seed(sim);
    const ctx = makeCtx(sim);
    const result = runRunbook(UPGRADE_RUNBOOK, ctx);

    expect(result.outcome).toBe('completed');
    expect(result.log.map((l) => l.step)).toEqual(nonRollbackIds);
    expect(result.applied).toEqual(['pause-bridge', 'upgrade-implementation', 'unpause-bridge']);
    expect(sim.implementation).toBe('v2');
    expect(sim.isPaused).toBe(false);
    expect(sim.invariantViolations()).toEqual([]);
  });

  it('keeps a bridge that was already paused paused after success', () => {
    const sim = makeSim(true);
    const result = runRunbook(UPGRADE_RUNBOOK, makeCtx(sim));
    expect(result.outcome).toBe('completed');
    expect(sim.isPaused).toBe(true);
    expect(sim.implementation).toBe('v2');
  });

  describe('preflight and approval failures abort without any change', () => {
    const cases: Array<[string, Partial<RunbookContext>, string]> = [
      ['unverified provenance', { provenanceVerified: false }, 'verify-provenance'],
      ['layout-incompatible implementation', { newImpl: 'bad' }, 'verify-storage-layout'],
      ['unknown implementation', { newImpl: 'ghost' }, 'verify-storage-layout'],
      ['same implementation', { newImpl: 'v1' }, 'verify-storage-layout'],
      ['unauthorized approver', { approver: ATTACKER }, 'approve-upgrade'],
      ['approver is the operator', { approver: OPERATOR, authorizedApprovers: [OPERATOR] }, 'approve-upgrade'],
      ['approver is the owner', { approver: OWNER, authorizedApprovers: [OWNER] }, 'approve-upgrade'],
    ];
    it.each(cases)('%s', (_name, overrides, failedStep) => {
      const sim = makeSim();
      seed(sim);
      const before = JSON.stringify(sim.snapshotState(), (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
      const result = runRunbook(UPGRADE_RUNBOOK, makeCtx(sim, overrides));
      expect(result).toMatchObject({ outcome: 'aborted', failedStep, applied: [], rollback: [] });
      expect(sim.implementation).toBe('v1');
      expect(sim.isPaused).toBe(false);
      expect(JSON.stringify(sim.snapshotState(), (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe(before);
    });

    it('detects broken invariants before touching anything', () => {
      const sim = makeSim();
      seed(sim);
      jest.spyOn(sim, 'invariantViolations').mockReturnValue(['conservation: boom']);
      const result = runRunbook(UPGRADE_RUNBOOK, makeCtx(sim));
      expect(result.outcome).toBe('aborted');
      expect(sim.implementation).toBe('v1');
    });
  });

  it('re-running after a successful upgrade is rejected at preflight and cannot downgrade', () => {
    const sim = makeSim();
    seed(sim);
    expect(runRunbook(UPGRADE_RUNBOOK, makeCtx(sim)).outcome).toBe('completed');
    const replay = runRunbook(UPGRADE_RUNBOOK, makeCtx(sim));
    expect(replay).toMatchObject({ outcome: 'aborted', failedStep: 'verify-storage-layout' });
    expect(sim.implementation).toBe('v2');
    expect(sim.isPaused).toBe(false);
  });

  describe('a fault at any upgrade step leaves a safe, consistent system', () => {
    const preMutation = ['verify-provenance', 'verify-storage-layout', 'snapshot-state', 'approve-upgrade', 'pause-bridge'];
    it.each(nonRollbackIds)('fault at %s', (stepId) => {
      const sim = makeSim();
      seed(sim);
      const initial = sim.snapshotState();
      const result = runRunbook(UPGRADE_RUNBOOK, makeCtx(sim), { faults: new Set([stepId]) });

      expect(result.failedStep).toBe(stepId);
      expect(sim.invariantViolations()).toEqual([]);
      expect(sim.extends(initial)).toBe(true);
      expect(sim.implementation).toBe('v1');
      expect(sim.isPaused).toBe(false);
      if (preMutation.includes(stepId)) {
        expect(result.outcome).toBe('aborted');
        expect(result.rollback).toEqual([]);
      } else {
        expect(result.outcome).toBe('rolled-back');
        expect(result.rollback).toEqual(rollbackIds);
      }
    });

    it('rolls back an upgrade that was already applied and unpaused', () => {
      const sim = makeSim();
      seed(sim);
      let upgradedAndLive = false;
      const result = runRunbook(UPGRADE_RUNBOOK, makeCtx(sim), {
        faults: new Set(['observe-window']),
        afterStep: (id) => {
          if (id === 'unpause-bridge') upgradedAndLive = sim.implementation === 'v2' && !sim.isPaused;
        },
      });
      expect(upgradedAndLive).toBe(true);
      expect(result.outcome).toBe('rolled-back');
      expect(sim.implementation).toBe('v1');
    });

    it('restores a paused bridge to paused when it started paused', () => {
      const sim = makeSim(true);
      const result = runRunbook(UPGRADE_RUNBOOK, makeCtx(sim), { faults: new Set(['verify-post-upgrade']) });
      expect(result.outcome).toBe('rolled-back');
      expect(sim.isPaused).toBe(true);
      expect(sim.implementation).toBe('v1');
    });
  });

  describe('a failing rollback requires manual recovery and fails safe (bridge left paused)', () => {
    it.each(rollbackIds)('rollback fault at %s', (rollbackStep) => {
      const sim = makeSim();
      seed(sim);
      const result = runRunbook(UPGRADE_RUNBOOK, makeCtx(sim), {
        faults: new Set(['observe-window', rollbackStep]),
      });
      expect(result.outcome).toBe('manual-recovery-required');
      expect(sim.isPaused).toBe(true);
      expect(sim.invariantViolations()).toEqual([]);
    });

    it('a retried rollback after manual recovery converges to the pre-upgrade state', () => {
      const sim = makeSim();
      seed(sim);
      const ctx = makeCtx(sim);
      const first = runRunbook(UPGRADE_RUNBOOK, ctx, { faults: new Set(['observe-window', 'rollback-implementation']) });
      expect(first.outcome).toBe('manual-recovery-required');
      expect(sim.implementation).toBe('v2');

      // Operator fixes the fault and re-runs only the rollback stage.
      const retry = recoverRunbook(UPGRADE_RUNBOOK, ctx);
      expect(retry.outcome).toBe('rolled-back');
      expect(sim.implementation).toBe('v1');
      expect(sim.isPaused).toBe(false);
      expect(sim.invariantViolations()).toEqual([]);
    });
  });

  describe('accounting holds under interleaved user traffic, faults and attackers', () => {
    function rng(seedValue: number): () => number {
      let s = seedValue >>> 0;
      return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 2 ** 32;
      };
    }

    it.each(Array.from({ length: 24 }, (_, i) => i + 1))('holds for seed %d', (seedValue) => {
      const rand = rng(seedValue);
      const sim = makeSim(rand() < 0.2);
      let next = 0;
      const reverted = new Set<string>();

      const traffic = (): void => {
        for (let i = 0; i < 4; i++) {
          const action = Math.floor(rand() * 5);
          const locked = sim.lockedIds();
          const id = locked.length ? locked[Math.floor(rand() * locked.length)] : 'none';
          try {
            if (action === 0) sim.deposit(`d${next++}`, BigInt(1 + Math.floor(rand() * 1000)));
            else if (action === 1) sim.execute(id, true);
            else if (action === 2) {
              sim.execute(id, false);
            } else if (action === 3) {
              sim.refund(id);
            } else sim.deposit(`d${next - 1}`, 5n); // replayed id
          } catch (error) {
            expect(error).toBeInstanceOf(SimError);
            if (action === 2) reverted.add(id);
          }
        }
      };
      traffic();
      traffic();
      const initial = sim.snapshotState();

      const faults = new Set<string>();
      const roll = rand();
      if (roll < 0.7) faults.add(UPGRADE_RUNBOOK[Math.floor(rand() * nonRollbackIds.length)].id);
      if (roll > 0.5) faults.add(rollbackIds[Math.floor(rand() * rollbackIds.length)]);

      let attackerBlocked = 0;
      const result: RunResult = runRunbook(UPGRADE_RUNBOOK, makeCtx(sim), {
        faults,
        afterStep: () => {
          traffic();
          const implBefore = sim.implementation;
          const pausedBefore = sim.isPaused;
          for (const attack of [() => sim.pause(ATTACKER), () => sim.unpause(ATTACKER), () => sim.upgradeTo(ATTACKER, 'v2')]) {
            expect(attack).toThrow(SimError);
            attackerBlocked++;
          }
          expect(sim.implementation).toBe(implBefore);
          expect(sim.isPaused).toBe(pausedBefore);
          expect(sim.invariantViolations()).toEqual([]);
        },
      });
      traffic();

      // Safety regardless of outcome.
      expect(sim.invariantViolations()).toEqual([]);
      expect(sim.extends(initial)).toBe(true);
      if (result.outcome === 'manual-recovery-required') expect(sim.isPaused).toBe(true);
      if (result.outcome === 'aborted' || result.outcome === 'rolled-back') {
        expect(sim.implementation).toBe('v1');
      }
      expect(['completed', 'aborted', 'rolled-back', 'manual-recovery-required']).toContain(result.outcome);
      expect(attackerBlocked % 3).toBe(0);

      // Recovery: reopen if needed, then retry reverted transfers and refund the rest.
      if (sim.isPaused) sim.unpause(OWNER);
      for (const id of sim.lockedIds()) {
        if (reverted.has(id) && rand() < 0.5) sim.execute(id, true);
        else sim.refund(id);
      }
      const final = sim.snapshotState();
      expect(sim.lockedIds()).toEqual([]);
      expect(final.deposited).toBe(final.delivered + final.refunded);
      expect(sim.invariantViolations()).toEqual([]);
    });
  });
});
