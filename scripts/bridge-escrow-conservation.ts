/**
 * Executable reference model for the BridgeWise bridge escrow conservation
 * specification (issue #1533).
 *
 * This is a normative, deterministic model. It is not a substitute for an
 * independent contract audit. Security-critical parameters come from the
 * versioned `CHAIN_PROFILES` table or from caller-supplied reviewed evidence;
 * nothing is inferred from RPC or relayer data.
 *
 * The prose specification is `docs/BRIDGE_ESCROW_CONSERVATION_SPEC.md`. Keep
 * the invariant ids and chain ids in sync with that document: the spec test
 * fails if the document stops mentioning one of them.
 */

// ---------------------------------------------------------------------------
// Versioned chain parameters
// ---------------------------------------------------------------------------

export interface ChainProfile {
  /** Version of the reviewed parameter set; bump when any field changes. */
  readonly parameterSetVersion: string;
  /** Canonical chain id used by the bridge (EVM numeric id or Soroban). */
  readonly chainId: string;
  /** Confirmations/ledgers required before an observed deposit is counted. */
  readonly finalityDepth: number;
  /** Maximum depth that may be treated as reversible by this chain. */
  readonly reorgWindow: number;
  readonly maxMessageBytes: number;
  readonly maxTransfersPerBatch: number;
  readonly maxDeliveryAttempts: number;
  /** Maximum gross token amount accepted by the escrow on this chain. */
  readonly maxAmount: bigint;
  readonly tokenDecimals: number;
  /** Source of the baseline; never read from an RPC response at runtime. */
  readonly parameterSource: string;
}

/**
 * Baseline values mirror the checked-in finality configuration
 * (`packages/evm-execution/src/finality-config.ts` and
 * `apps/api/src/events/messaging/message-execution.service.ts`). Production
 * deployments must reconcile them with the restricted deployment inventory;
 * a chain is rejected until an explicit profile exists.
 */
export const CHAIN_PROFILES: readonly ChainProfile[] = [
  { parameterSetVersion: 'escrow-conservation/1.0.0', chainId: 'evm:1', finalityDepth: 12, reorgWindow: 64, maxMessageBytes: 4096, maxTransfersPerBatch: 128, maxDeliveryAttempts: 3, maxAmount: 10n ** 30n, tokenDecimals: 18, parameterSource: 'finality-config:1' },
  { parameterSetVersion: 'escrow-conservation/1.0.0', chainId: 'evm:137', finalityDepth: 128, reorgWindow: 256, maxMessageBytes: 4096, maxTransfersPerBatch: 128, maxDeliveryAttempts: 3, maxAmount: 10n ** 30n, tokenDecimals: 18, parameterSource: 'finality-config:137' },
  { parameterSetVersion: 'escrow-conservation/1.0.0', chainId: 'evm:56', finalityDepth: 15, reorgWindow: 50, maxMessageBytes: 4096, maxTransfersPerBatch: 128, maxDeliveryAttempts: 3, maxAmount: 10n ** 30n, tokenDecimals: 18, parameterSource: 'deployment-inventory-baseline:56' },
  { parameterSetVersion: 'escrow-conservation/1.0.0', chainId: 'evm:42161', finalityDepth: 1, reorgWindow: 10, maxMessageBytes: 4096, maxTransfersPerBatch: 128, maxDeliveryAttempts: 3, maxAmount: 10n ** 30n, tokenDecimals: 18, parameterSource: 'finality-config:42161' },
  { parameterSetVersion: 'escrow-conservation/1.0.0', chainId: 'evm:10', finalityDepth: 1, reorgWindow: 10, maxMessageBytes: 4096, maxTransfersPerBatch: 128, maxDeliveryAttempts: 3, maxAmount: 10n ** 30n, tokenDecimals: 18, parameterSource: 'finality-config:10' },
  { parameterSetVersion: 'escrow-conservation/1.0.0', chainId: 'evm:8453', finalityDepth: 6, reorgWindow: 20, maxMessageBytes: 4096, maxTransfersPerBatch: 128, maxDeliveryAttempts: 3, maxAmount: 10n ** 30n, tokenDecimals: 18, parameterSource: 'deployment-inventory-baseline:8453' },
  { parameterSetVersion: 'escrow-conservation/1.0.0', chainId: 'soroban:stellar', finalityDepth: 1, reorgWindow: 1, maxMessageBytes: 2048, maxTransfersPerBatch: 64, maxDeliveryAttempts: 3, maxAmount: (1n << 63n) - 1n, tokenDecimals: 7, parameterSource: 'finality-policy:stellar' },
];

/** Invariant identifiers, kept stable so docs and tests can cross-reference. */
export const CONSERVATION_INVARIANTS = [
  'C-1', 'C-2', 'C-3', 'C-4', 'C-5', 'C-6', 'C-7', 'C-8', 'C-9', 'C-10',
] as const;

export type InvariantId = (typeof CONSERVATION_INVARIANTS)[number];

// ---------------------------------------------------------------------------
// Messages, proofs and ledger state
// ---------------------------------------------------------------------------

export type MessageType = 'deposit' | 'retry' | 'refund' | 'recovery';
export type TransferStatus = 'pending' | 'locked' | 'delivered' | 'refunded';
export type RecoveryResolution = 'deliver' | 'refund';

export interface EscrowMessage {
  readonly id: string;
  readonly type: MessageType;
  readonly sourceChain: string;
  readonly targetChain: string;
  readonly token: string;
  readonly sender: string;
  readonly recipient: string;
  /** Gross source-chain debit, including any explicitly recorded fee. */
  readonly amount: bigint;
  readonly fee: bigint;
  readonly nonce: number;
  /** Source block/ledger height where the deposit was observed. */
  readonly observedAt: number;
  /** Encoded message size, used for the chain-specific resource bound. */
  readonly bytes: number;
  /** Optional expiry in model time; an expired deposit is never accepted. */
  readonly expiresAt?: number;
}

export interface SettlementProof {
  readonly messageId: string;
  readonly sourceNonce: number;
  readonly finalized: boolean;
  readonly independentlyVerified: boolean;
  readonly independentSources: readonly string[];
  readonly targetUnexecuted: boolean;
}

export interface DeliveryOptions {
  /** False models a destination call revert; the transfer stays locked. */
  readonly targetSucceeds: boolean;
  readonly proof: SettlementProof;
}

interface TransferRecord {
  readonly message: EscrowMessage;
  status: TransferStatus;
  attempts: number;
  finalizedAt?: number;
}

interface Ledger {
  readonly chainId: string;
  readonly token: string;
  deposited: bigint;
  held: bigint;
  delivered: bigint;
  refunded: bigint;
  fees: bigint;
  /** Corroborated on-chain balance; undefined until two sources agree. */
  observedBalance?: bigint;
}

export interface EscrowStateSnapshot {
  now: number;
  frozen: boolean;
  recoveryRequired: boolean;
  recoveries: number;
  chains: Array<{
    key: string;
    chainId: string;
    token: string;
    deposited: string;
    held: string;
    delivered: string;
    refunded: string;
    fees: string;
    observedBalance: string | null;
  }>;
  transfers: Array<{
    id: string;
    status: TransferStatus;
    attempts: number;
    amount: string;
    fee: string;
  }>;
  consumed: string[];
}

export class EscrowSpecError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ?? code);
    this.name = 'EscrowSpecError';
  }
}

export interface BridgeEscrowModelOptions {
  readonly profiles?: readonly ChainProfile[];
  readonly owner: string;
  /** Only the message receiver adapter may observe/finalize source deposits. */
  readonly receiver: string;
  readonly relayers: readonly string[];
  readonly guardians: readonly string[];
  readonly parameterSet: string;
  readonly now?: number;
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export class BridgeEscrowModel {
  private currentTime: number;
  private isFrozen = false;
  private needsRecovery = false;
  private recoveryCount = 0;
  private readonly profiles = new Map<string, ChainProfile>();
  private readonly ledgers = new Map<string, Ledger>();
  private readonly transfers = new Map<string, TransferRecord>();
  private readonly consumed = new Set<string>();

  constructor(readonly options: BridgeEscrowModelOptions) {
    for (const field of ['owner', 'receiver', 'parameterSet'] as const) {
      if (typeof options[field] !== 'string' || !options[field].trim()) {
        throw new EscrowSpecError(`invalid-${field}`);
      }
    }
    if (!Number.isSafeInteger(options.now ?? 0) || (options.now ?? 0) < 0) {
      throw new EscrowSpecError('invalid-clock');
    }
    this.currentTime = options.now ?? 1_000_000;
    const profiles = options.profiles ?? CHAIN_PROFILES;
    if (!profiles.length) throw new EscrowSpecError('no-chain-profiles');
    for (const profile of profiles) {
      if (this.profiles.has(profile.chainId)) throw new EscrowSpecError('duplicate-chain-profile');
      this.assertProfile(profile);
      this.profiles.set(profile.chainId, profile);
    }
  }

  get now(): number {
    return this.currentTime;
  }
  get frozen(): boolean {
    return this.isFrozen;
  }
  get recoveryRequired(): boolean {
    return this.needsRecovery;
  }
  get recoveries(): number {
    return this.recoveryCount;
  }

  /** Monotonic model clock; reorg handling takes an explicit source head. */
  setNow(value: number): void {
    if (!Number.isSafeInteger(value) || value < this.currentTime) {
      throw new EscrowSpecError('clock-must-not-go-backwards');
    }
    this.currentTime = value;
  }

  profileFor(chainId: string): ChainProfile {
    const profile = this.profiles.get(chainId);
    if (!profile) throw new EscrowSpecError('unsupported-chain');
    return profile;
  }

  freeze(caller: string): void {
    this.onlyGovernance(caller);
    this.isFrozen = true; // idempotent: recovery must always be retryable
  }

  unfreeze(caller: string): void {
    this.onlyGovernance(caller);
    if (this.needsRecovery) throw new EscrowSpecError('recovery-required');
    this.isFrozen = false;
  }

  /**
   * Observe a source deposit. This is unfinalized: it reserves the message id
   * and nonce but deliberately does not change any escrow total (C-7).
   */
  observeDeposit(message: EscrowMessage, caller: string): void {
    this.onlyReceiver(caller);
    if (this.isFrozen) throw new EscrowSpecError('frozen');
    const source = this.profileFor(message?.sourceChain);
    const target = this.profileFor(message?.targetChain);
    this.assertMessage(message, source);
    if (message.bytes > target.maxMessageBytes || message.amount - message.fee > target.maxAmount) {
      throw new EscrowSpecError('target-bounds-exceeded');
    }
    if (message.expiresAt !== undefined && this.currentTime >= message.expiresAt) {
      throw new EscrowSpecError('message-expired');
    }
    if (this.transfers.has(message.id)) throw new EscrowSpecError('duplicate-message-id');
    const expected = this.nextNonce(message.sender, message.sourceChain);
    if (message.nonce !== expected) throw new EscrowSpecError('nonce-gap-or-replay');

    this.transfers.set(message.id, { message, status: 'pending', attempts: 0 });
  }

  /** Promote an observed deposit to locked escrow after chain finality. */
  finalizeDeposit(id: string, caller: string, confirmations: number): void {
    this.onlyReceiver(caller);
    const record = this.requireTransfer(id);
    if (record.status !== 'pending') throw new EscrowSpecError('deposit-not-pending');
    const profile = this.profileFor(record.message.sourceChain);
    if (!Number.isSafeInteger(confirmations) || confirmations < profile.finalityDepth) {
      throw new EscrowSpecError('finality-not-reached');
    }
    if (record.message.observedAt + profile.finalityDepth > this.currentTime) {
      throw new EscrowSpecError('finality-not-reached');
    }
    if (record.message.observedAt > this.currentTime) throw new EscrowSpecError('observation-in-future');

    const ledger = this.ledgerFor(record.message.sourceChain, record.message.token);
    ledger.deposited += record.message.amount;
    ledger.held += record.message.amount;
    record.status = 'locked';
    record.finalizedAt = this.currentTime;
  }

  /** Bounded batch finalization: the bound is checked before any work. */
  finalizeBatch(ids: readonly string[], caller: string, confirmations: number): void {
    if (!Array.isArray(ids) || ids.length === 0) throw new EscrowSpecError('batch-out-of-bounds');
    const profile = this.profileFor(this.requireTransfer(ids[0]).message.sourceChain);
    if (ids.length > profile.maxTransfersPerBatch) {
      throw new EscrowSpecError('batch-out-of-bounds');
    }
    const sourceChains = new Set(ids.map((id) => this.requireTransfer(id).message.sourceChain));
    if (sourceChains.size !== 1) throw new EscrowSpecError('batch-mixed-chains');
    this.assertBatchBounds(ids, profile);
    // Validate the whole batch before mutating anything (all-or-nothing).
    for (const id of ids) {
      const record = this.requireTransfer(id);
      if (record.status !== 'pending') throw new EscrowSpecError('deposit-not-pending');
    }
    for (const id of ids) this.finalizeDeposit(id, caller, confirmations);
  }

  /**
   * Attempt destination delivery. A target revert leaves the transfer locked:
   * totals, status and the consumed set are unchanged; only the bounded
   * attempt counter advances so the transfer can be refunded later.
   */
  deliver(id: string, caller: string, options: DeliveryOptions): void {
    this.onlyRelayerOrReceiver(caller);
    if (this.isFrozen) throw new EscrowSpecError('frozen');
    this.applyDelivery(this.requireTransfer(id), options);
  }

  /** Refund a locked transfer. Refunds stay available while frozen. */
  refund(id: string, caller: string): void {
    this.onlyGovernance(caller);
    const record = this.requireTransfer(id);
    if (record.status !== 'locked') throw new EscrowSpecError('transfer-not-locked');
    if (this.consumed.has(id)) throw new EscrowSpecError('message-already-consumed');

    const ledger = this.ledgerFor(record.message.sourceChain, record.message.token);
    ledger.held -= record.message.amount;
    ledger.refunded += record.message.amount;
    record.status = 'refunded';
    this.consumed.add(id);
  }

  /** Bounded refund sweep used during containment and recovery. */
  refundAll(ids: readonly string[], caller: string): string[] {
    this.onlyGovernance(caller);
    if (!Array.isArray(ids) || ids.length === 0) throw new EscrowSpecError('batch-out-of-bounds');
    const profile = this.profileFor(this.requireTransfer(ids[0]).message.sourceChain);
    this.assertBatchBounds(ids, profile);
    const sourceChains = new Set(ids.map((id) => this.requireTransfer(id).message.sourceChain));
    if (sourceChains.size !== 1) throw new EscrowSpecError('batch-mixed-chains');
    for (const id of ids) this.requireTransfer(id); // validate before mutation
    for (const id of ids) this.refund(id, caller);
    return [...ids];
  }

  /**
   * Reorg handling. Unfinalized deposits disappear without touching escrow
   * totals. A finalized deposit is never silently rewritten: the model
   * freezes and requires an operator-reviewed recovery, then rejects.
   */
  reorg(chainId: string, newHead: number, affectedIds: readonly string[], caller: string): void {
    this.onlyGovernance(caller);
    const profile = this.profileFor(chainId);
    if (!Number.isSafeInteger(newHead) || newHead < 0) throw new EscrowSpecError('invalid-head');
    if (!Array.isArray(affectedIds) || affectedIds.length > profile.reorgWindow) {
      throw new EscrowSpecError('reorg-window-exceeded');
    }
    const removals: string[] = [];
    let finalizedReorg = false;
    for (const id of affectedIds) {
      const record = this.requireTransfer(id);
      if (record.message.sourceChain !== chainId) throw new EscrowSpecError('reorg-chain-mismatch');
      if (record.status === 'pending') {
        if (record.message.observedAt <= newHead) throw new EscrowSpecError('pending-observation-still-final');
        removals.push(id);
      } else {
        finalizedReorg = true;
      }
    }
    if (finalizedReorg) {
      this.isFrozen = true;
      this.needsRecovery = true;
      throw new EscrowSpecError('finalized-reorg-requires-recovery');
    }
    for (const id of removals) this.transfers.delete(id);
  }

  /**
   * Operator recovery for a frozen lane. Requires an independently verified
   * proof; ambiguous proofs fail closed without mutating protected state.
   */
  recover(id: string, caller: string, resolution: RecoveryResolution, proof: SettlementProof): void {
    this.onlyGovernance(caller);
    if (!this.isFrozen) throw new EscrowSpecError('not-frozen');
    const record = this.requireTransfer(id);
    if (record.status !== 'locked') throw new EscrowSpecError('transfer-not-locked');
    this.assertProof(proof, record.message);
    if (resolution === 'deliver') {
      this.applyDelivery(record, { targetSucceeds: true, proof });
    } else if (resolution === 'refund') {
      this.refund(id, caller);
    } else {
      throw new EscrowSpecError('invalid-resolution');
    }
    this.recoveryCount += 1;
    this.needsRecovery = false;
  }

  /** Two independent corroborations are required before an actual balance is trusted. */
  observeActualBalance(chainId: string, token: string, balance: bigint, sources: readonly string[]): void {
    if (!Array.isArray(sources) || new Set(sources).size < 2 || sources.some((s) => typeof s !== 'string' || !s.trim())) {
      throw new EscrowSpecError('balance-not-corroborated');
    }
    if (typeof balance !== 'bigint' || balance < 0n) throw new EscrowSpecError('invalid-balance');
    this.ledgerFor(chainId, token).observedBalance = balance;
  }

  /** Read-only dry run: every mutation is rolled back on exit. */
  simulate<T>(fn: () => T): T {
    const state = this.capture();
    try {
      return fn();
    } finally {
      this.restore(state);
    }
  }

  transfer(id: string): TransferRecord {
    return this.requireTransfer(id);
  }

  ledger(chainId: string, token: string): Ledger {
    return this.ledgerFor(chainId, token);
  }

  nextNonce(sender: string, chainId: string): number {
    let highest = -1;
    for (const record of this.transfers.values()) {
      if (record.message.sender === sender && record.message.sourceChain === chainId) {
        highest = Math.max(highest, record.message.nonce);
      }
    }
    return highest + 1;
  }

  lockedIds(): string[] {
    return [...this.transfers].filter(([, record]) => record.status === 'locked').map(([id]) => id);
  }

  /** Operational alert only: pending observations older than the reorg window. */
  stalePendingIds(): string[] {
    return [...this.transfers]
      .filter(([, record]) => {
        const profile = this.profileFor(record.message.sourceChain);
        return record.status === 'pending' && record.message.observedAt + profile.reorgWindow < this.currentTime;
      })
      .map(([id]) => id);
  }

  /**
   * Evaluate all static invariants. Authorization and atomicity are proven by
   * tests that assert an unchanged snapshot after rejected operations.
   */
  invariantViolations(): string[] {
    const violations: string[] = [];
    for (const [key, ledger] of this.ledgers) {
      const perChain = (violation: string) => violations.push(`${violation}:${key}`);
      if (ledger.deposited !== ledger.held + ledger.delivered + ledger.refunded + ledger.fees) {
        perChain('C-1');
      }
      if (ledger.observedBalance !== undefined && ledger.held > ledger.observedBalance) perChain('C-2');
      if (ledger.deposited < 0n || ledger.held < 0n || ledger.delivered < 0n || ledger.refunded < 0n || ledger.fees < 0n) perChain('C-6');
    }
    for (const [id, record] of this.transfers) {
      const sourceProfile = this.profileFor(record.message.sourceChain);
      const targetProfile = this.profileFor(record.message.targetChain);
      if (this.consumed.has(id) && !['delivered', 'refunded'].includes(record.status)) violations.push(`C-3:${id}`);
      if (
        record.message.bytes > sourceProfile.maxMessageBytes ||
        record.message.bytes > targetProfile.maxMessageBytes ||
        record.message.amount > sourceProfile.maxAmount ||
        record.message.amount - record.message.fee > targetProfile.maxAmount ||
        record.message.fee > record.message.amount
      ) violations.push(`C-8:${id}`);
      if (record.finalizedAt !== undefined && record.finalizedAt < record.message.observedAt + sourceProfile.finalityDepth) {
        violations.push(`C-7:${id}`);
      }
    }
    const deliveredIds = [...this.transfers].filter(([, r]) => r.status === 'delivered').map(([id]) => id);
    if (new Set(deliveredIds).size !== deliveredIds.length) violations.push('C-3:delivered-set');
    return violations;
  }

  snapshot(): EscrowStateSnapshot {
    return {
      now: this.currentTime,
      frozen: this.isFrozen,
      recoveryRequired: this.needsRecovery,
      recoveries: this.recoveryCount,
      chains: [...this.ledgers].map(([key, ledger]) => ({
        key,
        chainId: ledger.chainId,
        token: ledger.token,
        deposited: ledger.deposited.toString(),
        held: ledger.held.toString(),
        delivered: ledger.delivered.toString(),
        refunded: ledger.refunded.toString(),
        fees: ledger.fees.toString(),
        observedBalance: ledger.observedBalance?.toString() ?? null,
      })),
      transfers: [...this.transfers].map(([id, record]) => ({
        id,
        status: record.status,
        attempts: record.attempts,
        amount: record.message.amount.toString(),
        fee: record.message.fee.toString(),
      })),
      consumed: [...this.consumed].sort(),
    };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Shared settlement path for normal delivery and operator recovery. */
  private applyDelivery(record: TransferRecord, options: DeliveryOptions): void {
    if (record.status !== 'locked') throw new EscrowSpecError('transfer-not-locked');
    if (this.consumed.has(record.message.id)) throw new EscrowSpecError('message-already-consumed');
    this.assertProof(options.proof, record.message);

    const profile = this.profileFor(record.message.targetChain);
    if (record.attempts >= profile.maxDeliveryAttempts) throw new EscrowSpecError('attempts-exhausted');
    record.attempts += 1;
    if (!options.targetSucceeds) return; // revert: no accounting mutation

    const ledger = this.ledgerFor(record.message.sourceChain, record.message.token);
    ledger.held -= record.message.amount;
    ledger.delivered += record.message.amount - record.message.fee;
    ledger.fees += record.message.fee; // collected only on a successful delivery
    record.status = 'delivered';
    this.consumed.add(record.message.id);
  }

  private assertProfile(profile: ChainProfile): void {
    if (typeof profile.chainId !== 'string' || !profile.chainId.trim()) throw new EscrowSpecError('invalid-chain-id');
    if (!profile.parameterSetVersion?.trim()) throw new EscrowSpecError('invalid-parameter-version');
    for (const field of ['finalityDepth', 'reorgWindow', 'maxMessageBytes', 'maxTransfersPerBatch', 'maxDeliveryAttempts', 'tokenDecimals'] as const) {
      if (!Number.isSafeInteger(profile[field]) || profile[field] < 0) throw new EscrowSpecError(`invalid-${field}`);
    }
    if (profile.finalityDepth < 1 || profile.maxTransfersPerBatch < 1 || profile.maxDeliveryAttempts < 1) {
      throw new EscrowSpecError('invalid-profile-bounds');
    }
    if (profile.maxAmount <= 0n) throw new EscrowSpecError('invalid-max-amount');
  }

  private assertMessage(message: EscrowMessage, profile: ChainProfile): void {
    if (!message || typeof message.id !== 'string' || !/^[A-Za-z0-9:_-]{1,200}$/.test(message.id)) {
      throw new EscrowSpecError('invalid-message-id');
    }
    if (!['deposit', 'retry', 'refund', 'recovery'].includes(message.type)) throw new EscrowSpecError('invalid-message-type');
    for (const field of ['token', 'sender', 'recipient'] as const) {
      if (typeof message[field] !== 'string' || !message[field].trim()) throw new EscrowSpecError(`invalid-${field}`);
    }
    if (message.targetChain === message.sourceChain) throw new EscrowSpecError('same-chain-lane');
    if (typeof message.amount !== 'bigint' || message.amount <= 0n || message.amount > profile.maxAmount) throw new EscrowSpecError('amount-out-of-bounds');
    if (typeof message.fee !== 'bigint' || message.fee < 0n || message.fee > message.amount) throw new EscrowSpecError('fee-out-of-bounds');
    if (!Number.isSafeInteger(message.nonce) || message.nonce < 0) throw new EscrowSpecError('invalid-nonce');
    if (!Number.isSafeInteger(message.observedAt) || message.observedAt < 0 || message.observedAt > this.currentTime) throw new EscrowSpecError('invalid-observation');
    if (!Number.isSafeInteger(message.bytes) || message.bytes < 1 || message.bytes > profile.maxMessageBytes) throw new EscrowSpecError('message-too-large');
    if (message.expiresAt !== undefined && (!Number.isSafeInteger(message.expiresAt) || message.expiresAt < 0)) throw new EscrowSpecError('invalid-expiry');
  }

  private assertBatchBounds(ids: readonly string[], profile: ChainProfile): void {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > profile.maxTransfersPerBatch) {
      throw new EscrowSpecError('batch-out-of-bounds');
    }
  }

  private assertProof(proof: SettlementProof, message: EscrowMessage): void {
    if (!proof || proof.messageId !== message.id || proof.sourceNonce !== message.nonce) throw new EscrowSpecError('proof-binding-mismatch');
    if (!proof.finalized || !proof.independentlyVerified || !proof.targetUnexecuted) throw new EscrowSpecError('unverified-proof');
    if (!Array.isArray(proof.independentSources) || new Set(proof.independentSources).size < 2) {
      throw new EscrowSpecError('proof-not-corroborated');
    }
  }

  private onlyReceiver(caller: string): void {
    if (caller !== this.options.receiver) throw new EscrowSpecError('caller-is-not-receiver');
  }
  private onlyRelayerOrReceiver(caller: string): void {
    if (caller !== this.options.receiver && !this.options.relayers.includes(caller)) {
      throw new EscrowSpecError('caller-is-not-relayer');
    }
  }
  private onlyGovernance(caller: string): void {
    if (caller !== this.options.owner && !this.options.guardians.includes(caller)) {
      throw new EscrowSpecError('caller-is-not-governance');
    }
  }

  private requireTransfer(id: string): TransferRecord {
    const record = this.transfers.get(id);
    if (!record) throw new EscrowSpecError('unknown-transfer');
    return record;
  }

  private ledgerFor(chainId: string, token: string): Ledger {
    this.profileFor(chainId);
    const key = `${chainId}:${token}`;
    let ledger = this.ledgers.get(key);
    if (!ledger) {
      ledger = { chainId, token, deposited: 0n, held: 0n, delivered: 0n, refunded: 0n, fees: 0n };
      this.ledgers.set(key, ledger);
    }
    return ledger;
  }

  private capture(): {
    time: number; frozen: boolean; recovery: boolean; recoveries: number;
    transfers: Map<string, TransferRecord>; consumed: string[]; ledgers: Map<string, Ledger>;
  } {
    return {
      time: this.currentTime,
      frozen: this.isFrozen,
      recovery: this.needsRecovery,
      recoveries: this.recoveryCount,
      transfers: new Map([...this.transfers].map(([id, record]) => [id, { ...record, message: record.message }])),
      consumed: [...this.consumed],
      ledgers: new Map([...this.ledgers].map(([key, ledger]) => [key, { ...ledger }])),
    };
  }

  private restore(state: ReturnType<BridgeEscrowModel['capture']>): void {
    this.currentTime = state.time;
    this.isFrozen = state.frozen;
    this.needsRecovery = state.recovery;
    this.recoveryCount = state.recoveries;
    this.transfers.clear();
    for (const [id, record] of state.transfers) this.transfers.set(id, { ...record });
    this.consumed.clear();
    for (const id of state.consumed) this.consumed.add(id);
    this.ledgers.clear();
    for (const [key, ledger] of state.ledgers) this.ledgers.set(key, { ...ledger });
  }
}

/** Stable serialization for before/after state comparisons in tests. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item));
}

/** Deterministic LCG so fuzz runs are reproducible without external entropy. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 6_364_136_223_846_793_005) + 1) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function makeProof(message: EscrowMessage): SettlementProof {
  return {
    messageId: message.id,
    sourceNonce: message.nonce,
    finalized: true,
    independentlyVerified: true,
    independentSources: ['chain-read', 'independent-indexer'],
    targetUnexecuted: true,
  };
}

export function testMessage(overrides: Partial<EscrowMessage> = {}): EscrowMessage {
  return {
    id: 'deposit-1',
    type: 'deposit',
    sourceChain: 'evm:137',
    targetChain: 'evm:1',
    token: 'USDC',
    sender: 'alice',
    recipient: 'bob',
    amount: 1_000n,
    fee: 10n,
    nonce: 0,
    observedAt: 1_000_000,
    bytes: 256,
    ...overrides,
  };
}

export function testOptions(overrides: Partial<BridgeEscrowModelOptions> = {}): BridgeEscrowModelOptions {
  return {
    owner: 'governance',
    receiver: 'receiver-adapter',
    relayers: ['relayer-1', 'relayer-2'],
    guardians: ['guardian'],
    parameterSet: 'escrow-conservation/1.0.0',
    now: 1_000_000,
    ...overrides,
  };
}
