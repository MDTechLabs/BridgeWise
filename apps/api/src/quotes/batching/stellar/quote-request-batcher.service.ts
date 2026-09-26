import { Injectable, Logger } from '@nestjs/common';

export interface QuoteRequest {
  /** Caller-supplied id used to map results back to the original request. */
  requestId: string;
  providerId: string;
  sourceAsset: string;
  destinationAsset: string;
  amount: string;
}

export interface QuoteResult<TQuote = unknown> {
  requestId: string;
  providerId: string;
  success: boolean;
  quote?: TQuote;
  error?: string;
}

/** Executes one grouped batch against a provider and returns a quote per request. */
export type BatchExecutor<TQuote = unknown> = (
  providerId: string,
  requests: QuoteRequest[],
) => Promise<Map<string, TQuote>>;

/** Compatible requests share provider + asset pair and can be fetched together. */
export function batchKey(request: QuoteRequest): string {
  return `${request.providerId}::${request.sourceAsset}->${request.destinationAsset}`;
}

/**
 * Batches compatible quote requests across providers to cut network overhead,
 * while preserving each individual request's context and tolerating partial
 * provider failures (a failed batch only fails its own members).
 */
@Injectable()
export class QuoteRequestBatcherService {
  private readonly logger = new Logger(QuoteRequestBatcherService.name);

  /** Group requests into compatible batches keyed by provider + asset pair. */
  group(requests: QuoteRequest[]): Map<string, QuoteRequest[]> {
    const groups = new Map<string, QuoteRequest[]>();
    for (const request of requests) {
      const key = batchKey(request);
      const list = groups.get(key) ?? [];
      list.push(request);
      groups.set(key, list);
    }
    return groups;
  }

  /**
   * Execute all requests, batching compatible ones. Individual results are
   * preserved and a failure in one batch does not affect others.
   */
  async execute<TQuote>(
    requests: QuoteRequest[],
    executor: BatchExecutor<TQuote>,
  ): Promise<QuoteResult<TQuote>[]> {
    const groups = this.group(requests);
    const settled = await Promise.all(
      [...groups.values()].map((batch) => this.runBatch(batch, executor)),
    );
    return settled.flat();
  }

  private async runBatch<TQuote>(
    batch: QuoteRequest[],
    executor: BatchExecutor<TQuote>,
  ): Promise<QuoteResult<TQuote>[]> {
    const providerId = batch[0].providerId;
    try {
      const quotes = await executor(providerId, batch);
      return batch.map((request) => {
        const quote = quotes.get(request.requestId);
        return quote === undefined
          ? {
              requestId: request.requestId,
              providerId,
              success: false,
              error: 'No quote returned for request.',
            }
          : { requestId: request.requestId, providerId, success: true, quote };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Batch for provider "${providerId}" failed: ${message}`);
      return batch.map((request) => ({
        requestId: request.requestId,
        providerId,
        success: false,
        error: message,
      }));
    }
  }
}
