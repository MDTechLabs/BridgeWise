import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { TransactionsExportService } from './transactions-export.service';
import { TransactionRetryService } from './retry/transaction-retry.service';
import { TransactionsStatusService } from './transactions-status.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { TransactionStatusResponse, StableTransactionState } from './dto/transaction-status.dto';

describe('TransactionsController', () => {
  let controller: TransactionsController;
  let statusService: TransactionsStatusService;
  let transactionService: TransactionsService;

  const mockTransaction = {
    id: 'txn_123',
    type: 'stellar-payment',
    status: 'in_progress',
    currentStep: 1,
    totalSteps: 3,
    metadata: {},
    state: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockStatusResponse: TransactionStatusResponse = {
    id: 'txn_123',
    type: 'stellar-payment',
    state: StableTransactionState.SUBMITTED,
    status: 'in_progress' as any,
    currentStep: 1,
    totalSteps: 3,
    sourceChain: {
      chainId: 'stellar',
      chainName: 'Stellar Mainnet',
      chainNumber: 1,
      chainType: 'Stellar',
    },
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockStatusService = {
    getStatus: jest.fn(),
    getBatchStatus: jest.fn(),
  };

  const mockTransactionService = {
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    advanceStep: jest.fn(),
  };

  const mockExportService = {
    getTransactionsForExport: jest.fn(),
    convertToCSV: jest.fn(),
    convertToJSON: jest.fn(),
  };

  const mockRetryService = {
    retryTransaction: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        {
          provide: TransactionsService,
          useValue: mockTransactionService,
        },
        {
          provide: TransactionsExportService,
          useValue: mockExportService,
        },
        {
          provide: TransactionRetryService,
          useValue: mockRetryService,
        },
        {
          provide: TransactionsStatusService,
          useValue: mockStatusService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    controller = module.get<TransactionsController>(TransactionsController);
    statusService = module.get<TransactionsStatusService>(TransactionsStatusService);
    transactionService = module.get<TransactionsService>(TransactionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStatus', () => {
    it('should return transaction status', async () => {
      mockStatusService.getStatus.mockResolvedValue(mockStatusResponse);

      const result = await controller.getStatus('txn_123', {});

      expect(result).toEqual(mockStatusResponse);
      expect(mockStatusService.getStatus).toHaveBeenCalledWith('txn_123', {});
    });

    it('should pass query parameters to service', async () => {
      mockStatusService.getStatus.mockResolvedValue(mockStatusResponse);

      const query = {
        includeChainDetails: true,
        includeEstimates: true,
      };

      await controller.getStatus('txn_123', query);

      expect(mockStatusService.getStatus).toHaveBeenCalledWith('txn_123', query);
    });

    it('should handle service errors', async () => {
      mockStatusService.getStatus.mockRejectedValue(
        new NotFoundException('Transaction not found'),
      );

      await expect(controller.getStatus('invalid_id', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return status with chain details when requested', async () => {
      const responseWithDetails = {
        ...mockStatusResponse,
        sourceChain: {
          ...mockStatusResponse.sourceChain,
          explorerUrl: 'https://stellar.expert',
          transactionHash: 'abc123',
        },
      };
      mockStatusService.getStatus.mockResolvedValue(responseWithDetails);

      const query = { includeChainDetails: true };
      const result = await controller.getStatus('txn_123', query);

      expect(result.sourceChain.explorerUrl).toBeDefined();
      expect(mockStatusService.getStatus).toHaveBeenCalledWith('txn_123', query);
    });

    it('should return status with time estimates when requested', async () => {
      const responseWithEstimates = {
        ...mockStatusResponse,
        estimatedTimeRemaining: 120,
      };
      mockStatusService.getStatus.mockResolvedValue(responseWithEstimates);

      const query = { includeEstimates: true };
      const result = await controller.getStatus('txn_123', query);

      expect(result.estimatedTimeRemaining).toBe(120);
      expect(mockStatusService.getStatus).toHaveBeenCalledWith('txn_123', query);
    });
  });

  describe('getTransaction', () => {
    it('should return transaction details', async () => {
      mockTransactionService.findById.mockResolvedValue(mockTransaction);

      const result = await controller.getTransaction('txn_123');

      expect(result).toEqual(mockTransaction);
      expect(mockTransactionService.findById).toHaveBeenCalledWith('txn_123');
    });

    it('should handle not found errors', async () => {
      mockTransactionService.findById.mockRejectedValue(
        new NotFoundException('Transaction not found'),
      );

      await expect(controller.getTransaction('invalid_id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
