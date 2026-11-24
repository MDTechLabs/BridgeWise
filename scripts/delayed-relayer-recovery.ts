/**
 * Stateful model for delayed relayer recovery without duplicate destination
 * execution (issue #1529).
 *
 * The relayer is untrusted and may be delayed, lost, restarted or adversarial.
 * Destination state is accepted only from corroborated, finalized probes; a
 * message id is consumed at most once on a destination chain, and a retry
 * always reuses the pinned source nonce. All parameters come from the explicit
 * versioned configuration table.
 *
 * Normative prose: docs/DELAYED_RELAYER_RECOVERY.md.
 */

import { createHash } from 'node:crypto';
import {
  ChainConfigEntry,
  CONFIG_CHAIN_PROFILES,
  CONFIG_PARAMETER_SET,
  canonicalJson,
  seededRandom,
} from './production-config-bundle';

export const RELAY_SCHEMA_VERSION = 1;
export const RELAY_INVARIANTS = [
  'D-1',
  'D-2',
  'D-3',
  'D-4',
  'D-5',
  'D-6',
  'D-7',
  'D-8',
  'D-9',
] as const;

export type MessagePhase =
  'observed' | 'submitted' | 'lost' | 'delivered' | 'refunded';

export interface RelayerMessage {
  readonly id: string;
  readonly sourceChain: string;
  readonly targetChain: string;
  readonly token: string;
  readonly amountMinorUnits: string;
  readonly feeMinorUnits: string;
  readonly nonce: number;
  readonly sender: string;
  readonly recipient: string;
  readonly observedAt: number;
}

export interface TargetProbe {
  readonly messageId: string;
  readonly targetChain: string;
  readonly executed: boolean;
  readonly confirmations: number;
  readonly head: number;
  readonly sources: readonly string[];
  readonly txHash?: string;
}

export interface RecoveryProof {
  readonly messageId: string;
  readonly sourceNonce: number;
  readonly executed: boolean;
  readonly finalized: boolean;
  readonly sources: readonly string[];
}

export interface RelayOptions {
  readonly profiles?: readonly ChainConfigEntry[];
  readonly relayers?: readonly string[];
  readonly guardians?: readonly string[];
  readonly maxAttempts?: number;
  readonly maxDelay?: number;
  readonly now?: number;
}

export interface Ledger {
  readonly chainId: string;
  readonly token: string;
  deposited: bigint;
  held: bigint;
  delivered: bigint;
  refunded: bigint;
  fees: bigint;
}

export interface RelaySnapshot {
  now: number;
  frozen: string[];
  ledgers: Array<{
    chainId: string;
    token: string;
    deposited: string;
    held: string;
    delivered: string;
    refunded: string;
    fees: string;
  }>;
  messages: Array<{
    id: string;
    phase: MessagePhase;
    attempts: number;
    pinnedNonce: number;
    submittedAt: number | null;
    sourceChain: string;
    targetChain: string;
    amountMinorUnits: string;
    feeMinorUnits: string;
  }>;
  consumed: string[];
}

export class RelayRecoveryError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'RelayRecoveryError';
  }
}

interface MessageState {
  readonly message: RelayerMessage;
  phase: MessagePhase;
  attempts: number;
  readonly pinnedNonce: number;
  submittedAt: number | null;
  lastTxHash: string | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isMinorUnits(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{1,32}$/.test(value);
}

function hasCorroboration(sources: unknown): boolean {
  return (
    Array.isArray(sources) &&
    new Set(sources).size >= 2 &&
    sources.every(
      (source) =>
        typeof source === 'string' && /^[a-z][a-z0-9_-]{2,31}$/.test(source),
    )
  );
}

export class DelayedRelayerRecovery {
  private currentTime: number;
  private readonly profiles = new Map<string, ChainConfigEntry>();
  private readonly relayers = new Set<string>();
  private readonly guardians = new Set<string>();
  private readonly maxAttempts: number;
  private readonly maxDelay: number;
  private readonly messages = new Map<string, MessageState>();
  private readonly fingerprints = new Set<string>();
  private readonly consumed = new Set<string>();
  private readonly ledgers = new Map<string, Ledger>();
  private readonly frozen = new Set<string>();

  constructor(readonly options: RelayOptions = {}) {
    const profiles = options.profiles ?? CONFIG_CHAIN_PROFILES;
    if (
      !profiles.length ||
      new Set(profiles.map((p) => p.chainId)).size !== profiles.length
    ) {
      throw new RelayRecoveryError('invalid-profiles');
    }
    for (const profile of profiles) this.profiles.set(profile.chainId, profile);
    const relayers = options.relayers ?? ['relayer-1', 'relayer-2'];
    const guardians = options.guardians ?? ['guardian'];
    if (
      !relayers.length ||
      !guardians.length ||
      relayers.some((actor) => guardians.includes(actor))
    ) {
      throw new RelayRecoveryError('invalid-actors');
    }
    relayers.forEach((actor) => this.relayers.add(actor));
    guardians.forEach((actor) => this.guardians.add(actor));
    this.maxAttempts = options.maxAttempts ?? 3;
    this.maxDelay = options.maxDelay ?? 10;
    if (
      !Number.isSafeInteger(this.maxAttempts) ||
      this.maxAttempts < 1 ||
      this.maxAttempts > 16 ||
      !Number.isSafeInteger(this.maxDelay) ||
      this.maxDelay < 1
    ) {
      throw new RelayRecoveryError('invalid-bounds');
    }
    if (!Number.isSafeInteger(options.now ?? 0) || (options.now ?? 0) < 0) {
      throw new RelayRecoveryError('invalid-time');
    }
    this.currentTime = options.now ?? 1_000_000;
  }

  get now(): number {
    return this.currentTime;
  }
  get parameterSetVersion(): string {
    return CONFIG_PARAMETER_SET;
  }

  setNow(value: number): void {
    if (!Number.isSafeInteger(value) || value < this.currentTime) {
      throw new RelayRecoveryError('clock-must-not-go-backwards');
    }
    this.currentTime = value;
  }

  profileFor(chainId: string): ChainConfigEntry {
    const profile = this.profiles.get(chainId);
    if (!profile) throw new RelayRecoveryError('unsupported-chain');
    return profile;
  }

  phaseOf(id: string): MessagePhase {
    const state = this.messages.get(id);
    if (!state) throw new RelayRecoveryError('unknown-message');
    return state.phase;
  }

  ledgerFor(chainId: string, token: string): Ledger {
    return { ...this.mutableLedgerFor(chainId, token) };
  }

  /** First observation pins the nonce; duplicates and replays are rejected. */
  observe(value: unknown, relayer: string): void {
    this.onlyRelayer(relayer);
    if (!isPlainObject(value)) throw new RelayRecoveryError('invalid-message');
    const message = value as unknown as RelayerMessage;
    if (
      typeof message.id !== 'string' ||
      !/^msg-[a-z0-9][a-z0-9-]{2,63}$/.test(message.id)
    ) {
      throw new RelayRecoveryError('invalid-message-id');
    }
    const source = this.profileFor(message.sourceChain);
    const target = this.profileFor(message.targetChain);
    if (message.sourceChain === message.targetChain)
      throw new RelayRecoveryError('same-chain-lane');
    if (
      this.frozen.has(message.sourceChain) ||
      this.frozen.has(message.targetChain)
    ) {
      throw new RelayRecoveryError('lane-frozen');
    }
    if (
      typeof message.token !== 'string' ||
      !/^[A-Za-z0-9_-]{1,16}$/.test(message.token)
    ) {
      throw new RelayRecoveryError('invalid-token');
    }
    if (
      !isMinorUnits(message.amountMinorUnits) ||
      !isMinorUnits(message.feeMinorUnits)
    ) {
      throw new RelayRecoveryError('invalid-amount');
    }
    const amount = BigInt(message.amountMinorUnits);
    const fee = BigInt(message.feeMinorUnits);
    if (
      amount <= 0n ||
      fee < 0n ||
      fee >= amount ||
      amount > BigInt(source.maxAmountMinorUnits)
    ) {
      throw new RelayRecoveryError('amount-out-of-bounds');
    }
    if (!Number.isSafeInteger(message.nonce) || message.nonce < 0) {
      throw new RelayRecoveryError('invalid-nonce');
    }
    if (
      typeof message.sender !== 'string' ||
      !/^[a-zA-Z0-9:]{10,64}$/.test(message.sender) ||
      typeof message.recipient !== 'string' ||
      !/^[a-zA-Z0-9:]{10,64}$/.test(message.recipient)
    ) {
      throw new RelayRecoveryError('invalid-actor-address');
    }
    if (
      !Number.isSafeInteger(message.observedAt) ||
      message.observedAt > this.currentTime
    ) {
      throw new RelayRecoveryError('invalid-observation-time');
    }
    if (this.messages.has(message.id))
      throw new RelayRecoveryError('duplicate-message-id');
    const fingerprint = createHash('sha256')
      .update(
        canonicalJson({
          sourceChain: message.sourceChain,
          targetChain: message.targetChain,
          token: message.token,
          amountMinorUnits: message.amountMinorUnits,
          feeMinorUnits: message.feeMinorUnits,
          nonce: message.nonce,
          sender: message.sender,
          recipient: message.recipient,
        }),
        'utf8',
      )
      .digest('hex');
    if (this.fingerprints.has(fingerprint))
      throw new RelayRecoveryError('duplicate-fingerprint');
    const expected = this.nextNonce(message.sender, message.sourceChain);
    if (message.nonce !== expected)
      throw new RelayRecoveryError('nonce-gap-or-replay');
    if (target.maxMessageBytes < 256)
      throw new RelayRecoveryError('invalid-profile-bounds');

    this.messages.set(message.id, {
      message,
      phase: 'observed',
      attempts: 0,
      pinnedNonce: message.nonce,
      submittedAt: null,
      lastTxHash: null,
    });
    this.fingerprints.add(fingerprint);
    const ledger = this.mutableLedgerFor(message.sourceChain, message.token);
    ledger.deposited += amount;
    ledger.held += amount;
  }

  /** Submission records a relayer tx; retries must reuse the pinned nonce. */
  submit(id: string, relayer: string, txHash: string): void {
    this.onlyRelayer(relayer);
    const state = this.requireMessage(id);
    if (state.phase !== 'observed' && state.phase !== 'lost') {
      throw new RelayRecoveryError('invalid-phase-for-submit');
    }
    if (state.attempts >= this.maxAttempts)
      throw new RelayRecoveryError('attempts-exhausted');
    if (this.frozen.has(state.message.targetChain))
      throw new RelayRecoveryError('lane-frozen');
    if (typeof txHash !== 'string' || !/^0x[0-9a-f]{64}$/.test(txHash)) {
      throw new RelayRecoveryError('invalid-tx-hash');
    }
    state.phase = 'submitted';
    state.attempts += 1;
    state.submittedAt = this.currentTime;
    state.lastTxHash = txHash;
  }

  /**
   * Authoritative destination observation. Corroborated finalized execution
   * consumes the message id exactly once; a second execution is a critical
   * error rather than a new credit.
   */
  probe(id: string, caller: string, value: unknown): boolean {
    if (!this.relayers.has(caller) && !this.guardians.has(caller)) {
      throw new RelayRecoveryError('unauthorized-caller');
    }
    const state = this.requireMessage(id);
    if (!['submitted', 'lost', 'delivered', 'refunded'].includes(state.phase)) {
      throw new RelayRecoveryError('invalid-phase-for-probe');
    }
    if (!isPlainObject(value)) throw new RelayRecoveryError('invalid-probe');
    const probe = value as unknown as TargetProbe;
    if (
      probe.messageId !== id ||
      probe.targetChain !== state.message.targetChain
    ) {
      throw new RelayRecoveryError('probe-mismatch');
    }
    if (typeof probe.executed !== 'boolean')
      throw new RelayRecoveryError('invalid-probe');
    const target = this.profileFor(state.message.targetChain);
    if (
      !Number.isSafeInteger(probe.confirmations) ||
      probe.confirmations < 0 ||
      !Number.isSafeInteger(probe.head) ||
      probe.head < 0 ||
      probe.confirmations > probe.head + 1
    ) {
      throw new RelayRecoveryError('invalid-probe');
    }
    if (!hasCorroboration(probe.sources))
      throw new RelayRecoveryError('uncorroborated-probe');
    if (
      probe.txHash !== undefined &&
      (typeof probe.txHash !== 'string' ||
        !/^0x[0-9a-f]{64}$/.test(probe.txHash))
    ) {
      throw new RelayRecoveryError('invalid-tx-hash');
    }
    if (probe.confirmations < target.finalityDepth) return false;
    if (!probe.executed) return false;

    const key = `${state.message.targetChain}:${id}`;
    if (this.consumed.has(key))
      throw new RelayRecoveryError('duplicate-destination-execution');
    const amount = BigInt(state.message.amountMinorUnits);
    const fee = BigInt(state.message.feeMinorUnits);
    const source = this.mutableLedgerFor(
      state.message.sourceChain,
      state.message.token,
    );
    source.held -= amount;
    source.delivered += amount - fee;
    source.fees += fee;
    this.consumed.add(key);
    state.phase = 'delivered';
    return true;
  }

  /** Marks a delayed submission as lost without changing any accounting. */
  markLost(id: string, guardian: string): void {
    this.onlyGuardian(guardian);
    const state = this.requireMessage(id);
    if (state.phase !== 'submitted')
      throw new RelayRecoveryError('invalid-phase-for-loss');
    if (
      state.submittedAt === null ||
      this.currentTime - state.submittedAt < this.maxDelay
    ) {
      throw new RelayRecoveryError('delay-not-elapsed');
    }
    state.phase = 'lost';
  }

  /**
   * Guardian recovery from a lost submission. A reviewed proof that the target
   * is unexecuted is mandatory; refund and resubmit share one terminal path.
   */
  recover(
    id: string,
    guardian: string,
    resolution: 'resubmit' | 'refund',
    value: unknown,
  ): void {
    this.onlyGuardian(guardian);
    const state = this.requireMessage(id);
    if (state.phase !== 'lost')
      throw new RelayRecoveryError('invalid-phase-for-recovery');
    if (resolution !== 'resubmit' && resolution !== 'refund') {
      throw new RelayRecoveryError('invalid-resolution');
    }
    if (!isPlainObject(value)) throw new RelayRecoveryError('invalid-proof');
    const proof = value as unknown as RecoveryProof;
    if (
      proof.messageId !== id ||
      proof.sourceNonce !== state.pinnedNonce ||
      !hasCorroboration(proof.sources)
    )
      throw new RelayRecoveryError('invalid-proof');
    if (proof.executed || !proof.finalized)
      throw new RelayRecoveryError('recovery-requires-unexecuted-target');
    if (this.consumed.has(`${state.message.targetChain}:${id}`)) {
      throw new RelayRecoveryError('duplicate-destination-execution');
    }
    if (resolution === 'resubmit') {
      if (state.attempts >= this.maxAttempts)
        throw new RelayRecoveryError('attempts-exhausted');
      if (this.frozen.has(state.message.targetChain))
        throw new RelayRecoveryError('lane-frozen');
      state.phase = 'submitted';
      state.attempts += 1;
      state.submittedAt = this.currentTime;
      return;
    }
    const amount = BigInt(state.message.amountMinorUnits);
    const source = this.mutableLedgerFor(
      state.message.sourceChain,
      state.message.token,
    );
    source.held -= amount;
    source.refunded += amount;
    this.consumed.add(`${state.message.targetChain}:${id}`);
    state.phase = 'refunded';
  }

  /** Drops only unfinalized observations; finalized ones require governance. */
  reorg(
    sourceChain: string,
    removedIds: readonly string[],
    guardian: string,
  ): void {
    this.onlyGuardian(guardian);
    this.profileFor(sourceChain);
    if (
      !Array.isArray(removedIds) ||
      removedIds.length === 0 ||
      removedIds.length > 128
    ) {
      throw new RelayRecoveryError('invalid-reorg-batch');
    }
    if (new Set(removedIds).size !== removedIds.length)
      throw new RelayRecoveryError('duplicate-reorg-id');
    const removals: Array<{ state: MessageState; fingerprint: string }> = [];
    for (const id of removedIds) {
      const state = this.requireMessage(id);
      if (state.message.sourceChain !== sourceChain)
        throw new RelayRecoveryError('reorg-chain-mismatch');
      if (state.phase !== 'observed')
        throw new RelayRecoveryError('finalized-reorg-requires-recovery');
      const profile = this.profileFor(sourceChain);
      if (this.currentTime - state.message.observedAt > profile.reorgWindow) {
        throw new RelayRecoveryError('outside-reorg-window');
      }
      removals.push({
        state,
        fingerprint: this.messageFingerprint(state.message),
      });
    }
    for (const removal of removals) {
      const amount = BigInt(removal.state.message.amountMinorUnits);
      const ledger = this.mutableLedgerFor(
        sourceChain,
        removal.state.message.token,
      );
      ledger.deposited -= amount;
      ledger.held -= amount;
      this.messages.delete(removal.state.message.id);
      this.fingerprints.delete(removal.fingerprint);
    }
  }

  freeze(chainId: string, guardian: string): void {
    this.onlyGuardian(guardian);
    this.profileFor(chainId);
    this.frozen.add(chainId);
  }

  unfreeze(chainId: string, guardian: string): void {
    this.onlyGuardian(guardian);
    this.profileFor(chainId);
    this.frozen.delete(chainId);
  }

  snapshot(): RelaySnapshot {
    return {
      now: this.currentTime,
      frozen: [...this.frozen].sort(),
      ledgers: [...this.ledgers.values()]
        .map((ledger) => ({
          chainId: ledger.chainId,
          token: ledger.token,
          deposited: ledger.deposited.toString(),
          held: ledger.held.toString(),
          delivered: ledger.delivered.toString(),
          refunded: ledger.refunded.toString(),
          fees: ledger.fees.toString(),
        }))
        .sort((a, b) =>
          `${a.chainId}:${a.token}`.localeCompare(`${b.chainId}:${b.token}`),
        ),
      messages: [...this.messages.values()]
        .map((state) => ({
          id: state.message.id,
          phase: state.phase,
          attempts: state.attempts,
          pinnedNonce: state.pinnedNonce,
          submittedAt: state.submittedAt,
          sourceChain: state.message.sourceChain,
          targetChain: state.message.targetChain,
          amountMinorUnits: state.message.amountMinorUnits,
          feeMinorUnits: state.message.feeMinorUnits,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      consumed: [...this.consumed].sort(),
    };
  }

  invariantViolations(): string[] {
    const violations: string[] = [];
    for (const ledger of this.ledgers.values()) {
      if (
        ledger.deposited !==
        ledger.held + ledger.delivered + ledger.refunded + ledger.fees
      )
        violations.push('D-1');
      if (
        [
          ledger.deposited,
          ledger.held,
          ledger.delivered,
          ledger.refunded,
          ledger.fees,
        ].some((value) => value < 0n)
      )
        violations.push('D-1');
    }
    const targetKeys = new Set<string>();
    for (const state of this.messages.values()) {
      if (state.phase === 'delivered') {
        const key = `${state.message.targetChain}:${state.message.id}`;
        if (targetKeys.has(key)) violations.push('D-2');
        targetKeys.add(key);
        if (!this.consumed.has(key)) violations.push('D-2');
      }
      if (
        state.attempts > this.maxAttempts ||
        state.pinnedNonce !== state.message.nonce
      )
        violations.push('D-3');
    }
    if (
      this.messages.size > 256 ||
      this.fingerprints.size !== this.messages.size
    )
      violations.push('D-4');
    if (this.consumed.size > this.messages.size) violations.push('D-4');
    return [...new Set(violations)];
  }

  private mutableLedgerFor(chainId: string, token: string): Ledger {
    this.profileFor(chainId);
    const key = `${chainId}:${token}`;
    let ledger = this.ledgers.get(key);
    if (!ledger) {
      ledger = {
        chainId,
        token,
        deposited: 0n,
        held: 0n,
        delivered: 0n,
        refunded: 0n,
        fees: 0n,
      };
      this.ledgers.set(key, ledger);
    }
    return ledger;
  }

  private onlyRelayer(actor: string): void {
    if (!this.relayers.has(actor))
      throw new RelayRecoveryError('unauthorized-relayer');
  }

  private onlyGuardian(actor: string): void {
    if (!this.guardians.has(actor))
      throw new RelayRecoveryError('unauthorized-guardian');
  }

  private requireMessage(id: string): MessageState {
    const state = this.messages.get(id);
    if (!state) throw new RelayRecoveryError('unknown-message');
    return state;
  }

  private nextNonce(sender: string, sourceChain: string): number {
    let highest = -1;
    for (const state of this.messages.values()) {
      if (
        state.message.sender === sender &&
        state.message.sourceChain === sourceChain
      ) {
        highest = Math.max(highest, state.message.nonce);
      }
    }
    return highest + 1;
  }

  private messageFingerprint(message: RelayerMessage): string {
    return createHash('sha256')
      .update(
        canonicalJson({
          sourceChain: message.sourceChain,
          targetChain: message.targetChain,
          token: message.token,
          amountMinorUnits: message.amountMinorUnits,
          feeMinorUnits: message.feeMinorUnits,
          nonce: message.nonce,
          sender: message.sender,
          recipient: message.recipient,
        }),
        'utf8',
      )
      .digest('hex');
  }
}

export function testMessage(
  overrides: Partial<RelayerMessage> = {},
): RelayerMessage {
  return {
    id: 'msg-recovery-1',
    sourceChain: 'evm:1',
    targetChain: 'evm:137',
    token: 'USDC',
    amountMinorUnits: '1000',
    feeMinorUnits: '10',
    nonce: 0,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    observedAt: 1_000_000,
    ...overrides,
  };
}

export function testProbe(overrides: Partial<TargetProbe> = {}): TargetProbe {
  return {
    messageId: 'msg-recovery-1',
    targetChain: 'evm:137',
    executed: true,
    confirmations: 128,
    head: 1_000_200,
    sources: ['chain-read', 'independent-indexer'],
    txHash: `0x${'a'.repeat(64)}`,
    ...overrides,
  };
}

export function testProof(
  overrides: Partial<RecoveryProof> = {},
): RecoveryProof {
  return {
    messageId: 'msg-recovery-1',
    sourceNonce: 0,
    executed: false,
    finalized: true,
    sources: ['chain-read', 'independent-indexer'],
    ...overrides,
  };
}

export { seededRandom };
