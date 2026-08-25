export type StellarTransactionState =
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'NOT_FOUND';

export interface StellarConfirmationRpc {
  getTransaction(
    transactionId: string,
  ): Promise<{ status: StellarTransactionState; [key: string]: unknown }>;
}

export interface StellarConfirmationOptions {
  intervalMs?: number;
  timeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface StellarConfirmationResult {
  transactionId: string;
  status: 'success' | 'failed' | 'timeout';
  details?: Record<string, unknown>;
}

export class StellarTransactionConfirmationPoller {
  constructor(
    private readonly rpc: StellarConfirmationRpc,
    private readonly options: StellarConfirmationOptions = {},
  ) {}

  async waitForConfirmation(
    transactionId: string,
  ): Promise<StellarConfirmationResult> {
    if (!transactionId?.trim()) throw new Error('transactionId is required');
    const intervalMs = this.options.intervalMs ?? 5_000;
    const timeoutMs = this.options.timeoutMs ?? 300_000;
    const sleep =
      this.options.sleep ??
      ((milliseconds: number) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    const started = Date.now();

    while (true) {
      const response = await this.rpc.getTransaction(transactionId);
      if (response.status === 'SUCCESS')
        return { transactionId, status: 'success', details: response };
      if (response.status === 'FAILED' || response.status === 'NOT_FOUND')
        return { transactionId, status: 'failed', details: response };
      if (Date.now() - started >= timeoutMs)
        return { transactionId, status: 'timeout' };
      await sleep(intervalMs);
      if (Date.now() - started >= timeoutMs)
        return { transactionId, status: 'timeout' };
    }
  }
}
