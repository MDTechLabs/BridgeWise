/**
 * Executable model of the contract upgrade and rollback runbook.
 *
 * The runbook is data (`UPGRADE_RUNBOOK`) so it can be validated, checked
 * against its prose document, and executed against a deterministic model of a
 * UUPS-style bridge proxy. The model keeps the escrow accounting that
 * operators rely on, so every path (success, revert, retry, refund, rollback,
 * recovery) can be checked against the same invariants.
 */

// ---------------------------------------------------------------------------
// Runbook definition
// ---------------------------------------------------------------------------

export type RunbookStage =
  | 'preflight'
  | 'approval'
  | 'upgrade'
  | 'verify'
  | 'observe'
  | 'rollback';
export type RunbookRole = 'operator' | 'approver' | 'owner';

export interface RunbookStep {
  id: string;
  stage: RunbookStage;
  role: RunbookRole;
  title: string;
  /** What evidence proves the step worked. */
  verification: string;
  mutates: boolean;
  /** Mutating steps name the step that undoes them. */
  rollbackStepId?: string;
  /** Steps that must appear earlier in the runbook. */
  after?: string[];
}

export const UPGRADE_RUNBOOK: readonly RunbookStep[] = [
  { id: 'verify-provenance', stage: 'preflight', role: 'operator', mutates: false, title: 'Verify the new implementation matches the reviewed commit and compiler settings', verification: 'Provenance record verifies against the reviewed build' },
  { id: 'verify-storage-layout', stage: 'preflight', role: 'operator', mutates: false, title: 'Verify the new implementation is storage-layout compatible and different from the current one', verification: 'Layout is append-only relative to the current implementation' },
  { id: 'snapshot-state', stage: 'preflight', role: 'operator', mutates: false, after: ['verify-storage-layout'], title: 'Capture implementation, pause state and state snapshot; confirm accounting invariants hold', verification: 'Snapshot recorded and invariants hold' },
  { id: 'approve-upgrade', stage: 'approval', role: 'approver', mutates: false, after: ['verify-provenance', 'snapshot-state'], title: 'Independent approver signs off; approver is not the operator', verification: 'Approval recorded by an authorized approver other than the operator' },
  { id: 'pause-bridge', stage: 'upgrade', role: 'owner', mutates: true, rollbackStepId: 'resume-bridge', after: ['approve-upgrade'], title: 'Pause new deposits and executions', verification: 'Bridge reports paused' },
  { id: 'upgrade-implementation', stage: 'upgrade', role: 'owner', mutates: true, rollbackStepId: 'rollback-implementation', after: ['approve-upgrade', 'pause-bridge'], title: 'Upgrade the proxy to the approved implementation', verification: 'Proxy implementation equals the approved address' },
  { id: 'verify-post-upgrade', stage: 'verify', role: 'operator', mutates: false, after: ['upgrade-implementation'], title: 'Verify implementation, preserved state and accounting invariants', verification: 'Prior state is preserved and invariants hold' },
  { id: 'unpause-bridge', stage: 'verify', role: 'owner', mutates: true, rollbackStepId: 'ensure-paused', after: ['verify-post-upgrade'], title: 'Resume deposits and executions', verification: 'Bridge reports unpaused' },
  { id: 'observe-window', stage: 'observe', role: 'operator', mutates: false, after: ['unpause-bridge'], title: 'Observe through the agreed window; any invariant breach triggers rollback', verification: 'Invariants hold for the whole window' },
  { id: 'ensure-paused', stage: 'rollback', role: 'owner', mutates: true, rollbackStepId: 'resume-bridge', title: 'Pause the bridge if it is not already paused', verification: 'Bridge reports paused' },
  { id: 'rollback-implementation', stage: 'rollback', role: 'owner', mutates: true, rollbackStepId: 'upgrade-implementation', after: ['ensure-paused'], title: 'Restore the implementation recorded in the snapshot', verification: 'Proxy implementation equals the snapshot implementation' },
  { id: 'verify-post-rollback', stage: 'rollback', role: 'operator', mutates: false, after: ['rollback-implementation'], title: 'Verify implementation equals the snapshot, prior state is preserved and invariants hold', verification: 'Prior state is preserved and invariants hold' },
  { id: 'reconcile-in-flight', stage: 'rollback', role: 'operator', mutates: false, after: ['verify-post-rollback'], title: 'List locked transfers for manual retry or refund decisions', verification: 'Every locked transfer is accounted for in escrow' },
  { id: 'resume-bridge', stage: 'rollback', role: 'owner', mutates: true, rollbackStepId: 'ensure-paused', after: ['reconcile-in-flight'], title: 'Resume only if the bridge was live before the change and verification passed', verification: 'Bridge pause state equals the snapshot' },
];

/** Returns human-readable problems; an empty list means the runbook is well formed. */
export function validateRunbook(steps: readonly RunbookStep[]): string[] {
  const problems: string[] = [];
  const index = new Map<string, number>();
  steps.forEach((step, i) => {
    if (!step || typeof step.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(step.id)) {
      problems.push(`step ${i} has an invalid id`);
      return;
    }
    if (index.has(step.id)) problems.push(`duplicate step id: ${step.id}`);
    index.set(step.id, i);
    if (!step.title?.trim()) problems.push(`${step.id}: title is required`);
    if (!step.verification?.trim()) problems.push(`${step.id}: verification is required`);
    if (!['operator', 'approver', 'owner'].includes(step.role)) {
      problems.push(`${step.id}: unknown role`);
    }
  });

  const stageOrder: RunbookStage[] = ['preflight', 'approval', 'upgrade', 'verify', 'observe', 'rollback'];
  let lastStage = -1;
  for (const step of steps) {
    const stage = stageOrder.indexOf(step.stage);
    if (stage < 0) {
      problems.push(`${step.id}: unknown stage`);
      continue;
    }
    if (stage < lastStage) problems.push(`${step.id}: stage ${step.stage} is out of order`);
    lastStage = Math.max(lastStage, stage);
  }
  for (const stage of stageOrder) {
    if (!steps.some((step) => step.stage === stage)) problems.push(`missing stage: ${stage}`);
  }

  for (const step of steps) {
    for (const dependency of step.after ?? []) {
      const at = index.get(dependency);
      if (at === undefined) problems.push(`${step.id}: unknown dependency ${dependency}`);
      else if (at >= (index.get(step.id) ?? -1)) problems.push(`${step.id}: dependency ${dependency} must appear earlier`);
    }
    if (step.mutates) {
      const target = step.rollbackStepId ? steps.find((s) => s.id === step.rollbackStepId) : undefined;
      if (!target) problems.push(`${step.id}: mutating step needs an existing rollbackStepId`);
      else if (!target.mutates || target.id === step.id) problems.push(`${step.id}: rollbackStepId must be a different mutating step`);
    }
    if (step.role === 'approver' && step.mutates) problems.push(`${step.id}: approvers must not perform mutations`);
  }

  const approval = steps.find((s) => s.stage === 'approval');
  const firstMutation = steps.findIndex((s) => s.mutates && s.stage !== 'rollback');
  if (!approval || approval.role !== 'approver') problems.push('approval stage must be performed by an approver');
  if (approval && firstMutation >= 0 && steps.indexOf(approval) > firstMutation) {
    problems.push('approval must come before the first mutating step');
  }
  const upgrade = steps.find((s) => s.id === 'upgrade-implementation');
  if (upgrade && !(upgrade.after ?? []).includes('pause-bridge')) {
    problems.push('upgrade-implementation must follow pause-bridge');
  }
  const verifyGate = steps.find((s) => s.id === 'unpause-bridge');
  if (verifyGate && !(verifyGate.after ?? []).includes('verify-post-upgrade')) {
    problems.push('unpause-bridge must follow verify-post-upgrade');
  }
  return problems;
}

/** Step ids that the prose runbook does not mention in backticks. */
export function findUndocumentedSteps(steps: readonly RunbookStep[], docText: string): string[] {
  return steps.filter((step) => !docText.includes(`\`${step.id}\``)).map((step) => step.id);
}

// ---------------------------------------------------------------------------
// Bridge proxy model
// ---------------------------------------------------------------------------

export class SimError extends Error {}

type TransferStatus = 'locked' | 'executed' | 'refunded';

export interface SimSnapshot {
  owner: string;
  transfers: Array<[string, bigint, TransferStatus]>;
  deposited: bigint;
  delivered: bigint;
  refunded: bigint;
}

export class BridgeProxySim {
  private impl: string;
  private paused = false;
  private readonly transfers = new Map<string, { amount: bigint; status: TransferStatus }>();
  private escrowHeld = 0n;
  private deposited = 0n;
  private delivered = 0n;
  private refunded = 0n;

  /** `layouts` maps implementation id -> ordered storage slot names. */
  constructor(
    readonly owner: string,
    initialImpl: string,
    private readonly layouts: Readonly<Record<string, readonly string[]>>,
  ) {
    if (!layouts[initialImpl]) throw new SimError('unknown initial implementation');
    this.impl = initialImpl;
  }

  get implementation(): string {
    return this.impl;
  }
  get isPaused(): boolean {
    return this.paused;
  }

  pause(caller: string): void {
    this.onlyOwner(caller);
    if (this.paused) throw new SimError('already paused');
    this.paused = true;
  }
  unpause(caller: string): void {
    this.onlyOwner(caller);
    if (!this.paused) throw new SimError('not paused');
    this.paused = false;
  }

  /** Same-or-different implementation must extend the current layout or be a prefix of it. */
  isUpgradeSafe(candidate: string): boolean {
    const next = this.layouts[candidate];
    const current = this.layouts[this.impl];
    if (!next || candidate === this.impl) return false;
    const prefix = (a: readonly string[], b: readonly string[]) => a.length <= b.length && a.every((slot, i) => b[i] === slot);
    return prefix(current, next) || prefix(next, current);
  }

  upgradeTo(caller: string, candidate: string): void {
    this.onlyOwner(caller);
    if (candidate === this.impl) throw new SimError('already at implementation');
    if (!this.isUpgradeSafe(candidate)) throw new SimError('unsafe or unknown implementation');
    this.impl = candidate;
  }

  deposit(id: string, amount: bigint): void {
    if (this.paused) throw new SimError('paused');
    if (amount <= 0n) throw new SimError('amount must be positive');
    if (this.transfers.has(id)) throw new SimError('duplicate transfer id');
    this.transfers.set(id, { amount, status: 'locked' });
    this.escrowHeld += amount;
    this.deposited += amount;
  }

  /** A destination failure reverts the whole call and changes nothing (safe to retry). */
  execute(id: string, destinationAccepts: boolean): void {
    if (this.paused) throw new SimError('paused');
    const transfer = this.mustLocked(id);
    if (!destinationAccepts) throw new SimError('destination reverted');
    transfer.status = 'executed';
    this.escrowHeld -= transfer.amount;
    this.delivered += transfer.amount;
  }

  /** Refunds stay available while paused so users can always recover funds. */
  refund(id: string): void {
    const transfer = this.mustLocked(id);
    transfer.status = 'refunded';
    this.escrowHeld -= transfer.amount;
    this.refunded += transfer.amount;
  }

  lockedIds(): string[] {
    return [...this.transfers].filter(([, t]) => t.status === 'locked').map(([id]) => id);
  }

  /** Copy of user-visible state, used to prove an upgrade or rollback preserved it. */
  snapshotState(): SimSnapshot {
    return {
      owner: this.owner,
      transfers: [...this.transfers].map(([id, t]) => [id, t.amount, t.status]),
      deposited: this.deposited,
      delivered: this.delivered,
      refunded: this.refunded,
    };
  }

  /**
   * True if the current state is a legitimate continuation of `previous`:
   * nothing was lost, rewritten or un-settled. Deposits, executions and
   * refunds that happened since are allowed (refunds stay open while paused).
   */
  extends(previous: SimSnapshot): boolean {
    if (previous.owner !== this.owner) return false;
    if (this.deposited < previous.deposited || this.delivered < previous.delivered || this.refunded < previous.refunded) return false;
    return previous.transfers.every(([id, amount, status]) => {
      const now = this.transfers.get(id);
      if (!now || now.amount !== amount) return false;
      return now.status === status || status === 'locked';
    });
  }

  /** Accounting invariants; an empty list means all hold. */
  invariantViolations(): string[] {
    const out: string[] = [];
    let locked = 0n;
    let executed = 0n;
    let refunded = 0n;
    for (const t of this.transfers.values()) {
      if (t.status === 'locked') locked += t.amount;
      else if (t.status === 'executed') executed += t.amount;
      else refunded += t.amount;
    }
    if (this.deposited !== this.escrowHeld + this.delivered + this.refunded) out.push('conservation: deposited != held + delivered + refunded');
    if (this.escrowHeld !== locked) out.push('escrow: held != sum of locked transfers');
    if (this.delivered !== executed) out.push('delivery: delivered != sum of executed transfers');
    if (this.refunded !== refunded) out.push('refund: refunded != sum of refunded transfers');
    if (this.escrowHeld < 0n || this.delivered < 0n || this.refunded < 0n) out.push('negative balance');
    return out;
  }

  private mustLocked(id: string): { amount: bigint; status: TransferStatus } {
    const transfer = this.transfers.get(id);
    if (!transfer) throw new SimError('unknown transfer');
    if (transfer.status !== 'locked') throw new SimError('transfer already settled');
    return transfer;
  }

  private onlyOwner(caller: string): void {
    if (caller !== this.owner) throw new SimError('caller is not the owner');
  }
}

// ---------------------------------------------------------------------------
// Runbook executor
// ---------------------------------------------------------------------------

export interface RunbookContext {
  sim: BridgeProxySim;
  owner: string;
  operator: string;
  approver: string;
  authorizedApprovers: readonly string[];
  newImpl: string;
  /** Result of verifying the provenance record against the reviewed build. */
  provenanceVerified: boolean;
  snapshot?: { implementation: string; paused: boolean; state: SimSnapshot };
  approvedBy?: string;
  upgradeVerified?: boolean;
  rollbackVerified?: boolean;
}

export interface RunOptions {
  /** Fault injection: these step ids fail before doing any work. */
  faults?: ReadonlySet<string>;
  /** Called after every step so tests can interleave user traffic. */
  afterStep?: (stepId: string, ctx: RunbookContext) => void;
}

export type RunOutcome = 'completed' | 'aborted' | 'rolled-back' | 'manual-recovery-required';

export interface RunResult {
  outcome: RunOutcome;
  failedStep?: string;
  applied: string[];
  rollback: string[];
  log: Array<{ step: string; status: 'ok' | 'failed' }>;
}

type Handler = (ctx: RunbookContext) => void;

const HANDLERS: Record<string, Handler> = {
  'verify-provenance': (c) => {
    if (!c.provenanceVerified) throw new SimError('provenance not verified');
  },
  'verify-storage-layout': (c) => {
    if (!c.sim.isUpgradeSafe(c.newImpl)) throw new SimError('implementation is not an upgrade-safe change');
  },
  'snapshot-state': (c) => {
    const violations = c.sim.invariantViolations();
    if (violations.length) throw new SimError(`invariants broken before upgrade: ${violations[0]}`);
    c.snapshot = { implementation: c.sim.implementation, paused: c.sim.isPaused, state: c.sim.snapshotState() };
  },
  'approve-upgrade': (c) => {
    if (!c.authorizedApprovers.includes(c.approver)) throw new SimError('approver is not authorized');
    if (c.approver === c.operator || c.approver === c.owner) throw new SimError('approver must be independent');
    c.approvedBy = c.approver;
  },
  'pause-bridge': (c) => {
    requireApproval(c);
    if (!c.sim.isPaused) c.sim.pause(c.owner);
  },
  'upgrade-implementation': (c) => {
    requireApproval(c);
    if (!c.sim.isPaused) throw new SimError('bridge must be paused before upgrading');
    c.sim.upgradeTo(c.owner, c.newImpl);
  },
  'verify-post-upgrade': (c) => {
    verifyAgainstSnapshot(c, c.newImpl);
    c.upgradeVerified = true;
  },
  'unpause-bridge': (c) => {
    if (!c.upgradeVerified) throw new SimError('upgrade not verified');
    // A bridge that was already paused (for example by an incident) stays paused.
    if (!need(c.snapshot).paused && c.sim.isPaused) c.sim.unpause(c.owner);
  },
  'observe-window': (c) => {
    const violations = c.sim.invariantViolations();
    if (violations.length) throw new SimError(violations[0]);
  },
  'ensure-paused': (c) => {
    if (!c.sim.isPaused) c.sim.pause(c.owner);
  },
  'rollback-implementation': (c) => {
    // Restore the snapshot implementation, not "the previous one", so re-running
    // the runbook after a successful upgrade can never downgrade it.
    const target = need(c.snapshot).implementation;
    if (c.sim.implementation !== target) c.sim.upgradeTo(c.owner, target);
  },
  'verify-post-rollback': (c) => {
    verifyAgainstSnapshot(c, need(c.snapshot).implementation);
    c.rollbackVerified = true;
  },
  'reconcile-in-flight': (c) => {
    const violations = c.sim.invariantViolations();
    if (violations.length) throw new SimError(violations[0]);
  },
  'resume-bridge': (c) => {
    if (!c.rollbackVerified) throw new SimError('rollback not verified');
    if (!need(c.snapshot).paused && c.sim.isPaused) c.sim.unpause(c.owner);
  },
};

function makeRunner(ctx: RunbookContext, options: RunOptions, result: RunResult) {
  return (step: RunbookStep): void => {
    try {
      if (options.faults?.has(step.id)) throw new SimError(`injected fault at ${step.id}`);
      const handler = HANDLERS[step.id];
      if (!handler) throw new SimError(`no handler for ${step.id}`);
      handler(ctx);
      const violations = ctx.sim.invariantViolations();
      if (violations.length) throw new SimError(violations[0]);
      result.log.push({ step: step.id, status: 'ok' });
    } catch (error) {
      result.log.push({ step: step.id, status: 'failed' });
      throw error;
    }
  };
}

export function runRunbook(
  steps: readonly RunbookStep[],
  ctx: RunbookContext,
  options: RunOptions = {},
): RunResult {
  const problems = validateRunbook(steps);
  if (problems.length) throw new SimError(`invalid runbook: ${problems[0]}`);

  const result: RunResult = { outcome: 'completed', applied: [], rollback: [], log: [] };
  const run = makeRunner(ctx, options, result);

  for (const step of steps.filter((s) => s.stage !== 'rollback')) {
    try {
      run(step);
      if (step.mutates) result.applied.push(step.id);
    } catch {
      result.failedStep = step.id;
      // A mutating step that threw before changing state is not "applied", but
      // earlier mutations (such as the pause) still need to be unwound.
      if (result.applied.length === 0) {
        result.outcome = 'aborted';
        return result;
      }
      return rollBack(steps, ctx, result, run, options);
    }
    options.afterStep?.(step.id, ctx);
  }
  return result;
}

/**
 * Re-runs only the rollback stage after `manual-recovery-required`, using the
 * snapshot captured by the original run. Every rollback step is idempotent.
 */
export function recoverRunbook(
  steps: readonly RunbookStep[],
  ctx: RunbookContext,
  options: RunOptions = {},
): RunResult {
  const problems = validateRunbook(steps);
  if (problems.length) throw new SimError(`invalid runbook: ${problems[0]}`);
  need(ctx.snapshot);
  const result: RunResult = { outcome: 'rolled-back', applied: [], rollback: [], log: [] };
  return rollBack(steps, ctx, result, makeRunner(ctx, options, result), options);
}

function rollBack(
  steps: readonly RunbookStep[],
  ctx: RunbookContext,
  result: RunResult,
  run: (step: RunbookStep) => void,
  options: RunOptions,
): RunResult {
  for (const step of steps.filter((s) => s.stage === 'rollback')) {
    try {
      run(step);
      result.rollback.push(step.id);
    } catch {
      // Fail safe: never leave the bridge open when rollback could not be proven.
      try {
        if (!ctx.sim.isPaused) ctx.sim.pause(ctx.owner);
      } catch {
        // Pause failed too; the outcome below already requires manual recovery.
      }
      result.outcome = 'manual-recovery-required';
      return result;
    }
    options.afterStep?.(step.id, ctx);
  }
  result.outcome = 'rolled-back';
  return result;
}

function requireApproval(c: RunbookContext): void {
  if (!c.approvedBy) throw new SimError('upgrade has not been approved');
}

function need<T>(value: T | undefined): T {
  if (value === undefined) throw new SimError('snapshot missing');
  return value;
}

function verifyAgainstSnapshot(c: RunbookContext, expectedImpl: string): void {
  const snapshot = need(c.snapshot);
  if (c.sim.implementation !== expectedImpl) throw new SimError('unexpected implementation');
  if (!c.sim.extends(snapshot.state)) throw new SimError('state was lost or rewritten');
  const violations = c.sim.invariantViolations();
  if (violations.length) throw new SimError(violations[0]);
}
