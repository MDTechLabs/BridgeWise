import * as crypto from 'crypto';

export interface BridgeQuote {
  providerId: string;
  sourceChain: string;
  destinationChain: string;
  fromAsset: string;
  toAsset: string;
  amount: string;
  feeAmount: string;
  receiveAmount: string;
  exchangeRate: string;
  etaSeconds: number;
  slippageBps: number;
}

export interface BridgeExecutionResult {
  sourceTxHash: string;
  destinationTxHash: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  feePaid: string;
  receiveAmount: string;
  completedAt: number;
  error?: string;
}

export class StellarBridgeProviderSandboxAdapter {
  private simulateFailure = false;
  private simulatedLatencyMs = 0;
  private customFeeBps = 10; // 0.1%

  constructor(
    public readonly providerId: string,
    private readonly config: {
      flatFeeUsdCents?: number;
      feeBps?: number;
    } = {},
  ) {}

  setSimulateFailure(value: boolean): void {
    this.simulateFailure = value;
  }

  setSimulatedLatency(ms: number): void {
    this.simulatedLatencyMs = ms;
  }

  async getQuote(
    amount: string,
    fromAsset: string,
    toAsset: string,
    sourceChain: string,
    destinationChain: string,
  ): Promise<BridgeQuote> {
    if (this.simulatedLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulatedLatencyMs));
    }

    if (this.simulateFailure) {
      throw new Error(`Sandbox simulation error: Quote failed for provider ${this.providerId}`);
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      throw new Error('Invalid amount');
    }

    // Calculate fee
    let fee = 0;
    if (this.config.flatFeeUsdCents) {
      fee += this.config.flatFeeUsdCents / 100;
    }
    const bps = this.config.feeBps ?? this.customFeeBps;
    fee += (amt * bps) / 10000;

    const receiveAmount = amt - fee;
    if (receiveAmount <= 0) {
      throw new Error('Amount is too small to cover fees');
    }

    return {
      providerId: this.providerId,
      sourceChain,
      destinationChain,
      fromAsset,
      toAsset,
      amount,
      feeAmount: fee.toFixed(6),
      receiveAmount: receiveAmount.toFixed(6),
      exchangeRate: '1.000000',
      etaSeconds: 15,
      slippageBps: 50,
    };
  }

  async executeTransfer(sourceTxHash: string, quote: BridgeQuote): Promise<BridgeExecutionResult> {
    if (this.simulatedLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulatedLatencyMs));
    }

    if (this.simulateFailure) {
      return {
        sourceTxHash,
        destinationTxHash: '',
        status: 'FAILED',
        feePaid: quote.feeAmount,
        receiveAmount: '0',
        completedAt: Date.now(),
        error: 'Execution simulated failure',
      };
    }

    // Generate simulated destination transaction hash
    const destinationTxHash = '0x' + crypto.createHash('sha256').update(`${sourceTxHash}:${Date.now()}`).digest('hex');

    return {
      sourceTxHash,
      destinationTxHash,
      status: 'SUCCESS',
      feePaid: quote.feeAmount,
      receiveAmount: quote.receiveAmount,
      completedAt: Date.now(),
    };
  }
}
