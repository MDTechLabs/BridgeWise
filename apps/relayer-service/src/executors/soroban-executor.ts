import { EventEmitter } from 'events';
import axios from 'axios';
import {
  CrossChainMessage,
  ExecutionResult,
  ExecutorConfig,
  GasRepriceConfig,
} from '../types';

const DEFAULT_GAS_REPRICING: GasRepriceConfig = {
  initialGasPrice: '100',
  maxGasPrice: '100000',
  bumpPercentage: 15,
  bumpIntervalBlocks: 5,
  maxBumps: 8,
};

const DEFAULT_CONFIRMATION_BLOCKS = 5;
const DEFAULT_POLL_INTERVAL_MS = 3000;

export class SorobanExecutor extends EventEmitter {
  private config: ExecutorConfig;
  private nonce: number = 0;
  private currentBaseFee: bigint;
  private bumpCount: number = 0;

  constructor(config: Partial<ExecutorConfig> & { chainId: string; chainType: 'soroban'; rpcUrl: string }) {
    super();
    this.config = {
      ...config,
      gasRepricing: { ...DEFAULT_GAS_REPRICING, ...config.gasRepricing },
      confirmationBlocks: config.confirmationBlocks || DEFAULT_CONFIRMATION_BLOCKS,
      confirmationPollIntervalMs: config.confirmationPollIntervalMs || DEFAULT_POLL_INTERVAL_MS,
    } as ExecutorConfig;
    this.currentBaseFee = BigInt(this.config.gasRepricing.initialGasPrice);
  }

  async execute(message: CrossChainMessage): Promise<ExecutionResult> {
    try {
      this.emit('execution-started', { messageId: message.id, chainId: this.config.chainId });

      const feeStats = await this.getFeeStats();
      const { txHash } = await this.submitTransaction(message, feeStats);
      this.emit('transaction-submitted', { messageId: message.id, txHash, chainId: this.config.chainId });

      const receipt = await this.waitForConfirmation(txHash);

      this.bumpCount = 0;

      const result: ExecutionResult = {
        messageId: message.id,
        success: true,
        transactionHash: txHash,
        blockNumber: receipt.ledger,
        gasUsed: receipt.feeBcharged?.toString() || '0',
        timestamp: Date.now(),
      };

      this.emit('execution-completed', result);
      return result;
    } catch (error: unknown) {
      const message_ = error instanceof Error ? error.message : String(error);
      this.emit('execution-error', { messageId: message.id, error: message_ });

      if (this.shouldReprice(error)) {
        return this.handleReprice(message, error);
      }

      return {
        messageId: message.id,
        success: false,
        error: message_,
        timestamp: Date.now(),
      };
    }
  }

  async getTransactionStatus(txHash: string): Promise<{ confirmed: boolean; ledger?: number }> {
    try {
      const response = await axios.post(
        this.config.rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'getTransaction',
          params: [txHash],
          id: 1,
        },
        { timeout: 10000 },
      );

      const result = response.data.result;
      if (!result || result.status === 'NOT_FOUND') return { confirmed: false };

      const latestLedger = await this.getLatestLedger();
      const confirmations = latestLedger - result.ledger;

      return {
        confirmed: confirmations >= this.config.confirmationBlocks,
        ledger: result.ledger,
      };
    } catch {
      return { confirmed: false };
    }
  }

  updateNonce(nonce: number): void {
    this.nonce = nonce;
  }

  getNonce(): number {
    return this.nonce;
  }

  getCurrentBaseFee(): string {
    return this.currentBaseFee.toString();
  }

  private async getFeeStats(): Promise<any> {
    const response = await axios.get(
      `${this.config.rpcUrl.replace(/\/$/, '')}/feeStats`,
      { timeout: 10000 },
    );
    return response.data;
  }

  private async submitTransaction(message: CrossChainMessage, feeStats: any): Promise<{ txHash: string }> {
    const baseFee = BigInt(feeStats?.fee_charged?.max || feeStats?.maxFee || '1000');
    const surgeFee = BigInt(feeStats?.max_fee?.max || feeStats?.surgeFee || '10000');
    const fee = baseFee + surgeFee + this.currentBaseFee;

    const tx = {
      tx: {
        sourceAccount: message.sender,
        fee: fee.toString(),
        operations: [
          {
            _type: 'invokeHostFunction',
            function: message.messageType,
            parameters: message.payload,
          },
        ],
        memo: { type: 'text', text: message.id },
      },
    };

    const response = await axios.post(
      this.config.rpcUrl,
      {
        jsonrpc: '2.0',
        method: 'sendTransaction',
        params: [tx],
        id: 1,
      },
      { timeout: 30000 },
    );

    if (!response.data.result?.hash) {
      throw new Error(response.data.error?.message || 'Soroban transaction submission failed');
    }

    this.nonce++;
    return { txHash: response.data.result.hash };
  }

  private async waitForConfirmation(txHash: string): Promise<any> {
    let confirmed = false;

    while (!confirmed) {
      await this.delay(this.config.confirmationPollIntervalMs);

      const response = await axios.post(
        this.config.rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'getTransaction',
          params: [txHash],
          id: 1,
        },
        { timeout: 10000 },
      );

      const result = response.data.result;
      if (!result || result.status === 'NOT_FOUND') continue;

      const latestLedger = await this.getLatestLedger();
      const confirmations = latestLedger - result.ledger;

      this.emit('confirmation-progress', {
        txHash,
        confirmations,
        required: this.config.confirmationBlocks,
        status: result.status,
      });

      if (result.status === 'SUCCESS' && confirmations >= this.config.confirmationBlocks) {
        confirmed = true;
        return result;
      }

      if (result.status === 'FAILED') {
        throw new Error(`Soroban transaction failed: ${result.result?.error || 'unknown'}`);
      }
    }
  }

  private async getLatestLedger(): Promise<number> {
    const response = await axios.get(
      `${this.config.rpcUrl.replace(/\/$/, '')}/latestLedger`,
      { timeout: 10000 },
    );
    return response.data?.sequence || response.data?.ledger || 0;
  }

  private shouldReprice(error: unknown): boolean {
    if (this.bumpCount >= this.config.gasRepricing.maxBumps) return false;

    const message = error instanceof Error ? error.message : String(error);
    const stuckIndicators = [
      'insufficient fee',
      'tx too large',
      'timeout',
      'bad sequence',
      'fee bump',
    ];

    return stuckIndicators.some((indicator) => message.toLowerCase().includes(indicator));
  }

  private async handleReprice(
    message: CrossChainMessage,
    error: unknown,
  ): Promise<ExecutionResult> {
    this.bumpCount++;

    const bumpMultiplier = 100 + this.config.gasRepricing.bumpPercentage;
    const newBaseFee = (this.currentBaseFee * BigInt(bumpMultiplier)) / 100n;
    const maxBaseFee = BigInt(this.config.gasRepricing.maxGasPrice);

    this.currentBaseFee = newBaseFee < maxBaseFee ? newBaseFee : maxBaseFee;

    this.emit('gas-repriced', {
      messageId: message.id,
      oldBaseFee: (this.currentBaseFee * 100n / BigInt(bumpMultiplier)).toString(),
      newBaseFee: this.currentBaseFee.toString(),
      bumpCount: this.bumpCount,
      maxBumps: this.config.gasRepricing.maxBumps,
    });

    return this.execute(message);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
