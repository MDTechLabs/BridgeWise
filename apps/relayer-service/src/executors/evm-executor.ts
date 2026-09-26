import { EventEmitter } from 'events';
import axios from 'axios';
import {
  CrossChainMessage,
  ExecutionResult,
  ExecutorConfig,
  GasRepriceConfig,
} from '../types';

const DEFAULT_GAS_REPRICING: GasRepriceConfig = {
  initialGasPrice: '50000000000',
  maxGasPrice: '500000000000',
  bumpPercentage: 10,
  bumpIntervalBlocks: 3,
  maxBumps: 10,
};

const DEFAULT_CONFIRMATION_BLOCKS = 12;
const DEFAULT_POLL_INTERVAL_MS = 2000;

export class EvmExecutor extends EventEmitter {
  private config: ExecutorConfig;
  private nonce: number = 0;
  private currentGasPrice: bigint;
  private bumpCount: number = 0;

  constructor(config: Partial<ExecutorConfig> & { chainId: string; chainType: 'evm'; rpcUrl: string }) {
    super();
    this.config = {
      ...config,
      gasRepricing: { ...DEFAULT_GAS_REPRICING, ...config.gasRepricing },
      confirmationBlocks: config.confirmationBlocks || DEFAULT_CONFIRMATION_BLOCKS,
      confirmationPollIntervalMs: config.confirmationPollIntervalMs || DEFAULT_POLL_INTERVAL_MS,
    } as ExecutorConfig;
    this.currentGasPrice = BigInt(this.config.gasRepricing.initialGasPrice);
  }

  async execute(message: CrossChainMessage): Promise<ExecutionResult> {
    try {
      this.emit('execution-started', { messageId: message.id, chainId: this.config.chainId });

      const txHash = await this.sendTransaction(message);
      this.emit('transaction-submitted', { messageId: message.id, txHash, chainId: this.config.chainId });

      const receipt = await this.waitForConfirmation(txHash);
      this.bumpCount = 0;

      const result: ExecutionResult = {
        messageId: message.id,
        success: true,
        transactionHash: txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString() || '0',
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

  async getTransactionStatus(txHash: string): Promise<{ confirmed: boolean; blockNumber?: number }> {
    try {
      const response = await axios.post(
        this.config.rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'eth_getTransactionReceipt',
          params: [txHash],
          id: 1,
        },
        { timeout: 10000 },
      );

      const receipt = response.data.result;
      if (!receipt) return { confirmed: false };

      const currentBlock = await this.getBlockNumber();
      const confirmations = currentBlock - parseInt(receipt.blockNumber, 16);

      return {
        confirmed: confirmations >= this.config.confirmationBlocks,
        blockNumber: parseInt(receipt.blockNumber, 16),
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

  getCurrentGasPrice(): string {
    return this.currentGasPrice.toString();
  }

  private async sendTransaction(message: CrossChainMessage): Promise<string> {
    const tx = {
      to: message.recipient,
      data: message.payload,
      gas: message.maxGasLimit ? BigInt(message.maxGasLimit).toString(16) : '0x100000',
      gasPrice: '0x' + this.currentGasPrice.toString(16),
      nonce: '0x' + this.nonce.toString(16),
    };

    const response = await axios.post(
      this.config.rpcUrl,
      {
        jsonrpc: '2.0',
        method: 'eth_sendTransaction',
        params: [tx],
        id: 1,
      },
      { timeout: 30000 },
    );

    if (!response.data.result) {
      throw new Error(response.data.error?.message || 'Transaction submission failed');
    }

    this.nonce++;
    return response.data.result;
  }

  private async waitForConfirmation(txHash: string): Promise<any> {
    const startBlock = await this.getBlockNumber();
    let confirmed = false;

    while (!confirmed) {
      await this.delay(this.config.confirmationPollIntervalMs);

      const response = await axios.post(
        this.config.rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'eth_getTransactionReceipt',
          params: [txHash],
          id: 1,
        },
        { timeout: 10000 },
      );

      const receipt = response.data.result;
      if (!receipt) continue;

      const currentBlock = await this.getBlockNumber();
      const confirmations = currentBlock - parseInt(receipt.blockNumber, 16);

      this.emit('confirmation-progress', {
        txHash,
        confirmations,
        required: this.config.confirmationBlocks,
      });

      if (confirmations >= this.config.confirmationBlocks) {
        confirmed = true;
        return receipt;
      }
    }
  }

  private async getBlockNumber(): Promise<number> {
    const response = await axios.post(
      this.config.rpcUrl,
      {
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      },
      { timeout: 10000 },
    );
    return parseInt(response.data.result, 16);
  }

  private shouldReprice(error: unknown): boolean {
    if (this.bumpCount >= this.config.gasRepricing.maxBumps) return false;

    const message = error instanceof Error ? error.message : String(error);
    const stuckIndicators = [
      'nonce too low',
      'replacement transaction underpriced',
      'transaction underpriced',
      'already known',
      'timeout',
    ];

    return stuckIndicators.some((indicator) => message.toLowerCase().includes(indicator));
  }

  private async handleReprice(
    message: CrossChainMessage,
    error: unknown,
  ): Promise<ExecutionResult> {
    this.bumpCount++;

    const bumpMultiplier = 100 + this.config.gasRepricing.bumpPercentage;
    const newGasPrice = (this.currentGasPrice * BigInt(bumpMultiplier)) / 100n;
    const maxGasPrice = BigInt(this.config.gasRepricing.maxGasPrice);

    this.currentGasPrice = newGasPrice < maxGasPrice ? newGasPrice : maxGasPrice;

    this.emit('gas-repriced', {
      messageId: message.id,
      oldGasPrice: (this.currentGasPrice * 100n / BigInt(bumpMultiplier)).toString(),
      newGasPrice: this.currentGasPrice.toString(),
      bumpCount: this.bumpCount,
      maxBumps: this.config.gasRepricing.maxBumps,
    });

    return this.execute(message);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
