export type ChainType = 'evm' | 'soroban' | 'solana';

export interface CrossChainMessage {
  id: string;
  sourceChainId: string;
  destinationChainId: string;
  sourceTxHash: string;
  sourceBlockNumber: number;
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
}

export interface QueueConfig {
  maxRetries: number;
  retryDelayMs: number;
  concurrency: number;
  pollIntervalMs: number;
}

export interface MessageQueueItem {
  message: CrossChainMessage;
  queuedAt: number;
  nextRetryAt: number;
  attempts: number;
}
