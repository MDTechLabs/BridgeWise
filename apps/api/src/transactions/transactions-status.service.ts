import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Transaction, TransactionStatus } from './entities/transaction.entity';
import {
  TransactionStatusResponse,
  StableTransactionState,
  ChainReference,
  TransactionStatusQuery,
} from './dto/transaction-status.dto';
import { getChainById, getTransactionExplorerUrl } from '../config/chains.config';

/**
 * Service for retrieving transaction status with stable states and chain references
 * Provides a secure, documented interface for status queries
 */
@Injectable()
export class TransactionsStatusService {
  private readonly logger = new Logger(TransactionsStatusService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {}

  /**
   * Get transaction status with stable state and chain references
   * @param id Transaction ID
   * @param query Optional query parameters
   * @returns Transaction status response
   */
  async getStatus(
    id: string,
    query: TransactionStatusQuery = {},
  ): Promise<TransactionStatusResponse> {
    const transaction = await this.transactionRepo.findOne({ where: { id } });
    if (!transaction) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    return this.buildStatusResponse(transaction, query);
  }

  private buildStatusResponse(
    transaction: Transaction,
    query: TransactionStatusQuery,
  ): TransactionStatusResponse {
    const stableState = this.mapToStableState(transaction);
    const sourceChain = this.buildChainReference(
      transaction,
      'source',
      query.includeChainDetails,
    );
    const destinationChain = this.buildChainReference(
      transaction,
      'destination',
      query.includeChainDetails,
    );

    const response: TransactionStatusResponse = {
      id: transaction.id,
      type: transaction.type,
      state: stableState,
      status: transaction.status,
      currentStep: transaction.currentStep,
      totalSteps: transaction.totalSteps,
      sourceChain,
      destinationChain: destinationChain || undefined,
      retryCount: transaction.retryCount,
      maxRetries: transaction.maxRetries,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
      completedAt: transaction.completedAt?.toISOString(),
      error: transaction.error || undefined,
      metadata: transaction.metadata || undefined,
    };

    if (query.includeEstimates) {
      response.estimatedTimeRemaining = this.estimateTimeRemaining(transaction);
    }

    return response;
  }

  /**
   * Map legacy TransactionStatus to stable StableTransactionState
   * This provides a stable, versioned state interface
   */
  private mapToStableState(
    transaction: Transaction,
  ): StableTransactionState {
    const { status, currentStep, totalSteps, state } = transaction;

    // Check for cancellation first
    if (state?.cancelled) {
      return StableTransactionState.CANCELLED;
    }

    // Map based on status and step progression
    switch (status) {
      case TransactionStatus.PENDING:
        return currentStep === 0
          ? StableTransactionState.INITIALIZED
          : StableTransactionState.SUBMITTED;

      case TransactionStatus.IN_PROGRESS:
        if (currentStep === 0) {
          return StableTransactionState.INITIALIZED;
        }
        if (currentStep === 1) {
          return StableTransactionState.SUBMITTED;
        }
        if (currentStep < totalSteps - 1) {
          return StableTransactionState.SOURCE_CONFIRMED;
        }
        if (currentStep === totalSteps - 1) {
          return StableTransactionState.DESTINATION_PROCESSING;
        }
        return StableTransactionState.SUBMITTED;

      case TransactionStatus.COMPLETED:
        return StableTransactionState.COMPLETED;

      case TransactionStatus.FAILED:
        return StableTransactionState.FAILED;

      case TransactionStatus.PARTIAL:
        return StableTransactionState.PARTIAL;

      default:
        return StableTransactionState.INITIALIZED;
    }
  }

  /**
   * Build chain reference from transaction metadata
   */
  private buildChainReference(
    transaction: Transaction,
    chainType: 'source' | 'destination',
    includeDetails: boolean = true,
  ): ChainReference | null {
    const metadata = transaction.metadata || {};
    const chainKey = chainType === 'source' ? 'sourceChain' : 'destinationChain';
    const chainId = metadata[chainKey] as string | undefined;

    if (!chainId) {
      return null;
    }

    const chainConfig = getChainById(chainId);
    if (!chainConfig) {
      this.logger.warn(`Chain ${chainId} not found in configuration`);
      return null;
    }

    const txHashKey =
      chainType === 'source' ? 'sourceTxHash' : 'destinationTxHash';
    const txHash = metadata[txHashKey] as string | undefined;

    const blockKey =
      chainType === 'source' ? 'sourceBlockNumber' : 'destinationBlockNumber';
    const blockNumber = metadata[blockKey] as number | undefined;

    const confirmedAtKey =
      chainType === 'source' ? 'sourceConfirmedAt' : 'destinationConfirmedAt';
    const confirmedAt = metadata[confirmedAtKey] as string | undefined;

    const chainRef: ChainReference = {
      chainId: chainConfig.id,
      chainName: chainConfig.name,
      chainNumber: chainConfig.chainId,
      chainType: chainConfig.type,
    };

    if (includeDetails) {
      chainRef.explorerUrl = chainConfig.explorerUrl;
      chainRef.transactionHash = txHash;
      chainRef.blockNumber = blockNumber;
      chainRef.confirmedAt = confirmedAt;
    }

    if (txHash && chainConfig.explorerUrl) {
      chainRef.explorerUrl = getTransactionExplorerUrl(chainId, txHash);
    }

    return chainRef;
  }

  /**
   * Estimate remaining time for transaction completion
   * Based on current step and historical averages
   */
  private estimateTimeRemaining(transaction: Transaction): number | undefined {
    const { currentStep, totalSteps, status } = transaction;

    if (status === TransactionStatus.COMPLETED) {
      return 0;
    }

    if (status === TransactionStatus.FAILED || status === TransactionStatus.PARTIAL) {
      return undefined;
    }

    // Simple estimation: 2 minutes per remaining step
    // In production, this should use historical data
    const remainingSteps = totalSteps - currentStep;
    if (remainingSteps <= 0) {
      return 0;
    }

    // Different chains have different confirmation times
    const metadata = transaction.metadata || {};
    const sourceChain = metadata.sourceChain as string | undefined;
    const chainConfig = sourceChain ? getChainById(sourceChain) : null;

    let avgTimePerStep = 120; // Default 2 minutes per step

    if (chainConfig) {
      // Adjust based on chain type
      switch (chainConfig.type) {
        case 'Stellar':
          avgTimePerStep = 30; // Stellar is faster
          break;
        case 'EVM':
          avgTimePerStep = 180; // EVM chains are slower
          break;
        default:
          avgTimePerStep = 120;
      }
    }

    return remainingSteps * avgTimePerStep;
  }

  /**
   * Get batch status for multiple transactions
   * @param ids Array of transaction IDs
   * @param query Optional query parameters
   * @returns Array of transaction status responses
   */
  async getBatchStatus(
    ids: string[],
    query: TransactionStatusQuery = {},
  ): Promise<TransactionStatusResponse[]> {
    const transactions = await this.transactionRepo.findByIds(ids);
    const transactionsById = new Map(
      transactions.map((transaction) => [transaction.id, transaction]),
    );
    const results: TransactionStatusResponse[] = [];

    for (const id of ids) {
      const transaction = transactionsById.get(id);
      if (!transaction) {
        continue;
      }

      try {
        results.push(this.buildStatusResponse(transaction, query));
      } catch (error) {
        this.logger.error(`Failed to get status for transaction ${transaction.id}: ${error.message}`);
        // Skip failed transactions in batch
      }
    }

    return results;
  }
}
