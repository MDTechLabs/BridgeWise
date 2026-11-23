/**
 * Executable model of the validator quorum loss and recovery runbook.
 *
 * The runbook is data (`QUORUM_RUNBOOK`) so it can be validated, checked
 * against its prose document, and executed against a deterministic model of a
 * validator set, signer availability and bridge escrow. Every path (success,
 * revert, retry, refund, containment and manual recovery) is checked against
 * the same accounting and replay invariants.
 *
 * This is an operational model, not a substitute for an independent contract
 * audit. Security-critical values (validator set, threshold, epoch delay,
 * overlap window, chain IDs and bridge address) come from the approved change
 * record or deployment inventory, never from RPC or relayer data.
 */

// ---------------------------------------------------------------------------
// Runbook definition
// ---------------------------------------------------------------------------

export type QuorumStage =
  | 'detect'
  | 'contain'
  | 'approve'
  | 'restore'
  | 'verify'
  | 'observe'
  | 'recovery';

export type QuorumRole = 'operator' | 'owner' | 'approver';

export interface QuorumRunbookStep {
  id: string;
  stage: QuorumStage;
  role: QuorumRole;
  title: string;
  /** What evidence proves the step worked. */
  verification: string;
  mutates: boolean;
  /**
   * Fail-safe step to run if this step (or a later one) fails. Some on-chain
   * changes cannot be atomically undone; for those, the fail-safe is to keep
   * submissions frozen and settle locked transfers, never to bypass EPOCH_DELAY.
   */
  recoveryStepId?: string;
  /** Steps that must appear earlier in the runbook. */
  after?: string[];
}

export const QUORUM_RUNBOOK: readonly QuorumRunbookStep[] = [
  { id: 'confirm-quorum-loss', stage: 'detect', role: 'operator', mutates: false, title: 'Confirm quorum loss from two independent sources before declaring an incident', verification: 'Two independent observations agree that ready signers are below the active threshold' },
  { id: 'snapshot-validator-state', stage: 'detect', role: 'operator', mutates: false, after: ['confirm-quorum-loss'], title: 'Capture validator set, threshold, timings, pause state and transfer snapshot; check invariants', verification: 'Snapshot recorded and accounting invariants hold' },
  { id: 'classify-loss-cause', stage: 'detect', role: 'operator', mutates: false, after: ['snapshot-validator-state'], title: 'Classify the cause as signer outage, key compromise, set error, RPC/reorg or unknown', verification: 'Cause and supporting evidence recorded in the restricted incident record' },
  { id: 'freeze-submissions', stage: 'contain', role: 'owner', mutates: true, recoveryStepId: 'ensure-frozen', after: ['classify-loss-cause'], title: 'Freeze new deposits and executions on the affected lanes; refunds stay available', verification: 'Affected lanes report frozen' },
  { id: 'list-locked-transfers', stage: 'contain', role: 'operator', mutates: false, after: ['freeze-submissions'], title: 'List every locked transfer with its lane, amount, nonce and retry/refund decision', verification: 'Every locked transfer is accounted for in escrow' },
  { id: 'approve-recovery-plan', stage: 'approve', role: 'approver', mutates: false, after: ['classify-loss-cause', 'list-locked-transfers'], title: 'Independent approver signs off on the reviewed validator set, threshold and recovery plan', verification: 'Approval recorded by an authorized approver who is neither operator nor owner' },
  { id: 'verify-reviewed-parameters', stage: 'restore', role: 'operator', mutates: false, after: ['approve-recovery-plan'], title: 'Verify reviewed set, threshold, epoch delay and overlap window against the change record and deployment inventory', verification: 'All parameters match the reviewed record; no value came from RPC or relayer data' },
  { id: 'propose-validator-set', stage: 'restore', role: 'owner', mutates: true, recoveryStepId: 'ensure-frozen', after: ['verify-reviewed-parameters'], title: 'Propose the reviewed validator set and threshold with the on-chain epoch delay', verification: 'ValidatorSetProposed matches the reviewed set, threshold and activation time' },
  { id: 'provision-signer-keys', stage: 'restore', role: 'operator', mutates: true, recoveryStepId: 'ensure-frozen', after: ['approve-recovery-plan', 'propose-validator-set'], title: 'Provision replacement signing material through the secret manager and mark the reviewed signers available', verification: 'Each reviewed signer reports available through an independent probe; no key material in logs' },
  { id: 'wait-epoch-delay', stage: 'restore', role: 'operator', mutates: false, after: ['propose-validator-set'], title: 'Wait for the on-chain activation time; do not assume wall-clock or relayer time', verification: 'Finalized chain time is at or beyond pendingActiveAt' },
  { id: 'activate-validator-set', stage: 'restore', role: 'owner', mutates: true, recoveryStepId: 'ensure-frozen', after: ['wait-epoch-delay', 'provision-signer-keys'], title: 'Activate the pending validator set after the timelock expires', verification: 'ValidatorSetActivated matches the reviewed set and threshold' },
  { id: 'verify-quorum-restored', stage: 'verify', role: 'operator', mutates: false, after: ['activate-validator-set'], title: 'Verify active set, threshold, signer availability and replay protections', verification: 'Ready signers meet the active threshold; no pending proposal; invariants hold' },
  { id: 'canary-probe', stage: 'verify', role: 'operator', mutates: false, after: ['verify-quorum-restored'], title: 'Dry-run a unique canary message under the restored set without consuming a nonce', verification: 'Canary passes domain, deadline, ordering, distinctness and quorum checks; replay is rejected' },
  { id: 'resume-submissions', stage: 'verify', role: 'owner', mutates: true, recoveryStepId: 'ensure-frozen', after: ['canary-probe'], title: 'Resume submissions only after verification; keep an incident-frozen lane frozen', verification: 'Lane pause state matches the pre-incident snapshot' },
  { id: 'observe-window', stage: 'observe', role: 'operator', mutates: false, after: ['resume-submissions'], title: 'Observe quorum, invariants and replay alerts through the agreed confirmation window', verification: 'Invariants hold for the whole window; any breach restarts containment' },
  { id: 'ensure-frozen', stage: 'recovery', role: 'owner', mutates: true, recoveryStepId: 'freeze-submissions', title: 'Keep submissions frozen after any failure; never resume on an unproven set', verification: 'Affected lanes report frozen' },
  { id: 'settle-locked-transfers', stage: 'recovery', role: 'operator', mutates: true, recoveryStepId: 'ensure-frozen', after: ['ensure-frozen'], title: 'Refund locked transfers while frozen; retry only messages with proven, unexecuted nonces', verification: 'Escrow equals the remaining locked transfers; no transfer settles twice' },
  { id: 'record-recovery-evidence', stage: 'recovery', role: 'operator', mutates: false, after: ['settle-locked-transfers'], title: 'Record step outcomes, event references and the manual escalation decision', verification: 'Restricted incident record contains the evidence and accounting snapshot' },
];

/** Human-readable problems; an empty list means the runbook is well formed. */
export function validateRunbook(steps: readonly QuorumRunbookStep[]): string[] {
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
    if (!['operator', 'owner', 'approver'].includes(step.role)) problems.push(`${step.id}: unknown role`);
  });

  const stageOrder: QuorumStage[] = ['detect', 'contain', 'approve', 'restore', 'verify', 'observe', 'recovery'];
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
      const target = step.recoveryStepId ? steps.find((s) => s.id === step.recoveryStepId) : undefined;
      if (!target) problems.push(`${step.id}: mutating step needs an existing recoveryStepId`);
      else if (!target.mutates || target.id === step.id) problems.push(`${step.id}: recoveryStepId must be a different mutating step`);
    }
    if (step.role === 'approver' && step.mutates) problems.push(`${step.id}: approvers must not perform mutations`);
  }

  const freeze = steps.find((s) => s.id === 'freeze-submissions');
  const firstMutation = steps.findIndex((s) => s.mutates && s.stage !== 'recovery');
  if (!freeze || firstMutation < 0 || steps.indexOf(freeze) !== firstMutation) {
    problems.push('freeze-submissions must be the first mutating step');
  }
  const approval = steps.find((s) => s.stage === 'approve');
  const firstRestore = steps.findIndex((s) => s.stage === 'restore' && s.mutates);
  if (!approval || approval.role !== 'approver') problems.push('approval stage must be performed by an approver');
  if (approval && firstRestore >= 0 && steps.indexOf(approval) > firstRestore) {
    problems.push('approval must come before the first restoring mutation');
  }
  const activation = steps.find((s) => s.id === 'activate-validator-set');
  if (activation && !['wait-epoch-delay', 'provision-signer-keys'].every((id) => (activation.after ?? []).includes(id))) {
    problems.push('activate-validator-set must follow wait-epoch-delay and provision-signer-keys');
  }
  const resume = steps.find((s) => s.id === 'resume-submissions');
  if (resume && !(resume.after ?? []).includes('canary-probe')) {
    problems.push('resume-submissions must follow canary-probe');
  }
  if (!steps.some((s) => s.stage === 'recovery' && s.id === 'ensure-frozen')) {
    problems.push('recovery stage must contain ensure-frozen');
  }
  return problems;
}

/** Step ids that the prose runbook does not mention in backticks. */
export function findUndocumentedSteps(steps: readonly QuorumRunbookStep[], docText: string): string[] {
  return steps.filter((step) => !docText.includes(`\`${step.id}\``)).map((step) => step.id);
}

// ---------------------------------------------------------------------------
// Validator / signer / escrow model
// ---------------------------------------------------------------------------

export const MAX_VALIDATORS = 64;
export const MAX_BUNDLE_SIZE = 64;
export const MAX_ID_LENGTH = 200;

export type SignerStatus = 'ready' | 'degraded' | 'unavailable';
export type TransferStatus = 'locked' | 'executed' | 'refunded';
export type LossCause = 'signer-outage' | 'key-compromise' | 'set-error' | 'rpc-or-reorg' | 'unknown';

export interface BridgeMessage {
  id: string;
  sourceChainId: string;
  targetChainId: string;
  bridgeAddress: string;
  version: string;
  sender: string;
  amount: bigint;
  nonce: number;
  deadline: number;
}

export interface QuorumDecision {
  ok: boolean;
  code: string;
  count: number;
  threshold: number;
  setId: 'active' | 'outgoing' | 'none';
}

export interface CanaryResult {
  accepted: boolean;
  replayRejected: boolean;
  stateUnchanged: boolean;
}

interface InternalState {
  currentTime: number;
  isFrozen: boolean;
  validators: string[];
  thresholdValue: number;
  outgoing: string[];
  outgoingQuorumValue: number;
  overlapEnd: number;
  pending: string[];
  pendingThresholdValue: number;
  pendingAt: number;
  signers: Array<[string, SignerStatus]>;
  transfers: Map<string, { amount: bigint; status: TransferStatus; source: string; nonce: number }>;
  executedIds: string[];
  nonces: Array<[string, number]>;
  held: bigint;
  deposited: bigint;
  delivered: bigint;
  refunded: bigint;
}

export interface ValidatorSnapshot {
  state: BridgeState;
  epochDelay: number;
  overlapWindow: number;
  frozenBefore: boolean;
}

export interface BridgeState {
  now: number;
  frozen: boolean;
  owner: string;
  proposer: string;
  activeValidators: string[];
  activeThreshold: number;
  outgoingValidators: string[];
  overlapUntil: number;
  pendingValidators: string[];
  pendingThreshold: number;
  pendingActiveAt: number;
  signers: Array<[string, SignerStatus]>;
  transfers: Array<[string, bigint, TransferStatus]>;
  executedIds: string[];
  deposited: bigint;
  delivered: bigint;
  refunded: bigint;
}

export class QuorumError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ?? code);
    this.name = 'QuorumError';
  }
}

export interface ValidatorQuorumSimOptions {
  owner: string;
  proposer: string;
  operator: string;
  chainId: string;
  lanes: readonly string[];
  bridgeAddress: string;
  domainVersion: string;
  epochDelay: number;
  overlapWindow: number;
  initialValidators: readonly string[];
  threshold: number;
  /** All signer ids known to the deployment, including spare/replacement keys. */
  knownSigners?: readonly string[];
  now?: number;
}

export class ValidatorQuorumSim {
  private currentTime: number;
  private isFrozen = false;
  private readonly validators: string[];
  private thresholdValue: number;
  private outgoing: string[] = [];
  private outgoingQuorumValue = 0;
  private overlapEnd = 0;
  private pending: string[] = [];
  private pendingThresholdValue = 0;
  private pendingAt = 0;
  private readonly signerStatus = new Map<string, SignerStatus>();
  private readonly transfers = new Map<string, { amount: bigint; status: TransferStatus; source: string; nonce: number }>();
  private readonly executedIds = new Set<string>();
  private readonly nonces = new Map<string, number>();
  private held = 0n;
  private depositedTotal = 0n;
  private deliveredTotal = 0n;
  private refundedTotal = 0n;

  constructor(readonly options: ValidatorQuorumSimOptions) {
    if (!Number.isSafeInteger(options.epochDelay) || options.epochDelay <= 0) throw new QuorumError('invalid-epoch-delay');
    if (!Number.isSafeInteger(options.overlapWindow) || options.overlapWindow < 0) throw new QuorumError('invalid-overlap-window');
    if (!Number.isSafeInteger(options.now ?? 0) || (options.now ?? 0) < 0) throw new QuorumError('invalid-clock');
    this.currentTime = options.now ?? 1_000_000;
    this.validators = assertValidatorSet(options.initialValidators);
    this.thresholdValue = assertThreshold(options.threshold, this.validators.length);
    for (const id of options.knownSigners ?? []) this.assertSignerId(id);
    for (const id of this.validators) this.signerStatus.set(id, 'ready');
  }

  get now(): number {
    return this.currentTime;
  }
  get frozen(): boolean {
    return this.isFrozen;
  }
  get epochDelay(): number {
    return this.options.epochDelay;
  }
  get overlapWindow(): number {
    return this.options.overlapWindow;
  }
  get activeValidators(): readonly string[] {
    return [...this.validators];
  }
  get activeThreshold(): number {
    return this.thresholdValue;
  }
  get pendingActiveAt(): number {
    return this.pendingAt;
  }
  get hasPendingProposal(): boolean {
    return this.pendingAt > 0;
  }
  get escrowHeld(): bigint {
    return this.held;
  }

  /** Monotonic chain time; tests use it to model blocks and finality. */
  setNow(value: number): void {
    if (!Number.isSafeInteger(value) || value < this.currentTime) throw new QuorumError('clock-must-not-go-backwards');
    this.currentTime = value;
  }

  freeze(caller: string): void {
    this.onlyOwner(caller);
    this.isFrozen = true; // idempotent so recovery can always be retried
  }

  unfreeze(caller: string): void {
    this.onlyOwner(caller);
    this.isFrozen = false;
  }

  setSignerStatus(caller: string, signerId: string, status: SignerStatus): void {
    this.onlyOperatorOrOwner(caller);
    this.assertSignerId(signerId);
    if (!['ready', 'degraded', 'unavailable'].includes(status)) throw new QuorumError('invalid-signer-status');
    this.signerStatus.set(signerId, status);
  }

  isQuorumReady(): boolean {
    return this.readyCount(this.validators) >= this.thresholdValue;
  }

  /** Propose the reviewed set; the timelock starts at the current chain time. */
  proposeValidatorSet(caller: string, validators: readonly string[], threshold: number): number {
    this.onlyOwner(caller);
    const set = assertValidatorSet(validators);
    const quorum = assertThreshold(threshold, set.length);
    if (this.pendingAt > 0) throw new QuorumError('proposal-already-pending');
    for (const id of set) this.assertSignerId(id);
    this.pending = [...set];
    this.pendingThresholdValue = quorum;
    this.pendingAt = this.currentTime + this.epochDelay;
    return this.pendingAt;
  }

  activateValidatorSet(caller: string): void {
    this.onlyOwner(caller);
    if (this.pendingAt === 0) throw new QuorumError('no-pending-proposal');
    if (this.currentTime < this.pendingAt) throw new QuorumError('timelock-not-expired');
    this.outgoing = [...this.validators];
    this.outgoingQuorumValue = this.thresholdValue;
    this.validators.splice(0, this.validators.length, ...this.pending);
    this.thresholdValue = this.pendingThresholdValue;
    this.overlapEnd = this.currentTime + this.overlapWindow;
    this.pending = [];
    this.pendingThresholdValue = 0;
    this.pendingAt = 0;
  }

  /**
   * Read-only quorum check. Signer ids must be strictly ascending, distinct,
   * belong to exactly one set (active, or outgoing during the overlap window),
   * and be marked ready. A bundle over the bound is rejected before any entry
   * is read, so hostile input cannot drive unbounded work.
   */
  verifyBundle(signerIds: readonly string[], message?: BridgeMessage): QuorumDecision {
    const deny = (code: string, setId: QuorumDecision['setId'] = 'none'): QuorumDecision => ({
      ok: false,
      code,
      count: 0,
      threshold: this.thresholdValue,
      setId,
    });

    if (!Array.isArray(signerIds) || signerIds.length > MAX_BUNDLE_SIZE || signerIds.length === 0) {
      return deny('bundle-size');
    }
    for (let i = 0; i < signerIds.length; i++) {
      if (i > 0 && signerIds[i - 1] >= signerIds[i]) return deny('bundle-not-ascending-or-duplicate');
      if (!this.signerStatus.has(signerIds[i])) return deny('unknown-signer');
      if (this.signerStatus.get(signerIds[i]) !== 'ready') return deny('signer-not-ready');
    }
    const inActive = signerIds.every((id) => this.validators.includes(id));
    const inOutgoing = signerIds.every((id) => this.outgoing.includes(id));
    const setId: QuorumDecision['setId'] = inActive ? 'active' : this.currentTime <= this.overlapEnd && inOutgoing ? 'outgoing' : 'none';
    if (setId === 'none') return deny('mixed-or-stale-set');

    const threshold = setId === 'active' ? this.thresholdValue : this.outgoingQuorumValue;
    if (signerIds.length < threshold) return deny('below-threshold', setId);
    if (message) {
      const domainError = this.domainError(message);
      if (domainError) return deny(domainError, setId);
    }
    return { ok: true, code: 'quorum-met', count: signerIds.length, threshold, setId };
  }

  /** Dry run of signature and domain checks; performs no state change. */
  canQuorumExecute(message: BridgeMessage, signerIds: readonly string[]): QuorumDecision {
    if (this.isFrozen) return { ok: false, code: 'frozen', count: 0, threshold: this.thresholdValue, setId: 'none' };
    if (this.executedIds.has(message.id)) return { ok: false, code: 'message-already-executed', count: 0, threshold: this.thresholdValue, setId: 'none' };
    const transfer = this.transfers.get(message.id);
    if (!transfer || transfer.status !== 'locked') return { ok: false, code: 'unknown-or-settled-transfer', count: 0, threshold: this.thresholdValue, setId: 'none' };
    return this.verifyBundle(signerIds, message);
  }

  /**
   * Full canary: deposit, execute, then replay execute inside a rolled-back
   * simulation. This proves acceptance and replay rejection without consuming
   * a real nonce or leaving a locked transfer behind.
   */
  probeExecution(message: BridgeMessage, signerIds: readonly string[]): CanaryResult {
    const before = stableStringify(this.snapshotState());
    const result: CanaryResult = { accepted: false, replayRejected: false, stateUnchanged: true };
    try {
      this.simulate(() => {
        // The canary is a rolled-back dry run: it may exercise a frozen lane
        // without ever reopening it or consuming a real nonce.
        this.isFrozen = false;
        if (!this.transfers.has(message.id)) this.deposit(message);
        try {
          this.execute(message, signerIds);
          result.accepted = true;
        } catch {
          result.accepted = false;
        }
        if (!result.accepted) return;
        try {
          this.execute(message, signerIds);
        } catch (error) {
          result.replayRejected = error instanceof QuorumError && error.code === 'message-already-executed';
        }
      });
    } catch {
      result.accepted = false;
    }
    result.stateUnchanged = stableStringify(this.snapshotState()) === before;
    return result;
  }

  /** Run `fn` on a copy-on-enter/copy-on-exit view of all mutable state. */
  simulate<T>(fn: () => T): T {
    const state = this.capture();
    try {
      return fn();
    } finally {
      this.restore(state);
    }
  }

  /** Origin-side deposit: consumes a per-sender nonce and records a locked transfer. */
  deposit(message: BridgeMessage): void {
    if (this.isFrozen) throw new QuorumError('frozen');
    const domainError = this.domainError(message);
    if (domainError) throw new QuorumError(domainError);
    if (typeof message.id !== 'string' || !message.id.trim() || message.id.length > MAX_ID_LENGTH) throw new QuorumError('invalid-message-id');
    if (this.transfers.has(message.id)) throw new QuorumError('duplicate-message-id');
    if (!Number.isSafeInteger(message.nonce) || message.nonce < 0) throw new QuorumError('invalid-nonce');
    if (message.nonce !== (this.nonces.get(message.sender) ?? 0)) throw new QuorumError('nonce-gap-or-replay');
    if (message.amount <= 0n) throw new QuorumError('invalid-amount');
    this.nonces.set(message.sender, message.nonce + 1);
    this.transfers.set(message.id, { amount: message.amount, status: 'locked', source: message.sender, nonce: message.nonce });
    this.held += message.amount;
    this.depositedTotal += message.amount;
  }

  /** Destination execution: never settles twice and never changes state on revert. */
  execute(message: BridgeMessage, signerIds: readonly string[], destinationAccepts = true): void {
    if (this.isFrozen) throw new QuorumError('frozen');
    const decision = this.canQuorumExecute(message, signerIds);
    if (!decision.ok) throw new QuorumError(decision.code);
    if (!destinationAccepts) throw new QuorumError('destination-reverted');
    const transfer = this.transfers.get(message.id);
    transfer.status = 'executed';
    this.executedIds.add(message.id);
    this.held -= transfer.amount;
    this.deliveredTotal += transfer.amount;
  }

  /** Refunds remain available while frozen so users can always recover funds. */
  refund(id: string, caller: string): void {
    this.onlyOperatorOrOwner(caller);
    const transfer = this.transfers.get(id);
    if (!transfer) throw new QuorumError('unknown-transfer');
    if (transfer.status !== 'locked') throw new QuorumError('transfer-already-settled');
    transfer.status = 'refunded';
    this.held -= transfer.amount;
    this.refundedTotal += transfer.amount;
  }

  refundAll(caller: string): string[] {
    this.onlyOperatorOrOwner(caller);
    const ids = this.lockedIds();
    for (const id of ids) this.refund(id, caller);
    return ids;
  }

  lockedIds(): string[] {
    return [...this.transfers].filter(([, t]) => t.status === 'locked').map(([id]) => id);
  }

  snapshotState(): BridgeState {
    return {
      now: this.currentTime,
      frozen: this.isFrozen,
      owner: this.options.owner,
      proposer: this.options.proposer,
      activeValidators: [...this.validators],
      activeThreshold: this.thresholdValue,
      outgoingValidators: [...this.outgoing],
      overlapUntil: this.overlapEnd,
      pendingValidators: [...this.pending],
      pendingThreshold: this.pendingThresholdValue,
      pendingActiveAt: this.pendingAt,
      signers: [...this.signerStatus].map(([id, status]) => [id, status]),
      transfers: [...this.transfers].map(([id, t]) => [id, t.amount, t.status]),
      executedIds: [...this.executedIds],
      deposited: this.depositedTotal,
      delivered: this.deliveredTotal,
      refunded: this.refundedTotal,
    };
  }

  /** True if current state is a legitimate continuation of `previous`. */
  extends(previous: BridgeState): boolean {
    const now = this.snapshotState();
    if (now.owner !== previous.owner || now.proposer !== previous.proposer) return false;
    for (const key of ['deposited', 'delivered', 'refunded'] as const) {
      if (now[key] < previous[key]) return false;
    }
    return previous.transfers.every(([id, amount, status]) => {
      const transfer = this.transfers.get(id);
      if (!transfer || transfer.amount !== amount) return false;
      return transfer.status === status || status === 'locked';
    });
  }

  invariantViolations(): string[] {
    const out: string[] = [];
    let locked = 0n;
    let executed = 0n;
    let refunded = 0n;
    let executedCount = 0;
    for (const transfer of this.transfers.values()) {
      if (transfer.status === 'locked') locked += transfer.amount;
      else if (transfer.status === 'executed') {
        executed += transfer.amount;
        executedCount++;
      } else refunded += transfer.amount;
    }
    if (locked !== this.held) out.push('escrow: held != sum of locked transfers');
    if (executed !== this.deliveredTotal) out.push('delivery: delivered != sum of executed transfers');
    if (refunded !== this.refundedTotal) out.push('refund: refunded != sum of refunded transfers');
    if (this.depositedTotal !== this.held + this.deliveredTotal + this.refundedTotal) out.push('conservation: deposited != held + delivered + refunded');
    if (this.held < 0n || this.deliveredTotal < 0n || this.refundedTotal < 0n) out.push('negative balance');
    if (this.executedIds.size !== executedCount) out.push('invalid executed set');
    if (this.thresholdValue < 1 || this.thresholdValue > this.validators.length) out.push('threshold outside validator set');
    if (this.pendingAt > 0 && (this.pending.length === 0 || this.pendingThresholdValue < 1)) out.push('invalid pending proposal');
    return out;
  }

  private capture(): InternalState {
    return {
      currentTime: this.currentTime,
      isFrozen: this.isFrozen,
      validators: [...this.validators],
      thresholdValue: this.thresholdValue,
      outgoing: [...this.outgoing],
      outgoingQuorumValue: this.outgoingQuorumValue,
      overlapEnd: this.overlapEnd,
      pending: [...this.pending],
      pendingThresholdValue: this.pendingThresholdValue,
      pendingAt: this.pendingAt,
      signers: [...this.signerStatus].map(([id, status]) => [id, status]),
      transfers: new Map([...this.transfers].map(([id, t]) => [id, { ...t }])),
      executedIds: [...this.executedIds],
      nonces: [...this.nonces],
      held: this.held,
      deposited: this.depositedTotal,
      delivered: this.deliveredTotal,
      refunded: this.refundedTotal,
    };
  }

  private restore(state: InternalState): void {
    this.currentTime = state.currentTime;
    this.isFrozen = state.isFrozen;
    this.validators.splice(0, this.validators.length, ...state.validators);
    this.thresholdValue = state.thresholdValue;
    this.outgoing = [...state.outgoing];
    this.outgoingQuorumValue = state.outgoingQuorumValue;
    this.overlapEnd = state.overlapEnd;
    this.pending = [...state.pending];
    this.pendingThresholdValue = state.pendingThresholdValue;
    this.pendingAt = state.pendingAt;
    this.signerStatus.clear();
    for (const [id, status] of state.signers) this.signerStatus.set(id, status);
    this.transfers.clear();
    for (const [id, transfer] of state.transfers) this.transfers.set(id, { ...transfer });
    this.executedIds.clear();
    for (const id of state.executedIds) this.executedIds.add(id);
    this.nonces.clear();
    for (const [sender, nonce] of state.nonces) this.nonces.set(sender, nonce);
    this.held = state.held;
    this.depositedTotal = state.deposited;
    this.deliveredTotal = state.delivered;
    this.refundedTotal = state.refunded;
  }

  private readyCount(set: readonly string[]): number {
    return set.filter((id) => this.signerStatus.get(id) === 'ready').length;
  }

  private domainError(message: BridgeMessage): string | null {
    if (!message || typeof message !== 'object') return 'invalid-message';
    if (message.version !== this.options.domainVersion) return 'wrong-domain-version';
    if (!this.options.lanes.includes(message.sourceChainId)) return 'unregistered-lane';
    if (message.targetChainId !== this.options.chainId) return 'wrong-target-chain';
    if (message.bridgeAddress !== this.options.bridgeAddress) return 'wrong-bridge-address';
    if (!Number.isSafeInteger(message.deadline) || message.deadline <= this.currentTime) return 'expired-or-invalid-deadline';
    if (typeof message.sender !== 'string' || !message.sender) return 'invalid-sender';
    return null;
  }

  private assertSignerId(id: string): void {
    if (typeof id !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(id)) throw new QuorumError('invalid-signer-id');
    if (this.signerStatus.size >= MAX_VALIDATORS && !this.signerStatus.has(id)) throw new QuorumError('too-many-signers');
    if (!this.signerStatus.has(id)) this.signerStatus.set(id, 'unavailable');
  }

  private onlyOwner(caller: string): void {
    if (caller !== this.options.owner) throw new QuorumError('caller-is-not-owner');
  }

  private onlyOperatorOrOwner(caller: string): void {
    if (caller !== this.options.owner && caller !== this.options.operator) throw new QuorumError('caller-is-not-authorized');
  }
}

function assertValidatorSet(validators: readonly string[]): string[] {
  if (!Array.isArray(validators) || validators.length === 0 || validators.length > MAX_VALIDATORS) throw new QuorumError('invalid-validator-set-size');
  for (let i = 0; i < validators.length; i++) {
    if (typeof validators[i] !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(validators[i])) throw new QuorumError('invalid-validator-id');
    if (i > 0 && validators[i - 1] >= validators[i]) throw new QuorumError('validators-must-be-ascending-and-distinct');
  }
  return [...validators];
}

function assertThreshold(threshold: number, count: number): number {
  if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > count) throw new QuorumError('invalid-threshold');
  return threshold;
}

// ---------------------------------------------------------------------------
// Runbook executor
// ---------------------------------------------------------------------------

export interface QuorumRunbookContext {
  sim: ValidatorQuorumSim;
  owner: string;
  operator: string;
  approver: string;
  authorizedApprovers: readonly string[];
  reviewedValidators: readonly string[];
  reviewedThreshold: number;
  sourceChainId: string;
  targetChainId: string;
  bridgeAddress: string;
  domainVersion: string;
  canaryMessage: BridgeMessage;
  canarySigners: readonly string[];
  lossEvidence?: readonly string[];
  lossCause?: LossCause;
  approvedBy?: string;
  snapshot?: ValidatorSnapshot;
  parametersVerified?: boolean;
  epochReached?: boolean;
  quorumVerified?: boolean;
  canaryVerified?: boolean;
  lockedSnapshot?: readonly string[];
}

export interface QuorumRunOptions {
  /** Fault injection: these step ids fail before doing any work. */
  faults?: ReadonlySet<string>;
  /** Called after every successful step so tests can interleave traffic and chain time. */
  afterStep?: (stepId: string, ctx: QuorumRunbookContext) => void;
}

export type QuorumOutcome = 'completed' | 'aborted' | 'contained' | 'manual-recovery-required';

export interface QuorumRunResult {
  outcome: QuorumOutcome;
  failedStep?: string;
  applied: string[];
  recovery: string[];
  log: Array<{ step: string; status: 'ok' | 'failed' }>;
}

type Handler = (ctx: QuorumRunbookContext) => void;

const HANDLERS: Record<string, Handler> = {
  'confirm-quorum-loss': (c) => {
    if ((c.lossEvidence ?? []).length < 2) throw new QuorumError('quorum-loss-not-corroborated');
    if (c.sim.isQuorumReady()) throw new QuorumError('quorum-is-available');
  },
  'snapshot-validator-state': (c) => {
    const violations = c.sim.invariantViolations();
    if (violations.length) throw new QuorumError(`invariants-broken: ${violations[0]}`);
    c.snapshot = {
      state: c.sim.snapshotState(),
      epochDelay: c.sim.epochDelay,
      overlapWindow: c.sim.overlapWindow,
      frozenBefore: c.sim.frozen,
    };
  },
  'classify-loss-cause': (c) => {
    const causes: LossCause[] = ['signer-outage', 'key-compromise', 'set-error', 'rpc-or-reorg', 'unknown'];
    if (!c.lossCause || !causes.includes(c.lossCause)) throw new QuorumError('loss-cause-not-recorded');
  },
  'freeze-submissions': (c) => {
    need(c.snapshot);
    c.sim.freeze(c.owner);
  },
  'list-locked-transfers': (c) => {
    c.lockedSnapshot = c.sim.lockedIds();
    const violations = c.sim.invariantViolations();
    if (violations.length) throw new QuorumError(violations[0]);
  },
  'approve-recovery-plan': (c) => {
    if (!c.authorizedApprovers.includes(c.approver)) throw new QuorumError('approver-not-authorized');
    if (c.approver === c.operator || c.approver === c.owner) throw new QuorumError('approver-must-be-independent');
    assertValidatorSet(c.reviewedValidators);
    assertThreshold(c.reviewedThreshold, c.reviewedValidators.length);
    c.approvedBy = c.approver;
  },
  'verify-reviewed-parameters': (c) => {
    requireApproval(c);
    const snapshot = need(c.snapshot);
    if (snapshot.epochDelay !== c.sim.epochDelay || snapshot.overlapWindow !== c.sim.overlapWindow) {
      throw new QuorumError('timing-parameters-changed');
    }
    assertValidatorSet(c.reviewedValidators);
    assertThreshold(c.reviewedThreshold, c.reviewedValidators.length);
    c.parametersVerified = true;
  },
  'propose-validator-set': (c) => {
    requireApproval(c);
    if (!c.parametersVerified) throw new QuorumError('parameters-not-verified');
    const activeAt = c.sim.proposeValidatorSet(c.owner, c.reviewedValidators, c.reviewedThreshold);
    if (activeAt !== c.sim.now + c.sim.epochDelay) throw new QuorumError('unexpected-activation-time');
  },
  'provision-signer-keys': (c) => {
    requireApproval(c);
    if (!c.parametersVerified) throw new QuorumError('parameters-not-verified');
    for (const id of c.reviewedValidators) c.sim.setSignerStatus(c.operator, id, 'ready');
  },
  'wait-epoch-delay': (c) => {
    if (!c.sim.hasPendingProposal || c.sim.pendingActiveAt > c.sim.now) throw new QuorumError('epoch-delay-not-elapsed');
    c.epochReached = true;
  },
  'activate-validator-set': (c) => {
    requireApproval(c);
    if (!c.epochReached) throw new QuorumError('epoch-not-confirmed');
    c.sim.activateValidatorSet(c.owner);
    c.epochReached = false;
  },
  'verify-quorum-restored': (c) => {
    if (!c.sim.isQuorumReady()) throw new QuorumError('quorum-still-unavailable');
    if (!sameSet(c.sim.activeValidators, c.reviewedValidators) || c.sim.activeThreshold !== c.reviewedThreshold) {
      throw new QuorumError('active-set-does-not-match-review');
    }
    if (c.sim.hasPendingProposal) throw new QuorumError('proposal-still-pending');
    c.quorumVerified = true;
  },
  'canary-probe': (c) => {
    if (!c.quorumVerified) throw new QuorumError('quorum-not-verified');
    const probe = c.sim.probeExecution(c.canaryMessage, c.canarySigners);
    if (!probe.accepted || !probe.replayRejected || !probe.stateUnchanged) {
      throw new QuorumError('canary-probe-failed');
    }
    c.canaryVerified = true;
  },
  'resume-submissions': (c) => {
    if (!c.canaryVerified) throw new QuorumError('canary-not-verified');
    const snapshot = need(c.snapshot);
    // A lane frozen before the incident remains frozen until separately cleared.
    if (!snapshot.frozenBefore && c.sim.frozen) c.sim.unfreeze(c.owner);
  },
  'observe-window': (c) => {
    if (!c.sim.isQuorumReady()) throw new QuorumError('quorum-lost-during-observation');
    const violations = c.sim.invariantViolations();
    if (violations.length) throw new QuorumError(violations[0]);
  },
  'ensure-frozen': (c) => {
    c.sim.freeze(c.owner);
  },
  'settle-locked-transfers': (c) => {
    c.sim.refundAll(c.operator);
    const violations = c.sim.invariantViolations();
    if (violations.length) throw new QuorumError(violations[0]);
  },
  'record-recovery-evidence': (c) => {
    const violations = c.sim.invariantViolations();
    if (violations.length) throw new QuorumError(violations[0]);
  },
};

function makeRunner(ctx: QuorumRunbookContext, options: QuorumRunOptions, result: QuorumRunResult) {
  return (step: QuorumRunbookStep): void => {
    try {
      if (options.faults?.has(step.id)) throw new QuorumError(`injected-fault-at-${step.id}`);
      const handler = HANDLERS[step.id];
      if (!handler) throw new QuorumError('no-handler-for-step');
      handler(ctx);
      const violations = ctx.sim.invariantViolations();
      if (violations.length) throw new QuorumError(violations[0]);
      result.log.push({ step: step.id, status: 'ok' });
    } catch (error) {
      result.log.push({ step: step.id, status: 'failed' });
      throw error;
    }
  };
}

/** Execute the runbook. Any failure after containment runs the fail-safe stage. */
export function runQuorumRunbook(
  steps: readonly QuorumRunbookStep[],
  ctx: QuorumRunbookContext,
  options: QuorumRunOptions = {},
): QuorumRunResult {
  const problems = validateRunbook(steps);
  if (problems.length) throw new QuorumError('invalid-runbook', `invalid runbook: ${problems[0]}`);

  const result: QuorumRunResult = { outcome: 'completed', applied: [], recovery: [], log: [] };
  const run = makeRunner(ctx, options, result);

  for (const step of steps.filter((s) => s.stage !== 'recovery')) {
    try {
      run(step);
      if (step.mutates) result.applied.push(step.id);
    } catch {
      result.failedStep = step.id;
      if (result.applied.length === 0) {
        result.outcome = 'aborted';
        return result;
      }
      return runRecovery(steps, ctx, result, run, options);
    }
    options.afterStep?.(step.id, ctx);
  }
  return result;
}

/** Re-run only the fail-safe stage after `manual-recovery-required`. */
export function recoverQuorumRunbook(
  steps: readonly QuorumRunbookStep[],
  ctx: QuorumRunbookContext,
  options: QuorumRunOptions = {},
): QuorumRunResult {
  const problems = validateRunbook(steps);
  if (problems.length) throw new QuorumError('invalid-runbook', `invalid runbook: ${problems[0]}`);
  need(ctx.snapshot);
  const result: QuorumRunResult = { outcome: 'contained', applied: [], recovery: [], log: [] };
  return runRecovery(steps, ctx, result, makeRunner(ctx, options, result), options);
}

function runRecovery(
  steps: readonly QuorumRunbookStep[],
  ctx: QuorumRunbookContext,
  result: QuorumRunResult,
  run: (step: QuorumRunbookStep) => void,
  options: QuorumRunOptions,
): QuorumRunResult {
  for (const step of steps.filter((s) => s.stage === 'recovery')) {
    try {
      run(step);
      result.recovery.push(step.id);
    } catch {
      // Fail safe: submissions must never be open when recovery is unproven.
      try {
        ctx.sim.freeze(ctx.owner);
      } catch {
        // The outcome below already requires manual recovery.
      }
      result.outcome = 'manual-recovery-required';
      return result;
    }
    options.afterStep?.(step.id, ctx);
  }
  result.outcome = 'contained';
  return result;
}

function requireApproval(c: QuorumRunbookContext): void {
  if (!c.approvedBy) throw new QuorumError('recovery-not-approved');
}

function need<T>(value: T): T {
  if (value === undefined) throw new QuorumError('missing-snapshot');
  return value;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item));
}
