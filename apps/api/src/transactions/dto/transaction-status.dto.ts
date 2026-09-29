import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionStatus } from '../entities/transaction.entity';

/**
 * Stable transaction state definitions
 * These states are versioned and should not change without major version bump
 */
export enum StableTransactionState {
  /** Transaction initialized but not yet submitted to blockchain */
  INITIALIZED = 'initialized',
  /** Transaction submitted to blockchain, awaiting confirmation */
  SUBMITTED = 'submitted',
  /** Transaction confirmed on source chain, awaiting destination chain processing */
  SOURCE_CONFIRMED = 'source_confirmed',
  /** Transaction being processed on destination chain */
  DESTINATION_PROCESSING = 'destination_processing',
  /** Transaction completed successfully on all chains */
  COMPLETED = 'completed',
  /** Transaction failed and cannot be retried */
  FAILED = 'failed',
  /** Transaction partially completed (some steps succeeded) */
  PARTIAL = 'partial',
  /** Transaction cancelled by user or system */
  CANCELLED = 'cancelled',
}

/**
 * Chain reference information
 */
export class ChainReference {
  @ApiProperty({
    description: 'Chain identifier (e.g., "ethereum", "stellar", "polygon")',
    example: 'ethereum',
  })
  chainId: string;

  @ApiProperty({
    description: 'Human-readable chain name',
    example: 'Ethereum Mainnet',
  })
  chainName: string;

  @ApiProperty({
    description: 'Numeric chain ID for EVM chains',
    example: 1,
    required: false,
  })
  chainNumber?: number;

  @ApiProperty({
    description: 'Chain type',
    enum: ['EVM', 'Stellar', 'Cosmos', 'Solana'],
    example: 'EVM',
  })
  chainType: 'EVM' | 'Stellar' | 'Cosmos' | 'Solana';

  @ApiProperty({
    description: 'Blockchain explorer URL for this chain',
    example: 'https://etherscan.io',
    required: false,
  })
  explorerUrl?: string;

  @ApiProperty({
    description: 'Transaction hash on this chain',
    example: '0x123abc...',
    required: false,
  })
  transactionHash?: string;

  @ApiProperty({
    description: 'Block number of transaction',
    example: 12345678,
    required: false,
  })
  blockNumber?: number;

  @ApiProperty({
    description: 'Timestamp when transaction was confirmed on this chain',
    example: '2026-01-29T10:00:00.000Z',
    required: false,
  })
  confirmedAt?: string;
}

/**
 * Transaction status response with stable states and chain references
 */
export class TransactionStatusResponse {
  @ApiProperty({
    description: 'Unique transaction identifier',
    example: 'txn_550e8400e29b41d4a716446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Transaction type (e.g., stellar-payment, hop-bridge, layerzero-omnichain)',
    example: 'stellar-payment',
  })
  type: string;

  @ApiProperty({
    description: 'Current stable state of the transaction',
    enum: StableTransactionState,
    example: StableTransactionState.SUBMITTED,
  })
  state: StableTransactionState;

  @ApiProperty({
    description: 'Legacy status for backward compatibility',
    enum: TransactionStatus,
    example: TransactionStatus.IN_PROGRESS,
    required: false,
  })
  status?: TransactionStatus;

  @ApiProperty({
    description: 'Current step in the transaction workflow',
    example: 1,
  })
  currentStep: number;

  @ApiProperty({
    description: 'Total number of steps in the transaction workflow',
    example: 3,
  })
  totalSteps: number;

  @ApiProperty({
    description: 'Source chain information',
    type: ChainReference,
  })
  sourceChain: ChainReference;

  @ApiProperty({
    description: 'Destination chain information',
    type: ChainReference,
    required: false,
  })
  destinationChain?: ChainReference;

  @ApiProperty({
    description: 'Estimated completion time in seconds',
    example: 300,
    required: false,
  })
  estimatedTimeRemaining?: number;

  @ApiProperty({
    description: 'Error message if transaction failed',
    example: 'Insufficient funds',
    required: false,
  })
  error?: string;

  @ApiProperty({
    description: 'Retry attempt count',
    example: 0,
  })
  retryCount: number;

  @ApiProperty({
    description: 'Maximum retry attempts allowed',
    example: 3,
  })
  maxRetries: number;

  @ApiProperty({
    description: 'Transaction creation timestamp',
    example: '2026-01-29T10:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2026-01-29T10:00:05.000Z',
  })
  updatedAt: string;

  @ApiProperty({
    description: 'Transaction completion timestamp',
    example: '2026-01-29T10:05:00.000Z',
    required: false,
  })
  completedAt?: string;

  @ApiProperty({
    description: 'Additional metadata',
    example: { memo: 'Cross-chain transfer' },
    required: false,
  })
  metadata?: Record<string, any>;
}

/**
 * Query parameters for status retrieval
 */
export class TransactionStatusQuery {
  @ApiPropertyOptional({
    description: 'Include detailed chain information',
    default: true,
  })
  includeChainDetails?: boolean;

  @ApiPropertyOptional({
    description: 'Include estimated time remaining',
    default: false,
  })
  includeEstimates?: boolean;
}
