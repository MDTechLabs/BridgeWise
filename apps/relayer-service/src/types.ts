export type ChainType = 'evm' | 'soroban' | 'solana';

export interface MessageValidationOptions {
  /** Validate addresses against the format of the chain named on the message. */
  enforceAddressFormat: boolean;
  /** Upper bound on `id` length in characters. */
  maxIdLength: number;
  /** Upper bound on `payload` length in characters. */
  maxPayloadLength: number;
}

export interface MessageValidationStats {
  checked: number;
  accepted: number;
  rejected: number;
}

export interface CrossChainMessage {
  id: string;
  sourceChainId: string;
  destinationChainId: string;
  sourceTxHash: string;
  sourceBlockNumber: number;
  /** Position of the emitting event in the source transaction, when one transaction emits several messages. */
  sourceLogIndex?: number;
  messageType: string;
  payload: string;
  sender: string;
  recipient: string;
  tokenAddress?: string;
  amount?: string;
  maxGasLimit?: string;
  createdAt: number;
  status: MessageStatus;
  retryCount: number;
  lastError?: string;
}

export type MessageStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'submitted'
  | 'confirmed'
  | 'failed'
  | 'expired';

export interface ChainNonce {
  chainId: string;
  nonce: number;
}

/**
 * Durable storage for the relayer's per-chain message nonces.
 *
 * The executors hand out a fresh nonce for every message they deliver to a
 * destination chain. Keeping that counter only in memory means a restart
 * resets it to zero and a redelivered message can receive a different nonce,
 * which lets the same message be executed twice on the destination chain. A
 * `NonceStore` makes both the high-water counter and the nonce pinned to each
 * message survive across restarts and instances.
 *
 * Implementations must satisfy two guarantees:
 *
 * - `setNonce`/`setMessageNonce` are durable before the returned value is
 *   used, so a crash can never re-issue an already-assigned nonce;
 * - writes are serialised, so concurrent callers never observe a gap-free
 *   counter as anything but strictly increasing.
 *
 * The package ships `InMemoryNonceStore` (the default, matching today's
 * behaviour) and `FileNonceStore` (a single-instance file-backed store with
 * atomic writes). Multi-replica deployments must supply a transactional
 * shared store (for example Redis-backed) implementing the same interface.
 */
export interface NonceStore {
  /** The persisted next nonce to use for `chainId`, or `null` when unknown. */
  getNonce(chainId: string): Promise<number | null>;
  /** Persists `nonce` as the next nonce to use for `chainId`. */
  setNonce(chainId: string, nonce: number): Promise<void>;
  /**
   * The nonce already pinned to `messageId`, or `null`. Used so a redelivered
   * message reuses the nonce it was first delivered with.
   */
  getMessageNonce(messageId: string): Promise<ChainNonce | null>;
  /** Pins `nonce` to `messageId`, durably, before the nonce is used. */
  setMessageNonce(messageId: string, chainId: string, nonce: number): Promise<void>;
  /** Drops the pin for `messageId` once its delivery is confirmed and complete. */
  removeMessageNonce(messageId: string): Promise<void>;
}

export interface FileNonceStoreOptions {
  /** Path of the JSON file holding the nonce state. The parent directory is created if missing. */
  filePath: string;
  /**
   * Flush the written payload to disk before atomically renaming it into
   * place. Defaults to `true` so a completed `setNonce` survives a crash.
   */
  fsync?: boolean;
  /**
   * Upper bound on remembered message-nonce pins. Oldest pins are evicted
   * first; the evicted count is exposed through `getStats()`. Defaults to
   * 100_000.
   */
  maxMessageNonces?: number;
}

export interface ExecutionResult {
  messageId: string;
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  error?: string;
  timestamp: number;
}

export interface GasRepriceConfig {
  initialGasPrice: string;
  maxGasPrice: string;
  bumpPercentage: number;
  bumpIntervalBlocks: number;
  maxBumps: number;
}

export interface ExecutorConfig {
  chainId: string;
  chainType: ChainType;
  rpcUrl: string;
  privateKey?: string;
  gasRepricing: GasRepriceConfig;
  confirmationBlocks: number;
  confirmationPollIntervalMs: number;
  /**
   * Durable store backing the per-chain nonce counter and per-message nonce
   * pins. Defaults to a process-local `InMemoryNonceStore`, which matches the
   * pre-feature behaviour; pass a `FileNonceStore` (or a shared transactional
   * store in multi-replica deployments) so a restart or failover never resets
   * the counter or re-issues a message's nonce.
   */
  nonceStore?: NonceStore;
}

export interface QueueConfig {
  maxRetries: number;
  retryDelayMs: number;
  concurrency: number;
  pollIntervalMs: number;
  /** Duplicate message detection settings. Enabled by default; pass `false` to disable. */
  deduplication?: Partial<DuplicateDetectorConfig> | false;
  /**
   * Structural validation applied to every message on the way in. Enabled by
   * default; pass `false` to accept messages unvalidated, which is only safe
   * when every producer is already trusted and schema-checked.
   */
  validation?: Partial<MessageValidationOptions> | false;
}

export interface DuplicateDetectorConfig {
  /** How long a message is remembered after it is first accepted. Must exceed the longest time a message can stay in flight. */
  windowMs: number;
  /** Upper bound on remembered messages; the oldest are evicted first. */
  maxEntries: number;
}

export type DuplicateReason =
  /** Same message ID and same content: a benign re-delivery. */
  | 'message-id'
  /** New message ID, but the same source event and content as an earlier message. */
  | 'fingerprint'
  /** Same message ID with different content: a spoofed or mis-generated message. */
  | 'message-id-conflict';

export interface DuplicateCheckResult {
  duplicate: boolean;
  fingerprint: string;
  reason?: DuplicateReason;
  originalMessageId?: string;
  firstSeenAt?: number;
  occurrences?: number;
}

export interface DuplicateDetectorStats {
  tracked: number;
  checked: number;
  duplicates: number;
  conflicts: number;
  evicted: number;
}

export interface MessageQueueItem {
  message: CrossChainMessage;
  queuedAt: number;
  nextRetryAt: number;
  attempts: number;
  /** Wall-clock time the current delivery attempt started (when the message left the queue). */
  inflightAt?: number;
  /** Destination transaction hash once the message has been broadcast, if any. */
  submittedTxHash?: string;
  /** Wall-clock time the message entered the `submitted` state. */
  submittedAt?: number;
}

/** Read-only view of a message currently being delivered, for monitoring and reconciliation. */
export interface InflightMessageSnapshot {
  messageId: string;
  status: MessageStatus;
  attempts: number;
  queuedAt: number;
  inflightAt?: number;
  submittedAt?: number;
  submittedTxHash?: string;
  destinationChainId: string;
  message: CrossChainMessage;
}

/**
 * The actual state of a transaction on its destination chain.
 * `not-found` means no receipt exists at the queried state; `unknown` means the
 * provider could not reach the chain or could not answer.
 */
export type OnChainMessageStatus =
  | { kind: 'confirmed'; blockNumber?: number }
  | { kind: 'reverted'; error?: string }
  | { kind: 'not-found' }
  | { kind: 'unknown'; error?: string };

/**
 * Resolves whether a broadcast message actually landed on its destination
 * chain. Implementations are chain-specific: the relayer ships an EVM adapter
 * backed by `EvmExecutor.getTransactionStatus`, and adapters for other chains
 * can be built to the same shape.
 */
export interface MessageStatusProvider {
  /** Chain this provider answers for; matched against `CrossChainMessage.destinationChainId`. */
  chainId: string;
  getMessageStatus(messageId: string, txHash: string): Promise<OnChainMessageStatus>;
}

export interface ReconciliationConfig {
  /** An in-flight message older than this (measured from when it left the queue) is reconciled. */
  staleAfterMs: number;
  /** Automatic poll interval. `0` disables the timer; `start()` stays an explicit call. */
  intervalMs: number;
  /** Run one `reconcile()` pass when `start()` is called, before the first interval tick. */
  reconcileOnStart: boolean;
  /**
   * A run that only sees provider errors and makes no corrections increments a
   * consecutive counter. When the counter reaches this threshold the
   * reconciler emits `reconciler-degraded` (and `reconciler-recovered` once it
   * makes a correction again). Runs always keep trying, so a recovered
   * provider resumes reconciliation without operator action.
   */
  maxConsecutiveErrorRuns: number;
}

export type ReconciliationAction =
  /** The tracked status already matches the source of truth; nothing was moved. */
  | 'no-op'
  /** Moved back to `queued` for another delivery attempt. */
  | 'requeued'
  /** Marked `confirmed` because the destination receipt is final. */
  | 'confirmed'
  /** Marked `failed` and left alone until an operator intervenes. */
  | 'failed'
  /** Left in flight because the truth could not be established during this run. */
  | 'deferred';

export type ReconciliationReason =
  | 'not-stale'
  | 'stale-processing'
  | 'stale-submitted'
  | 'confirmed-on-chain'
  | 'reverted-on-chain'
  | 'not-found-on-chain'
  | 'provider-unavailable'
  | 'provider-error'
  | 'already-resolved';

export interface MessageReconciliation {
  messageId: string;
  destinationChainId: string;
  /** Tracked status before the reconciliation run. */
  before: MessageStatus;
  /** Tracked status afterwards; unchanged for `no-op` and `deferred`. */
  after: MessageStatus | null;
  action: ReconciliationAction;
  reason: ReconciliationReason;
  detail?: string;
}

export interface ReconciliationSummary {
  runId: number;
  startedAt: number;
  durationMs: number;
  scanned: number;
  transitions: MessageReconciliation[];
}

export interface ReconciliationStats {
  runs: number;
  scanned: number;
  /** Successful corrections: requeued, confirmed or failed transitions. */
  corrections: number;
  requeued: number;
  confirmed: number;
  failed: number;
  deferred: number;
  errors: number;
  providerUnavailable: number;
  consecutiveErrorRuns: number;
  lastRunAt: number | null;
  lastRunDurationMs: number | null;
}
