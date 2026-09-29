import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';

import { TransactionsStatusService } from './transactions-status.service';
import { Transaction, TransactionStatus } from './entities/transaction.entity';
import {
  StableTransactionState,
  TransactionStatusQuery,
} from './dto/transaction-status.dto';

describe('TransactionsStatusService', () => {
  let service: TransactionsStatusService;
  let transactionRepo: Repository<Transaction>;

  const mockTransaction: Transaction = {
    id: 'txn_123',
    type: 'stellar-payment',
    status: TransactionStatus.IN_PROGRESS,
    currentStep: 1,
    totalSteps: 3,
    metadata: {
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      sourceTxHash: 'abc123',
      sourceBlockNumber: 12345,
      sourceConfirmedAt: '2026-01-29T10:00:00.000Z',
    },
    state: {},
    error: null,
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date('2026-01-29T10:00:00.000Z'),
    updatedAt: new Date('2026-01-29T10:01:00.000Z'),
    completedAt: null,
  };

  const mockTransactionRepo = {
    findOne: jest.fn(),
    findByIds: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsStatusService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepo,
        },
      ],
    }).compile();

    service = module.get<TransactionsStatusService>(TransactionsStatusService);
    transactionRepo = module.get<Repository<Transaction>>(
      getRepositoryToken(Transaction),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStatus', () => {
    it('should return transaction status with stable state', async () => {
      mockTransactionRepo.findOne.mockResolvedValue(mockTransaction);

      const result = await service.getStatus('txn_123');

      expect(result).toBeDefined();
      expect(result.id).toBe('txn_123');
      expect(result.state).toBe(StableTransactionState.SUBMITTED);
      expect(result.sourceChain).toBeDefined();
      expect(result.sourceChain.chainId).toBe('stellar');
      expect(mockTransactionRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'txn_123' },
      });
    });

    it('should include chain details when requested', async () => {
      mockTransactionRepo.findOne.mockResolvedValue(mockTransaction);

      const query: TransactionStatusQuery = { includeChainDetails: true };
      const result = await service.getStatus('txn_123', query);

      expect(result.sourceChain.explorerUrl).toBeDefined();
      expect(result.sourceChain.transactionHash).toBe('abc123');
      expect(result.sourceChain.blockNumber).toBe(12345);
    });

    it('should include time estimates when requested', async () => {
      mockTransactionRepo.findOne.mockResolvedValue(mockTransaction);

      const query: TransactionStatusQuery = { includeEstimates: true };
      const result = await service.getStatus('txn_123', query);

      expect(result.estimatedTimeRemaining).toBeDefined();
      expect(typeof result.estimatedTimeRemaining).toBe('number');
    });

    it('should throw NotFoundException for non-existent transaction', async () => {
      mockTransactionRepo.findOne.mockResolvedValue(null);

      await expect(service.getStatus('invalid_id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getStatus('invalid_id')).rejects.toThrow(
        'Transaction invalid_id not found',
      );
    });

    it('should map completed status to COMPLETED state', async () => {
      const completedTransaction = {
        ...mockTransaction,
        status: TransactionStatus.COMPLETED,
        currentStep: 3,
        totalSteps: 3,
        completedAt: new Date('2026-01-29T10:05:00.000Z'),
      };
      mockTransactionRepo.findOne.mockResolvedValue(completedTransaction);

      const result = await service.getStatus('txn_123');

      expect(result.state).toBe(StableTransactionState.COMPLETED);
      expect(result.completedAt).toBeDefined();
    });

    it('should map failed status to FAILED state', async () => {
      const failedTransaction = {
        ...mockTransaction,
        status: TransactionStatus.FAILED,
        error: 'Insufficient funds',
      };
      mockTransactionRepo.findOne.mockResolvedValue(failedTransaction);

      const result = await service.getStatus('txn_123');

      expect(result.state).toBe(StableTransactionState.FAILED);
      expect(result.error).toBe('Insufficient funds');
    });

    it('should map partial status to PARTIAL state', async () => {
      const partialTransaction = {
        ...mockTransaction,
        status: TransactionStatus.PARTIAL,
      };
      mockTransactionRepo.findOne.mockResolvedValue(partialTransaction);

      const result = await service.getStatus('txn_123');

      expect(result.state).toBe(StableTransactionState.PARTIAL);
    });

    it('should map cancelled state to CANCELLED', async () => {
      const cancelledTransaction = {
        ...mockTransaction,
        state: { cancelled: true },
      };
      mockTransactionRepo.findOne.mockResolvedValue(cancelledTransaction);

      const result = await service.getStatus('txn_123');

      expect(result.state).toBe(StableTransactionState.CANCELLED);
    });

    it('should handle missing chain information gracefully', async () => {
      const transactionWithoutChain = {
        ...mockTransaction,
        metadata: {},
      };
      mockTransactionRepo.findOne.mockResolvedValue(transactionWithoutChain);

      const result = await service.getStatus('txn_123');

      expect(result.sourceChain).toBeNull();
    });

    it('should return zero time remaining for completed transactions', async () => {
      const completedTransaction = {
        ...mockTransaction,
        status: TransactionStatus.COMPLETED,
      };
      mockTransactionRepo.findOne.mockResolvedValue(completedTransaction);

      const query: TransactionStatusQuery = { includeEstimates: true };
      const result = await service.getStatus('txn_123', query);

      expect(result.estimatedTimeRemaining).toBe(0);
    });

    it('should return undefined time remaining for failed transactions', async () => {
      const failedTransaction = {
        ...mockTransaction,
        status: TransactionStatus.FAILED,
      };
      mockTransactionRepo.findOne.mockResolvedValue(failedTransaction);

      const query: TransactionStatusQuery = { includeEstimates: true };
      const result = await service.getStatus('txn_123', query);

      expect(result.estimatedTimeRemaining).toBeUndefined();
    });
  });

  describe('getBatchStatus', () => {
    it('should return status for multiple transactions', async () => {
      const transactions = [
        mockTransaction,
        { ...mockTransaction, id: 'txn_456', status: TransactionStatus.COMPLETED },
      ];
      mockTransactionRepo.findByIds.mockResolvedValue(transactions);

      const result = await service.getBatchStatus(['txn_123', 'txn_456']);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('txn_123');
      expect(result[1].id).toBe('txn_456');
    });

    it('should handle empty array', async () => {
      mockTransactionRepo.findByIds.mockResolvedValue([]);

      const result = await service.getBatchStatus([]);

      expect(result).toHaveLength(0);
    });

    it('should skip IDs missing from the batch query result', async () => {
      const transactions = [mockTransaction];
      mockTransactionRepo.findByIds.mockResolvedValue(transactions);

      const result = await service.getBatchStatus(['txn_123', 'missing-id']);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('txn_123');
      expect(mockTransactionRepo.findOne).not.toHaveBeenCalled();
    });

    it('should apply query parameters to all transactions in batch', async () => {
      const transactions = [mockTransaction, { ...mockTransaction, id: 'txn_456' }];
      mockTransactionRepo.findByIds.mockResolvedValue(transactions);

      const query: TransactionStatusQuery = {
        includeChainDetails: true,
        includeEstimates: true,
      };
      const result = await service.getBatchStatus(['txn_123', 'txn_456'], query);

      expect(result).toHaveLength(2);
      result.forEach((status) => {
        expect(status.sourceChain.explorerUrl).toBeDefined();
        expect(status.estimatedTimeRemaining).toBeDefined();
      });
    });
  });

  describe('state mapping', () => {
    it('should map pending with step 0 to INITIALIZED', async () => {
      const transaction = {
        ...mockTransaction,
        status: TransactionStatus.PENDING,
        currentStep: 0,
      };
      mockTransactionRepo.findOne.mockResolvedValue(transaction);

      const result = await service.getStatus('txn_123');

      expect(result.state).toBe(StableTransactionState.INITIALIZED);
    });

    it('should map pending with step > 0 to SUBMITTED', async () => {
      const transaction = {
        ...mockTransaction,
        status: TransactionStatus.PENDING,
        currentStep: 1,
      };
      mockTransactionRepo.findOne.mockResolvedValue(transaction);

      const result = await service.getStatus('txn_123');

      expect(result.state).toBe(StableTransactionState.SUBMITTED);
    });

    it('should map in-progress step 1 to SUBMITTED', async () => {
      const transaction = {
        ...mockTransaction,
        status: TransactionStatus.IN_PROGRESS,
        currentStep: 1,
      };
      mockTransactionRepo.findOne.mockResolvedValue(transaction);

      const result = await service.getStatus('txn_123');

      expect(result.state).toBe(StableTransactionState.SUBMITTED);
    });

    it('should map in-progress middle steps to SOURCE_CONFIRMED', async () => {
      const transaction = {
        ...mockTransaction,
        status: TransactionStatus.IN_PROGRESS,
        currentStep: 2,
        totalSteps: 4,
      };
      mockTransactionRepo.findOne.mockResolvedValue(transaction);

      const result = await service.getStatus('txn_123');

      expect(result.state).toBe(StableTransactionState.SOURCE_CONFIRMED);
    });

    it('should map in-progress final step to DESTINATION_PROCESSING', async () => {
      const transaction = {
        ...mockTransaction,
        status: TransactionStatus.IN_PROGRESS,
        currentStep: 2,
        totalSteps: 3,
      };
      mockTransactionRepo.findOne.mockResolvedValue(transaction);

      const result = await service.getStatus('txn_123');

      expect(result.state).toBe(StableTransactionState.DESTINATION_PROCESSING);
    });
  });
});
