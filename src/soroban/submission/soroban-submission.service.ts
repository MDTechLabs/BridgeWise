import { createHash } from 'crypto';

export interface SorobanSubmissionRpc {
  sendTransaction(signedTransaction: string): Promise<unknown>;
}

export interface SorobanSubmissionOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface SorobanSubmissionResult {
  transactionId: string;
  status: 'pending' | 'accepted';
  duplicate: boolean;
}

export class SorobanTransactionSubmissionService {
  private readonly inFlight = new Map<
    string,
    Promise<SorobanSubmissionResult>
  >();
  private readonly submitted = new Map<string, SorobanSubmissionResult>();
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    private readonly rpc: SorobanSubmissionRpc,
    options: SorobanSubmissionOptions = {},
  ) {
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 250;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  submit(signedTransaction: string): Promise<SorobanSubmissionResult> {
    if (!signedTransaction?.trim())
      throw new Error('signedTransaction is required');
    const key = createHash('sha256').update(signedTransaction).digest('hex');
    const completed = this.submitted.get(key);
    if (completed) return Promise.resolve({ ...completed, duplicate: true });
    const existing = this.inFlight.get(key);
    if (existing !== undefined)
      return existing.then((result) => ({ ...result, duplicate: true }));

    const request = this.submitWithRetry(signedTransaction, key).then(
      (result) => {
        this.submitted.set(key, result);
        return result;
      },
    );
    this.inFlight.set(key, request);
    return request.finally(() => this.inFlight.delete(key));
  }

  private async submitWithRetry(
    signedTransaction: string,
    fallbackId: string,
  ): Promise<SorobanSubmissionResult> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = this.normalize(
          await this.rpc.sendTransaction(signedTransaction),
          fallbackId,
        );
        if (response.status === 'error') throw new Error(response.error);
        return {
          transactionId: response.transactionId,
          status: response.status,
          duplicate: false,
        };
      } catch (error) {
        if (attempt >= this.maxRetries || !this.isTransient(error)) throw error;
        await this.sleep(this.retryDelayMs * 2 ** attempt);
      }
    }
  }

  private normalize(
    value: any,
    fallbackId: string,
  ): {
    transactionId: string;
    status: 'pending' | 'accepted' | 'error';
    error?: string;
  } {
    if (value?.error || value?.result?.errorResult) {
      return {
        transactionId: fallbackId,
        status: 'error',
        error: value.error?.message ?? value.result.errorResult,
      };
    }
    const result = value?.result ?? value;
    const transactionId =
      result?.hash ?? result?.id ?? result?.transactionId ?? fallbackId;
    const status =
      result?.status === 'ERROR' || result?.status === 'FAILED'
        ? 'error'
        : result?.status === 'PENDING'
          ? 'pending'
          : 'accepted';
    return { transactionId, status };
  }

  private isTransient(error: unknown): boolean {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error);
    return /timeout|temporar|unavailable|429|502|503|504|network/i.test(
      message,
    );
  }
}

export class JsonRpcSorobanSubmissionClient implements SorobanSubmissionRpc {
  constructor(
    private readonly rpcUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async sendTransaction(signedTransaction: string): Promise<unknown> {
    const response = await this.fetcher(this.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'sendTransaction',
        params: { transaction: signedTransaction },
      }),
    });
    if (!response.ok)
      throw new Error(`RPC request failed with HTTP ${response.status}`);
    return response.json();
  }
}
