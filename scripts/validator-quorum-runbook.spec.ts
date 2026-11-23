import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BridgeMessage,
  CanaryResult,
  QuorumRunbookContext,
  QuorumRunbookStep,
  QuorumRunOptions,
  QuorumRunResult,
  QuorumError,
  QUORUM_RUNBOOK,
  ValidatorQuorumSim,
  ValidatorQuorumSimOptions,
  findUndocumentedSteps,
  recoverQuorumRunbook,
  runQuorumRunbook,
  validateRunbook,
} from './validator-quorum-runbook';

const OWNER = 'owner';
const OPERATOR = 'operator';
const APPROVER = 'approver';
const PROPOSER = 'governance';
const ATTACKER = 'attacker';

const INITIAL = ['v1', 'v2', 'v3', 'v4', 'v5'];
const REPLACEMENT = ['r1', 'r2', 'r3', 'r4', 'r5'];
const NOW = 1_000_000;

function makeSim(options: Partial<ValidatorQuorumSimOptions> = {}): ValidatorQuorumSim {
  return new ValidatorQuorumSim({
    owner: OWNER,
    proposer: PROPOSER,
    operator: OPERATOR,
    chainId: 'evm:1',
    lanes: ['evm:137', 'soroban:stellar'],
    bridgeAddress: '0xbridge',
    domainVersion: '1',
    epochDelay: 3_600,
    overlapWindow: 600,
    initialValidators: INITIAL,
    threshold: 3,
    knownSigners: [...INITIAL, ...REPLACEMENT],
    now: NOW,
    ...options,
  });
}

/** Leave fewer signers ready than the active threshold. */
function loseQuorum(sim: ValidatorQuorumSim, keepReady = 2): void {
  for (const id of INITIAL.slice(keepReady)) sim.setSignerStatus(OWNER, id, 'unavailable');
}

function message(id: string, overrides: Partial<BridgeMessage> = {}): BridgeMessage {
  return {
    id,
    sourceChainId: 'evm:137',
    targetChainId: 'evm:1',
    bridgeAddress: '0xbridge',
    version: '1',
    sender: 'alice',
    amount: 100n,
    nonce: 0,
    deadline: NOW + 1_000_000,
    ...overrides,
  };
}

function makeCtx(sim = makeSim(), overrides: Partial<QuorumRunbookContext> = {}): QuorumRunbookContext {
  const reviewedValidators = overrides.reviewedValidators ?? REPLACEMENT;
  const reviewedThreshold = overrides.reviewedThreshold ?? 3;
  return {
    sim,
    owner: OWNER,
    operator: OPERATOR,
    approver: APPROVER,
    proposer: PROPOSER,
    authorizedApprovers: [APPROVER],
    reviewedValidators,
    reviewedThreshold,
    sourceChainId: 'evm:137',
    targetChainId: 'evm:1',
    bridgeAddress: '0xbridge',
    domainVersion: '1',
    canaryMessage: message('canary', { sender: 'canary-sender', nonce: 0 }),
    canarySigners: reviewedValidators.slice(0, reviewedThreshold),
    lossEvidence: ['contract-read:active-set', 'probe:signer-availability'],
    lossCause: 'signer-outage',
    ...overrides,
  };
}

/** Advance chain time to the on-chain activation time as soon as it exists. */
function runWithTime(ctx: QuorumRunbookContext, options: QuorumRunOptions = {}): QuorumRunResult {
  return runQuorumRunbook(QUORUM_RUNBOOK, ctx, {
    ...options,
    afterStep: (id, state) => {
      if (id === 'propose-validator-set' && state.sim.hasPendingProposal) {
        state.sim.setNow(state.sim.pendingActiveAt);
      }
      options.afterStep?.(id, state);
    },
  });
}

function seed(sim: ValidatorQuorumSim): void {
  sim.deposit(message('t1', { sender: 'alice', nonce: 0 }));
  sim.deposit(message('t2', { sender: 'alice', nonce: 1, amount: 200n }));
  sim.deposit(message('t3', { sender: 'bob', nonce: 0, amount: 300n }));
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item));
}

function expectQuorumError(fn: () => unknown, code?: string): void {
  try {
    fn();
    throw new Error('expected a QuorumError');
  } catch (error) {
    expect(error).toBeInstanceOf(QuorumError);
    if (code) expect((error as QuorumError).code).toBe(code);
  }
}

const nonRecoveryIds = QUORUM_RUNBOOK.filter((step) => step.stage !== 'recovery').map((step) => step.id);
const recoveryIds = QUORUM_RUNBOOK.filter((step) => step.stage === 'recovery').map((step) => step.id);
const mutatingIds = QUORUM_RUNBOOK.filter((step) => step.mutates && step.stage !== 'recovery').map((step) => step.id);

describe('validator quorum runbook definition', () => {
  it('is well formed', () => {
    expect(validateRunbook(QUORUM_RUNBOOK)).toEqual([]);
  });

  it('is fully documented in docs/VALIDATOR_QUORUM_LOSS_RECOVERY_RUNBOOK.md', () => {
    const doc = readFileSync(join(__dirname, '..', 'docs', 'VALIDATOR_QUORUM_LOSS_RECOVERY_RUNBOOK.md'), 'utf8');
    expect(findUndocumentedSteps(QUORUM_RUNBOOK, doc)).toEqual([]);
    expect(findUndocumentedSteps([...QUORUM_RUNBOOK, { ...QUORUM_RUNBOOK[0], id: 'secret-step' }], doc)).toEqual(['secret-step']);
  });

  const clone = (): QuorumRunbookStep[] => QUORUM_RUNBOOK.map((step) => ({ ...step, after: step.after && [...step.after] }));
  const edit = (id: string, patch: Partial<QuorumRunbookStep>) => clone().map((step) => (step.id === id ? { ...step, ...patch } : step));

  it.each<[string, QuorumRunbookStep[], string]>([
    ['duplicate id', [...clone(), clone()[0]], 'duplicate step id'],
    ['invalid id', edit('freeze-submissions', { id: 'Freeze Submissions' }), 'invalid id'],
    ['missing title', edit('freeze-submissions', { title: ' ' }), 'title is required'],
    ['missing verification', edit('freeze-submissions', { verification: '' }), 'verification is required'],
    ['unknown role', edit('freeze-submissions', { role: 'root' as never }), 'unknown role'],
    ['unknown stage', edit('freeze-submissions', { stage: 'magic' as never }), 'unknown stage'],
    ['missing stage', clone().filter((step) => step.stage !== 'observe'), 'missing stage: observe'],
    ['out of order stage', [...clone().slice(1), clone()[0]], 'out of order'],
    ['unknown dependency', edit('activate-validator-set', { after: ['ghost'] }), 'unknown dependency'],
    ['dependency after step', edit('freeze-submissions', { after: ['observe-window'] }), 'must appear earlier'],
    ['mutating step without a fail-safe', edit('freeze-submissions', { recoveryStepId: undefined }), 'needs an existing recoveryStepId'],
    ['fail-safe to unknown step', edit('freeze-submissions', { recoveryStepId: 'nope' }), 'needs an existing recoveryStepId'],
    ['fail-safe to non-mutating step', edit('freeze-submissions', { recoveryStepId: 'list-locked-transfers' }), 'different mutating step'],
    ['fail-safe to itself', edit('freeze-submissions', { recoveryStepId: 'freeze-submissions' }), 'different mutating step'],
    ['approver mutating', edit('approve-recovery-plan', { mutates: true }), 'approvers must not perform mutations'],
    ['activation without timelock confirmation', edit('activate-validator-set', { after: ['provision-signer-keys'] }), 'must follow wait-epoch-delay'],
    ['activation without key provisioning', edit('activate-validator-set', { after: ['wait-epoch-delay'] }), 'must follow wait-epoch-delay and provision-signer-keys'],
    ['resume without canary', edit('resume-submissions', { after: [] }), 'must follow canary-probe'],
    ['freeze is not the first mutation', edit('classify-loss-cause', { mutates: true, recoveryStepId: 'ensure-frozen' }), 'freeze-submissions must be the first mutating step'],
    ['missing fail-safe stage step', clone().filter((step) => step.id !== 'ensure-frozen'), 'must contain ensure-frozen'],
  ])('rejects %s', (_name, steps, expected) => {
    expect(validateRunbook(steps).join('\n')).toContain(expected);
  });

  it('rejects approval that comes after the first restoring mutation', () => {
    const steps = clone();
    const index = steps.findIndex((step) => step.id === 'approve-recovery-plan');
    const [approval] = steps.splice(index, 1);
    steps.splice(steps.findIndex((step) => step.id === 'propose-validator-set') + 1, 0, approval);
    expect(validateRunbook(steps).join('\n')).toContain('approval must come before the first restoring mutation');
  });

  it('refuses to execute an invalid runbook', () => {
    const steps = clone().filter((step) => step.id !== 'freeze-submissions');
    expect(() => runQuorumRunbook(steps, makeCtx())).toThrow(QuorumError);
  });
});

describe('validator quorum model', () => {
  it('rejects unauthorized callers without changing protected state', () => {
    const sim = makeSim();
    seed(sim);
    const before = stable(sim.snapshotState());
    expectQuorumError(() => sim.freeze(ATTACKER), 'caller-is-not-owner');
    expectQuorumError(() => sim.unfreeze(ATTACKER), 'caller-is-not-owner');
    expectQuorumError(() => sim.proposeValidatorSet(ATTACKER, REPLACEMENT, 3), 'caller-is-not-owner');
    expectQuorumError(() => sim.activateValidatorSet(ATTACKER), 'caller-is-not-owner');
    expectQuorumError(() => sim.setSignerStatus(ATTACKER, 'v1', 'unavailable'), 'caller-is-not-authorized');
    expectQuorumError(() => sim.refund('t1', ATTACKER), 'caller-is-not-authorized');
    expect(stable(sim.snapshotState())).toBe(before);
  });

  it('enforces validator set and threshold boundaries', () => {
    expectQuorumError(() => makeSim({ initialValidators: [], threshold: 1 }), 'invalid-validator-set-size');
    expectQuorumError(() => makeSim({ initialValidators: INITIAL, threshold: 0 }), 'invalid-threshold');
    expectQuorumError(() => makeSim({ initialValidators: INITIAL, threshold: 6 }), 'invalid-threshold');
    expectQuorumError(() => makeSim({ initialValidators: ['v2', 'v1', 'v3'] }), 'validators-must-be-ascending-and-distinct');
    expectQuorumError(() => makeSim({ initialValidators: ['v1', 'v1', 'v3'] }), 'validators-must-be-ascending-and-distinct');
    expectQuorumError(() => makeSim({ initialValidators: Array.from({ length: 65 }, (_, i) => `s${String(i).padStart(2, '0')}`) }), 'invalid-validator-set-size');
    expectQuorumError(() => makeSim({ epochDelay: 0 }), 'invalid-epoch-delay');
    expectQuorumError(() => makeSim({ overlapWindow: -1 }), 'invalid-overlap-window');
  });

  it('enforces the on-chain epoch delay and single pending proposal', () => {
    const sim = makeSim();
    const activeAt = sim.proposeValidatorSet(OWNER, REPLACEMENT, 4);
    expect(activeAt).toBe(NOW + sim.epochDelay);
    expectQuorumError(() => sim.proposeValidatorSet(OWNER, REPLACEMENT, 3), 'proposal-already-pending');
    expectQuorumError(() => sim.activateValidatorSet(OWNER), 'timelock-not-expired');
    sim.setNow(activeAt);
    expect(() => sim.activateValidatorSet(OWNER)).not.toThrow();
    expect(sim.activeThreshold).toBe(4);
    expect(sim.hasPendingProposal).toBe(false);
    expectQuorumError(() => sim.setNow(NOW), 'clock-must-not-go-backwards');
  });

  it('enforces signature ordering, distinctness, readiness and size bounds', () => {
    const sim = makeSim();
    expect(sim.verifyBundle(['v1', 'v2', 'v3']).ok).toBe(true);
    expect(sim.verifyBundle(['v1', 'v2']).code).toBe('below-threshold');
    expect(sim.verifyBundle(['v2', 'v1', 'v3']).code).toBe('bundle-not-ascending-or-duplicate');
    expect(sim.verifyBundle(['v1', 'v1', 'v3']).code).toBe('bundle-not-ascending-or-duplicate');
    expect(sim.verifyBundle([]).code).toBe('bundle-size');
    expect(sim.verifyBundle(Array.from({ length: 65 }, (_, i) => `v${i}`)).code).toBe('bundle-size');
    expect(sim.verifyBundle(['v1', 'v2', 'zzz']).code).toBe('unknown-signer');
    sim.setSignerStatus(OWNER, 'r1', 'ready');
    expect(sim.verifyBundle(['r1', 'v1', 'v2']).code).toBe('mixed-or-stale-set');

    const hostile = new Proxy(new Array<string>(1_000_000), {
      get(_target, property) {
        if (property === 'length') return 1_000_000;
        throw new Error('unbounded read of signer bundle');
      },
    });
    expect(sim.verifyBundle(hostile).code).toBe('bundle-size');

    loseQuorum(sim);
    expect(sim.isQuorumReady()).toBe(false);
    expect(sim.verifyBundle(['v1', 'v2', 'v3']).code).toBe('signer-not-ready');
    sim.setSignerStatus(OWNER, 'v3', 'degraded');
    expect(sim.verifyBundle(['v1', 'v2', 'v3']).code).toBe('signer-not-ready');
  });

  it('accepts outgoing-set signatures only during the bounded overlap window', () => {
    const sim = makeSim();
    sim.proposeValidatorSet(OWNER, REPLACEMENT, 3);
    for (const id of REPLACEMENT) sim.setSignerStatus(OWNER, id, 'ready');
    sim.setNow(NOW + sim.epochDelay);
    sim.activateValidatorSet(OWNER);
    expect(sim.verifyBundle(['v1', 'v2', 'v3'])).toMatchObject({ ok: true, setId: 'outgoing', threshold: 3 });
    expect(sim.verifyBundle(['r1', 'v1', 'v2']).code).toBe('mixed-or-stale-set');
    sim.setNow(NOW + sim.epochDelay + sim.overlapWindow + 1);
    expect(sim.verifyBundle(['v1', 'v2', 'v3']).code).toBe('mixed-or-stale-set');
    expect(sim.verifyBundle(['r1', 'r2', 'r3'])).toMatchObject({ ok: true, setId: 'active' });
  });

  it('rejects malformed, wrong-domain, duplicate and replayed messages', () => {
    const sim = makeSim();
    const first = message('m1', { sender: 'alice', nonce: 0 });
    sim.deposit(first);
    expectQuorumError(() => sim.deposit(message('m2', { sender: 'alice', nonce: 0 })), 'nonce-gap-or-replay');
    expectQuorumError(() => sim.deposit(message('m2', { sender: 'alice', nonce: 2 })), 'nonce-gap-or-replay');
    expectQuorumError(() => sim.deposit(message('m1', { sender: 'carol', nonce: 0 })), 'duplicate-message-id');
    expectQuorumError(() => sim.deposit(message('m2', { amount: 0n, sender: 'carol', nonce: 0 })), 'invalid-amount');
    expectQuorumError(() => sim.deposit(message('m2', { amount: -1n, sender: 'carol', nonce: 0 })), 'invalid-amount');
    expectQuorumError(() => sim.deposit(message('m2', { id: '', sender: 'carol', nonce: 0 })), 'invalid-message-id');
    expectQuorumError(() => sim.deposit(message('x'.repeat(201), { sender: 'carol', nonce: 0 })), 'invalid-message-id');
    expectQuorumError(() => sim.deposit(message('m2', { version: '2', sender: 'carol', nonce: 0 })), 'wrong-domain-version');
    expectQuorumError(() => sim.deposit(message('m2', { sourceChainId: 'evm:999', sender: 'carol', nonce: 0 })), 'unregistered-lane');
    expectQuorumError(() => sim.deposit(message('m2', { targetChainId: 'evm:56', sender: 'carol', nonce: 0 })), 'wrong-target-chain');
    expectQuorumError(() => sim.deposit(message('m2', { bridgeAddress: '0xother', sender: 'carol', nonce: 0 })), 'wrong-bridge-address');
    expectQuorumError(() => sim.deposit(message('m2', { deadline: NOW, sender: 'carol', nonce: 0 })), 'expired-or-invalid-deadline');
    expectQuorumError(() => sim.deposit(message('m2', { nonce: -1, sender: 'carol' })), 'invalid-nonce');

    const signers = ['v1', 'v2', 'v3'];
    const before = stable(sim.snapshotState());
    expectQuorumError(() => sim.execute(first, signers, false), 'destination-reverted');
    expect(stable(sim.snapshotState())).toBe(before);
    sim.execute(first, signers);
    expectQuorumError(() => sim.execute(first, signers), 'message-already-executed');
    expectQuorumError(() => sim.refund('m1', OPERATOR), 'transfer-already-settled');
    expect(sim.invariantViolations()).toEqual([]);
  });

  it('keeps refunds available while frozen and preserves accounting', () => {
    const sim = makeSim();
    seed(sim);
    sim.freeze(OWNER);
    expectQuorumError(() => sim.deposit(message('t4', { sender: 'carol', nonce: 0 })), 'frozen');
    expectQuorumError(() => sim.execute(message('t1'), ['v1', 'v2', 'v3']), 'frozen');
    expect(sim.refundAll(OPERATOR)).toEqual(['t1', 't2', 't3']);
    expectQuorumError(() => sim.refundAll(ATTACKER), 'caller-is-not-authorized');
    expect(sim.lockedIds()).toEqual([]);
    expect(sim.escrowHeld).toBe(0n);
    expect(sim.invariantViolations()).toEqual([]);
  });

  it('models the canary as a rolled-back execution that proves replay rejection', () => {
    const sim = makeSim();
    const probe: CanaryResult = sim.probeExecution(message('canary', { sender: 'canary-sender', nonce: 0 }), ['v1', 'v2', 'v3']);
    expect(probe).toEqual({ accepted: true, replayRejected: true, stateUnchanged: true });
    expect(sim.lockedIds()).toEqual([]);
    expect(sim.invariantViolations()).toEqual([]);

    loseQuorum(sim);
    expect(sim.probeExecution(message('canary-2', { sender: 'canary-sender-2', nonce: 0 }), ['v1', 'v2', 'v3']).accepted).toBe(false);
  });
});

describe('quorum recovery execution', () => {
  it('restores the reviewed set and resumes an originally live lane', () => {
    const sim = makeSim();
    loseQuorum(sim);
    seed(sim);
    const initial = sim.snapshotState();
    const ctx = makeCtx(sim);
    const result = runWithTime(ctx);

    expect(result.outcome).toBe('completed');
    expect(result.failedStep).toBeUndefined();
    expect(result.applied).toEqual(mutatingIds);
    expect(result.recovery).toEqual([]);
    expect(sim.activeValidators).toEqual(REPLACEMENT);
    expect(sim.activeThreshold).toBe(3);
    expect(sim.frozen).toBe(false);
    expect(sim.lockedIds()).toEqual(['t1', 't2', 't3']);
    expect(sim.extends(initial)).toBe(true);
    expect(sim.invariantViolations()).toEqual([]);
  });

  it('keeps an incident-frozen lane frozen after success', () => {
    const sim = makeSim();
    loseQuorum(sim);
    sim.freeze(OWNER);
    const result = runWithTime(makeCtx(sim));
    expect(result.outcome).toBe('completed');
    expect(sim.frozen).toBe(true);
    expect(sim.activeValidators).toEqual(REPLACEMENT);
  });

  describe('preflight and approval failures fail closed', () => {
    const cases: Array<[string, Partial<QuorumRunbookContext>, string]> = [
      ['no corroboration', { lossEvidence: ['probe:signer-availability'] }, 'confirm-quorum-loss'],
      ['quorum actually available', { lossEvidence: ['a', 'b'] }, 'confirm-quorum-loss'],
      ['cause not recorded', { lossCause: undefined }, 'classify-loss-cause'],
      ['unauthorized approver', { approver: ATTACKER }, 'approve-recovery-plan'],
      ['approver is the operator', { approver: OPERATOR, authorizedApprovers: [OPERATOR] }, 'approve-recovery-plan'],
      ['approver is the owner', { approver: OWNER, authorizedApprovers: [OWNER] }, 'approve-recovery-plan'],
      ['empty reviewed set', { reviewedValidators: [] }, 'approve-recovery-plan'],
      ['reviewed threshold above count', { reviewedThreshold: 6 }, 'approve-recovery-plan'],
    ];

    it.each(cases)('%s', (_name, overrides, failedStep) => {
      const sim = makeSim();
      loseQuorum(sim);
      seed(sim);
      const ctx = makeCtx(sim, overrides);
      if (_name === 'quorum actually available') {
        // Only this case starts with a healthy quorum; all others lose it.
        for (const id of INITIAL) sim.setSignerStatus(OWNER, id, 'ready');
      }
      const before = stable(sim.snapshotState());
      const result = runWithTime(ctx);
      expect(result).toMatchObject({ failedStep });
      if (failedStep === 'approve-recovery-plan') {
        // Containment already happened; unapproved restoration is never attempted.
        expect(result.outcome).toBe('contained');
        expect(result.applied).toEqual(['freeze-submissions']);
        expect(result.recovery).toEqual(recoveryIds);
        expect(sim.frozen).toBe(true);
        expect(sim.lockedIds()).toEqual([]);
      } else {
        expect(result.outcome).toBe('aborted');
        expect(result.applied).toEqual([]);
        expect(result.recovery).toEqual([]);
        expect(sim.frozen).toBe(false);
        expect(stable(sim.snapshotState())).toBe(before);
      }
      expect(sim.invariantViolations()).toEqual([]);
    });

    it('detects broken invariants before freezing', () => {
      const sim = makeSim();
      loseQuorum(sim);
      jest.spyOn(sim, 'invariantViolations').mockReturnValue(['conservation: boom']);
      const result = runWithTime(makeCtx(sim));
      expect(result.outcome).toBe('aborted');
      expect(sim.frozen).toBe(false);
    });
  });

  describe('a fault at any step after containment fails safe', () => {
    it.each(nonRecoveryIds)('fault at %s', (stepId) => {
      const sim = makeSim();
      loseQuorum(sim);
      seed(sim);
      const initial = sim.snapshotState();
      const result = runWithTime(makeCtx(sim), { faults: new Set([stepId]) });

      expect(result.failedStep).toBe(stepId);
      expect(sim.invariantViolations()).toEqual([]);
      expect(sim.extends(initial)).toBe(true);
      if (['confirm-quorum-loss', 'snapshot-validator-state', 'classify-loss-cause', 'freeze-submissions'].includes(stepId)) {
        expect(result.outcome).toBe('aborted');
        expect(result.applied).toEqual([]);
        expect(result.recovery).toEqual([]);
        expect(sim.frozen).toBe(false);
      } else {
        expect(result.outcome).toBe('contained');
        expect(result.recovery).toEqual(recoveryIds);
        expect(sim.frozen).toBe(true);
        expect(sim.lockedIds()).toEqual([]);
      }
    });

    it('does not resume a lane after a fault at resume-submissions', () => {
      const sim = makeSim();
      loseQuorum(sim);
      seed(sim);
      const result = runWithTime(makeCtx(sim), { faults: new Set(['resume-submissions']) });
      expect(result.outcome).toBe('contained');
      expect(sim.frozen).toBe(true);
      expect(sim.activeValidators).toEqual(REPLACEMENT);
    });

    it('refuses to activate before the timelock even without injected faults', () => {
      const sim = makeSim();
      loseQuorum(sim);
      const result = runQuorumRunbook(QUORUM_RUNBOOK, makeCtx(sim));
      expect(result).toMatchObject({ outcome: 'contained', failedStep: 'wait-epoch-delay' });
      expect(sim.frozen).toBe(true);
      expect(sim.activeValidators).toEqual(INITIAL);
    });
  });

  describe('a failing fail-safe stage requires manual recovery', () => {
    it.each(recoveryIds)('fail-safe fault at %s', (recoveryStep) => {
      const sim = makeSim();
      loseQuorum(sim);
      seed(sim);
      const result = runWithTime(makeCtx(sim), { faults: new Set(['observe-window', recoveryStep]) });
      expect(result.outcome).toBe('manual-recovery-required');
      expect(result.recovery).not.toContain(recoveryStep);
      expect(sim.frozen).toBe(true);
      expect(sim.invariantViolations()).toEqual([]);
    });

    it('a retried fail-safe run converges without reopening submissions', () => {
      const sim = makeSim();
      loseQuorum(sim);
      seed(sim);
      const ctx = makeCtx(sim);
      const first = runWithTime(ctx, { faults: new Set(['observe-window', 'settle-locked-transfers']) });
      expect(first.outcome).toBe('manual-recovery-required');
      expect(sim.lockedIds()).toEqual(['t1', 't2', 't3']);

      const retry = recoverQuorumRunbook(QUORUM_RUNBOOK, ctx);
      expect(retry.outcome).toBe('contained');
      expect(retry.recovery).toEqual(recoveryIds);
      expect(sim.lockedIds()).toEqual([]);
      expect(sim.frozen).toBe(true);
      expect(sim.escrowHeld).toBe(0n);
      expect(sim.invariantViolations()).toEqual([]);
    });

    it('requires a snapshot before retrying the fail-safe stage', () => {
      expect(() => recoverQuorumRunbook(QUORUM_RUNBOOK, makeCtx(makeSim()))).toThrow(QuorumError);
    });
  });

  describe('accounting holds under interleaved traffic, faults and attackers', () => {
    function rng(seedValue: number): () => number {
      let state = seedValue >>> 0;
      return () => {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
        return state / 2 ** 32;
      };
    }

    it.each(Array.from({ length: 24 }, (_, index) => index + 1))('holds for seed %d', (seedValue) => {
      const rand = rng(seedValue);
      const sim = makeSim();
      loseQuorum(sim);
      let next = 0;
      const messages = new Map<string, import('./validator-quorum-runbook').BridgeMessage>();

      const traffic = (): void => {
        for (let i = 0; i < 5; i++) {
          const action = Math.floor(rand() * 6);
          const locked = sim.lockedIds();
          const id = locked.length ? locked[Math.floor(rand() * locked.length)] : undefined;
          try {
            if (action === 0) {
              const idNew = `t${next++}`;
              const msg = message(idNew, { sender: `user${idNew}`, nonce: 0, amount: BigInt(1 + Math.floor(rand() * 1_000)) });
              sim.deposit(msg);
              messages.set(idNew, msg);
            } else if (action === 1 && id) {
              const signers = sim.activeValidators.slice(0, sim.activeThreshold) as string[];
              sim.execute(messages.get(id), signers);
            } else if (action === 2 && id) {
              const signers = sim.activeValidators.slice(0, sim.activeThreshold) as string[];
              sim.execute(messages.get(id), signers, false);
            } else if (action === 3 && id) {
              sim.refund(id, OPERATOR);
            } else {
              const replayed = [...messages.values()][Math.floor(rand() * Math.max(1, messages.size))];
              if (replayed) sim.deposit(replayed); // replayed id and nonce
            }
          } catch (error) {
            expect(error).toBeInstanceOf(QuorumError);
          }
          expect(sim.invariantViolations()).toEqual([]);
        }
      };

      traffic();
      const initial = sim.snapshotState();
      const faults = new Set<string>();
      const roll = rand();
      if (roll < 0.7) faults.add(nonRecoveryIds[Math.floor(rand() * nonRecoveryIds.length)]);
      if (roll > 0.5) faults.add(recoveryIds[Math.floor(rand() * recoveryIds.length)]);

      let blockedAttacks = 0;
      const result: QuorumRunResult = runWithTime(makeCtx(sim), {
        faults,
        afterStep: () => {
          traffic();
          const before = stable(sim.snapshotState());
          for (const attack of [
            () => sim.freeze(ATTACKER),
            () => sim.unfreeze(ATTACKER),
            () => sim.proposeValidatorSet(ATTACKER, REPLACEMENT, 3),
            () => sim.activateValidatorSet(ATTACKER),
            () => sim.setSignerStatus(ATTACKER, 'v1', 'unavailable'),
            () => sim.refund(sim.lockedIds()[0] ?? 'missing', ATTACKER),
          ]) {
            expect(attack).toThrow(QuorumError);
            blockedAttacks++;
          }
          expect(stable(sim.snapshotState())).toBe(before);
          expect(sim.invariantViolations()).toEqual([]);
        },
      });
      traffic();

      expect(sim.invariantViolations()).toEqual([]);
      expect(sim.extends(initial)).toBe(true);
      expect(['completed', 'aborted', 'contained', 'manual-recovery-required']).toContain(result.outcome);
      expect(blockedAttacks % 6).toBe(0);
      if (result.outcome === 'aborted') expect(sim.frozen).toBe(false);
      if (result.outcome === 'contained' || result.outcome === 'manual-recovery-required') expect(sim.frozen).toBe(true);

      // Operator recovery: settle everything deterministically after the incident.
      if (sim.frozen) sim.unfreeze(OWNER);
      for (const id of sim.lockedIds()) sim.refund(id, OPERATOR);
      const final = sim.snapshotState();
      expect(sim.lockedIds()).toEqual([]);
      expect(final.deposited).toBe(final.delivered + final.refunded);
      expect(sim.invariantViolations()).toEqual([]);
    });
  });
});
