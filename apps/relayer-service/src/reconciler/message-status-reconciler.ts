import { EventEmitter } from 'events';
import { MessageQueue } from '../queue/message-queue';
import {
  ExecutionResult,
  InflightMessageSnapshot,
  MessageReconciliation,
  MessageStatusProvider,
  OnChainMessageStatus,
  ReconciliationAction,
  ReconciliationConfig,
  ReconciliationReason,
  ReconciliationStats,
  ReconciliationSummary,
} from '../types';

export const DEFAULT_RECONCILIATION_CONFIG: ReconciliationConfig = {
  staleAfterMs: 5 * 60_000,
  intervalMs: 60_000,
  reconcileOnStart: true,
  maxConsecutiveErrorRuns: 3,
};

export interface MessageStatusReconcilerOptions {
  queue: MessageQueue;
  /** Chain status providers. A message is only reconciled when a provider exists for its destination chain. */
  provider?: MessageStatusProvider | MessageStatusProvider[];
  config?: Partial<ReconciliationConfig>;
}

function emptyStats(): ReconciliationStats {
  return {
    runs: 0,
    scanned: 0,
    corrections: 0,
    requeued: 0,
    confirmed: 0,
    failed: 0,
    deferred: 0,
    errors: 0,
    providerUnavailable: 0,
    consecutiveErrorRuns: 0,
    lastRunAt: null,
    lastRunDurationMs: null,
  };
}

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Repairs drift between the queue's tracked message status and the truth on
 * the destination chain:
 *
 * - a `processing` message that has been in flight past `staleAfterMs`
 *   (an executor that hung without reporting) is returned to `queued` for
 *   another attempt, or moved to `failed` once the retry budget is spent;
 * - a `submitted` message whose transaction is confirmed on-chain is
 *   completed as `confirmed`;
 * - a `submitted` message whose transaction reverted is failed immediately
 *   (a revert is treated as deterministic, so retrying would only burn gas);
 * - a `submitted` message with no destination receipt after `staleAfterMs`
 *   is returned to `queued` for resubmission;
 * - when the destination chain cannot be reached, the message is left in
 *   flight and the run is counted as an error.
 *
 * Reconciliation never touches a freshly dequeued message (`staleAfterMs`
 * grace), a `queued` or `failed` message, or a message without a provider, so
 * a healthy pipeline is unaffected and nothing is silently resurrected.
 */
export class MessageStatusReconciler extends EventEmitter {
  private readonly queue: MessageQueue;
  private readonly config: ReconciliationConfig;
  private readonly providers: Map<string, MessageStatusProvider>;
  private readonly stats: ReconciliationStats = emptyStats();
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextRunId = 0;
  private currentRun: Promise<ReconciliationSummary> | null = null;

  constructor(options: MessageStatusReconcilerOptions) {
    super();
    this.queue = options.queue;
    const providers = options.provider
      ? Array.isArray(options.provider)
        ? options.provider
        : [options.provider]
      : [];
    this.providers = new Map(providers.map((provider) => [provider.chainId, provider]));
    this.config = { ...DEFAULT_RECONCILIATION_CONFIG, ...options.config };
  }

  /** Runs one reconciliation pass. Concurrent calls share a single in-flight run. */
  reconcile(): Promise<ReconciliationSummary> {
    if (!this.currentRun) {
      this.currentRun = this.run().finally(() => {
        this.currentRun = null;
      });
    }
    return this.currentRun;
  }

  /** Starts periodic reconciliation. Also runs one pass when `reconcileOnStart` is set. */
  start(): void {
    if (this.timer) return;
    this.emit('reconciler-started', { config: { ...this.config } });
    if (this.config.reconcileOnStart) {
      void this.reconcile();
    }
    if (this.config.intervalMs > 0) {
      this.timer = setInterval(() => void this.reconcile(), this.config.intervalMs);
    }
  }

  /** Stops periodic reconciliation. A run already in flight is allowed to finish. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.emit('reconciler-stopped');
  }

  dispose(): void {
    this.stop();
    this.removeAllListeners();
  }

  getStats(): ReconciliationStats {
    return { ...this.stats };
  }

  private async run(): Promise<ReconciliationSummary> {
    const startedAt = Date.now();
    const runId = ++this.nextRunId;
    const snapshot = this.queue.getInflightSnapshot();
    this.stats.runs++;
    this.stats.scanned += snapshot.length;

    const degraded = (count: number) => count > 0 && count >= this.config.maxConsecutiveErrorRuns;
    const wasDegraded = degraded(this.stats.consecutiveErrorRuns);

    const transitions: MessageReconciliation[] = [];
    for (const item of snapshot) {
      transitions.push(await this.reconcileItem(item, startedAt));
    }

    const durationMs = Date.now() - startedAt;
    this.stats.lastRunAt = startedAt;
    this.stats.lastRunDurationMs = durationMs;

    const hadErrors = transitions.some((t) => t.reason === 'provider-error');
    const hadCorrections = transitions.some(
      (t) => t.action === 'requeued' || t.action === 'confirmed' || t.action === 'failed',
    );
    this.stats.consecutiveErrorRuns = hadErrors && !hadCorrections ? this.stats.consecutiveErrorRuns + 1 : 0;

    const isDegraded = degraded(this.stats.consecutiveErrorRuns);
    if (isDegraded && !wasDegraded) {
      this.emit('reconciler-degraded', {
        runId,
        consecutiveErrorRuns: this.stats.consecutiveErrorRuns,
        message:
          'repeated provider errors with no corrections; check the chain status providers before the queue fills with stuck submitted messages',
      });
    } else if (!isDegraded && wasDegraded) {
      this.emit('reconciler-recovered', { runId });
    }

    const summary: ReconciliationSummary = {
      runId,
      startedAt,
      durationMs,
      scanned: transitions.length,
      transitions,
    };
    this.emit('reconciliation-summary', summary);
    return summary;
  }

  private async reconcileItem(item: InflightMessageSnapshot, now: number): Promise<MessageReconciliation> {
    const ageMs = now - (item.inflightAt ?? item.queuedAt);

    if (item.status === 'processing') {
      if (ageMs < this.config.staleAfterMs) {
        return this.defer(item, 'not-stale', `in flight for ${ageMs}ms, within the stale threshold`);
      }
      this.emit('stale-message-detected', {
        messageId: item.messageId,
        status: item.status,
        ageMs,
        staleAfterMs: this.config.staleAfterMs,
      });
      return this.requeueOrFail(item, 'stale-processing', `no completion reported within ${ageMs}ms`);
    }

    if (item.status === 'submitted') {
      if (!item.submittedTxHash) {
        this.stats.errors++;
        this.emit('reconcile-error', {
          messageId: item.messageId,
          chainId: item.destinationChainId,
          error: 'submitted message has no transaction hash to reconcile against',
        });
        return this.defer(item, 'provider-error', 'submitted message has no transaction hash');
      }

      const provider = this.providers.get(item.destinationChainId);
      if (!provider) {
        this.stats.providerUnavailable++;
        return this.defer(
          item,
          'provider-unavailable',
          `no MessageStatusProvider for chain ${item.destinationChainId}`,
        );
      }

      return this.reconcileSubmitted(item, provider, ageMs);
    }

    return this.defer(item, 'already-resolved', `untracked in-flight status ${item.status}`);
  }

  private async reconcileSubmitted(
    item: InflightMessageSnapshot,
    provider: MessageStatusProvider,
    ageMs: number,
  ): Promise<MessageReconciliation> {
    let onChain: OnChainMessageStatus;
    try {
      onChain = await provider.getMessageStatus(item.messageId, item.submittedTxHash as string);
    } catch (error) {
      const message = errMessage(error);
      this.stats.errors++;
      this.emit('reconcile-error', { messageId: item.messageId, chainId: item.destinationChainId, error: message });
      return this.defer(item, 'provider-error', message);
    }

    switch (onChain.kind) {
      case 'confirmed':
        return this.confirm(item, onChain.blockNumber);
      case 'reverted':
        return this.forceFail(item, 'reverted-on-chain', onChain.error ?? 'destination transaction reverted');
      case 'not-found':
        if (ageMs < this.config.staleAfterMs) {
          return this.defer(item, 'not-stale', `no destination receipt after ${ageMs}ms`);
        }
        this.emit('stale-message-detected', {
          messageId: item.messageId,
          status: item.status,
          ageMs,
          staleAfterMs: this.config.staleAfterMs,
        });
        return this.requeueOrFail(item, 'not-found-on-chain', `no destination receipt after ${ageMs}ms`);
      case 'unknown':
      default:
        this.stats.errors++;
        this.emit('reconcile-error', {
          messageId: item.messageId,
          chainId: item.destinationChainId,
          error: onChain.error ?? 'on-chain status unknown',
        });
        return this.defer(item, 'provider-error', onChain.error ?? 'on-chain status unknown');
    }
  }

  private async confirm(item: InflightMessageSnapshot, blockNumber?: number): Promise<MessageReconciliation> {
    const result: ExecutionResult = {
      messageId: item.messageId,
      success: true,
      transactionHash: item.submittedTxHash,
      blockNumber,
      timestamp: Date.now(),
    };
    await this.queue.complete(result);

    const after = this.queue.getMessageStatus(item.messageId);
    if (after !== 'confirmed') {
      return this.defer(item, 'already-resolved', 'message was resolved by another path during this run');
    }
    this.stats.corrections++;
    this.stats.confirmed++;
    return this.concluded(item, 'confirmed', 'confirmed-on-chain', this.confirmDetail(blockNumber));
  }

  private async requeueOrFail(
    item: InflightMessageSnapshot,
    reason: ReconciliationReason,
    detail?: string,
  ): Promise<MessageReconciliation> {
    await this.queue.complete({
      messageId: item.messageId,
      success: false,
      error: this.reasonError(reason, detail),
      timestamp: Date.now(),
    });

    const after = this.queue.getMessageStatus(item.messageId);
    if (after === 'queued') {
      this.stats.corrections++;
      this.stats.requeued++;
      return this.concluded(item, 'requeued', reason, detail);
    }
    if (after === 'failed') {
      this.stats.corrections++;
      this.stats.failed++;
      return this.concluded(item, 'failed', reason, detail);
    }
    return this.defer(item, 'already-resolved', `resolved to ${after} by another path during this run`);
  }

  private async forceFail(
    item: InflightMessageSnapshot,
    reason: ReconciliationReason,
    detail?: string,
  ): Promise<MessageReconciliation> {
    this.queue.fail(item.messageId, this.reasonError(reason, detail));

    const after = this.queue.getMessageStatus(item.messageId);
    if (after !== 'failed') {
      return this.defer(item, 'already-resolved', 'message was resolved by another path during this run');
    }
    this.stats.corrections++;
    this.stats.failed++;
    return this.concluded(item, 'failed', reason, detail);
  }

  private concluded(
    item: InflightMessageSnapshot,
    action: ReconciliationAction,
    reason: ReconciliationReason,
    detail?: string,
  ): MessageReconciliation {
    const transition: MessageReconciliation = {
      messageId: item.messageId,
      destinationChainId: item.destinationChainId,
      before: item.status,
      after: this.queue.getMessageStatus(item.messageId),
      action,
      reason,
      detail,
    };
    this.emit('message-reconciled', transition);
    return transition;
  }

  private defer(item: InflightMessageSnapshot, reason: ReconciliationReason, detail?: string): MessageReconciliation {
    this.stats.deferred++;
    return {
      messageId: item.messageId,
      destinationChainId: item.destinationChainId,
      before: item.status,
      after: item.status,
      action: 'deferred',
      reason,
      detail,
    };
  }

  private confirmDetail(blockNumber?: number): string {
    if (blockNumber === undefined) return 'receipt is final on the destination chain';
    return `receipt is final on the destination chain in block ${blockNumber}`;
  }

  private reasonError(reason: ReconciliationReason, detail?: string): string {
    return `reconcile: ${reason}${detail ? ` (${detail})` : ''}`;
  }
}

export interface GetTransactionStatusResult {
  confirmed: boolean;
  blockNumber?: number;
}

/**
 * Reference `MessageStatusProvider` for EVM destinations. It reuses the
 * executor's own chain view (`EvmExecutor.getTransactionStatus`), so
 * reconciliation applies the same confirmation-depth policy as live delivery.
 * `confirmed: false` from the executor — a missing receipt, or one not yet
 * deep enough — maps to `not-found`, which reconciliation only acts on once
 * the message is past its stale threshold. This avoids thrash right after a
 * broadcast.
 */
export class EvmExecutorStatusProvider implements MessageStatusProvider {
  readonly chainId: string;
  private readonly executor: { getTransactionStatus(txHash: string): Promise<GetTransactionStatusResult> };

  constructor(
    chainId: string,
    executor: { getTransactionStatus(txHash: string): Promise<GetTransactionStatusResult> },
  ) {
    this.chainId = chainId;
    this.executor = executor;
  }

  async getMessageStatus(_messageId: string, txHash: string): Promise<OnChainMessageStatus> {
    const result = await this.executor.getTransactionStatus(txHash);
    if (result.confirmed) {
      return { kind: 'confirmed', blockNumber: result.blockNumber };
    }
    return { kind: 'not-found' };
  }
}