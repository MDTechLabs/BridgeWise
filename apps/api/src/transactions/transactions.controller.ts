import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Sse,
  MessageEvent,
  Res,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import type { Response } from 'express';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import {
  ExportTransactionsDto,
  ExportFormat,
} from './dto/export-transactions.dto';
import { TransactionsService } from './transactions.service';
import { TransactionsExportService } from './transactions-export.service';
import { TransactionRetryService } from './retry/transaction-retry.service';
import { TransactionStatus } from './entities/transaction.entity';

@ApiTags('Transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionService: TransactionsService,
    private readonly exportService: TransactionsExportService,
    private readonly retryService: TransactionRetryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new transaction',
    description:
      'Initiates a new cross-chain transaction with the specified type and configuration. Supports multiple transaction types across different blockchain networks.',
  })
  @ApiBody({
    type: CreateTransactionDto,
    description: 'Transaction creation payload',
    examples: {
      stellar: {
        summary: 'Create Stellar transaction',
        value: {
          type: 'stellar-payment',
          metadata: {
            sourceAccount:
              'GCXMWUAUF37IWOABB3GNXFZB7TBBBHL3IJKUSJUWVEKM3CXEGTHUMDSD',
            destinationAccount:
              'GBRPYHIL2CI3WHZSRJQEMQ5CPQIS2TCCQ7OXJGGUFR7XUWVEPSWR47U',
            amount: '100',
            asset: 'native',
            memo: 'Cross-chain transfer',
          },
          totalSteps: 3,
        },
      },
      hop: {
        summary: 'Create Hop Protocol transaction',
        value: {
          type: 'hop-bridge',
          metadata: {
            token: 'USDC',
            amount: '500',
            sourceChain: 'ethereum',
            destinationChain: 'polygon',
            recipient: '0x742d35Cc6634C0532925a3b844Bc328e8f94D5dC',
            deadline: 1000000000,
            amountOutMin: '490',
          },
          totalSteps: 4,
        },
      },
      layerzero: {
        summary: 'Create LayerZero transaction',
        value: {
          type: 'layerzero-omnichain',
          metadata: {
            token: 'USDT',
            amount: '1000',
            sourceChainId: 101,
            destinationChainId: 102,
            recipient: '0x9e4c14403d7d2a8f5bD10b2c7c1e0d0e0d0e0d0e',
          },
          totalSteps: 3,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Transaction created successfully',
    example: {
      id: 'txn_550e8400e29b41d4a716446655440000',
      type: 'stellar-payment',
      status: 'pending',
      currentStep: 0,
      totalSteps: 3,
      metadata: {
        sourceAccount:
          'GCXMWUAUF37IWOABB3GNXFZB7TBBBHL3IJKUSJUWVEKM3CXEGTHUMDSD',
        destinationAccount:
          'GBRPYHIL2CI3WHZSRJQEMQ5CPQIS2TCCQ7OXJGGUFR7XUWVEPSWR47U',
      },
      createdAt: '2026-01-29T10:00:00.000Z',
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input - validation error on required fields',
    example: {
      success: false,
      error: 'Validation error',
      details: [
        {
          field: 'type',
          message: 'type must be a string',
        },
      ],
    },
  })
  async create(@Body() dto: CreateTransactionDto) {
    return this.transactionService.create(dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get transaction details',
    description:
      'Retrieves the current state and details of a transaction by ID, including its current step, status, and metadata.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    description: 'Unique transaction identifier',
    example: 'txn_550e8400e29b41d4a716446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction details retrieved successfully',
    example: {
      id: 'txn_550e8400e29b41d4a716446655440000',
      type: 'stellar-payment',
      status: 'in-progress',
      currentStep: 1,
      totalSteps: 3,
      metadata: {
        sourceAccount:
          'GCXMWUAUF37IWOABB3GNXFZB7TBBBHL3IJKUSJUWVEKM3CXEGTHUMDSD',
        txHash:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
      state: {
        validated: true,
        submitted: true,
      },
      createdAt: '2026-01-29T10:00:00.000Z',
      updatedAt: '2026-01-29T10:00:05.000Z',
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Transaction not found',
    example: {
      success: false,
      error: 'Transaction not found',
      details: 'No transaction with ID txn_invalid',
    },
  })
  async getTransaction(@Param('id') id: string) {
    return this.transactionService.findById(id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update transaction',
    description:
      'Updates the transaction status, state, or other properties. Used for manual intervention and state corrections.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    description: 'Unique transaction identifier',
    example: 'txn_550e8400e29b41d4a716446655440000',
  })
  @ApiBody({
    type: UpdateTransactionDto,
    description: 'Fields to update',
    examples: {
      statusUpdate: {
        summary: 'Update status',
        value: {
          status: 'completed',
        },
      },
      stateUpdate: {
        summary: 'Update internal state',
        value: {
          state: {
            validated: true,
            submitted: true,
            confirmed: true,
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction updated successfully',
    example: {
      id: 'txn_550e8400e29b41d4a716446655440000',
      type: 'stellar-payment',
      status: 'completed',
      currentStep: 3,
      totalSteps: 3,
      updatedAt: '2026-01-29T10:00:15.000Z',
    },
  })
  async update(@Param('id') id: string, @Body() dto: UpdateTransactionDto) {
    return this.transactionService.update(id, dto);
  }

  @Put(':id/advance')
  @ApiOperation({
    summary: 'Advance transaction to next step',
    description:
      'Moves the transaction to the next step in its workflow. Each step may require different data or validations.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    description: 'Unique transaction identifier',
    example: 'txn_550e8400e29b41d4a716446655440000',
  })
  @ApiBody({
    type: Object,
    required: false,
    description: 'Step-specific data required for advancement',
    schema: {
      type: 'object',
      properties: {
        signature: { type: 'string', description: 'Transaction signature' },
        fee: { type: 'string', description: 'Transaction fee' },
        gasLimit: { type: 'string', description: 'Gas limit for the step' },
      },
    },
    examples: {
      stellarSign: {
        summary: 'Stellar signature step',
        value: {
          signature:
            'TAQCSRX2RIDJNHFYFZXPGXWRWQUXNZKICH57C4YKHUYATFLBMUUPAA2DWS5PDVLXP6GQ6SDFGJJWMKHW',
        },
      },
      hopFeeStep: {
        summary: 'Hop fee estimation step',
        value: {
          fee: '1.5',
          gasLimit: '200000',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction advanced to next step',
    example: {
      id: 'txn_550e8400e29b41d4a716446655440000',
      type: 'stellar-payment',
      status: 'in-progress',
      currentStep: 2,
      totalSteps: 3,
      updatedAt: '2026-01-29T10:00:10.000Z',
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot advance - step validation failed',
    example: {
      success: false,
      error: 'Step advancement failed',
      details: 'Invalid signature provided',
    },
  })
  async advanceStep(
    @Param('id') id: string,
    @Body() stepData?: Record<string, any>,
  ) {
    return this.transactionService.advanceStep(id, stepData);
  }

  @Sse(':id/events')
  @ApiOperation({
    summary: 'Stream transaction updates (Server-Sent Events)',
    description:
      'Establishes a real-time connection to receive transaction updates via Server-Sent Events. Ideal for monitoring transaction progress in real-time.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    description: 'Unique transaction identifier',
    example: 'txn_550e8400e29b41d4a716446655440000',
  })
  @ApiResponse({
    status: 200,
    description:
      'SSE stream established. Events sent when transaction state changes.',
    content: {
      'text/event-stream': {
        schema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Transaction ID' },
            status: { type: 'string', description: 'Transaction status' },
            currentStep: { type: 'number', description: 'Current step number' },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
            },
          },
        },
        example:
          'data: {"id":"txn_550e8400e29b41d4a716446655440000","status":"in-progress","currentStep":1}\n\n',
      },
    },
  })
  streamTransactionEvents(@Param('id') id: string): Observable<MessageEvent> {
    return new Observable((observer) => {
      const handler = (transaction) => {
        if (transaction.id === id) {
          observer.next({ data: transaction });
        }
      };

      this.eventEmitter.on('transaction.updated', handler);

      // Send initial state
      this.transactionService.findById(id).then((transaction) => {
        observer.next({ data: transaction });
      });

      return () => {
        this.eventEmitter.off('transaction.updated', handler);
      };
    });
  }

  @Get(':id/poll')
  @ApiOperation({
    summary: 'Poll transaction status (fallback to SSE)',
    description:
      'Alternative to Server-Sent Events for polling transaction status. Returns the current transaction state. Use this if SSE is not supported by your client.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    description: 'Unique transaction identifier',
    example: 'txn_550e8400e29b41d4a716446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction status retrieved',
    example: {
      id: 'txn_550e8400e29b41d4a716446655440000',
      type: 'stellar-payment',
      status: 'in-progress',
      currentStep: 1,
      totalSteps: 3,
      updatedAt: '2026-01-29T10:00:10.000Z',
    },
  })
  async pollTransaction(@Param('id') id: string) {
    return this.transactionService.findById(id);
  }

  @Get('export/:format')
  @ApiOperation({
    summary: 'Export transaction history',
    description:
      'Export transaction history in CSV or JSON format with optional filtering. Supports filtering by account, chain, bridge, status, and date range.',
  })
  @ApiQuery({
    name: 'account',
    required: false,
    description: 'Filter by account address',
    example: '0x742d35Cc6634C0532925a3b844Bc328e8f94D5dC',
  })
  @ApiQuery({
    name: 'sourceChain',
    required: false,
    description: 'Filter by source chain',
    example: 'ethereum',
  })
  @ApiQuery({
    name: 'destinationChain',
    required: false,
    description: 'Filter by destination chain',
    example: 'polygon',
  })
  @ApiQuery({
    name: 'bridgeName',
    required: false,
    description: 'Filter by bridge name',
    example: 'hop',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status',
    enum: ['pending', 'confirmed', 'failed'],
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date (ISO 8601 format)',
    example: '2024-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date (ISO 8601 format)',
    example: '2024-12-31T23:59:59.999Z',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction history exported successfully',
    content: {
      'text/csv': {
        schema: { type: 'string' },
        example:
          'ID,Type,Status,Source Chain,Destination Chain,Bridge Name,Amount,Fee,TX Hash,Created At,Completed At\ntxn_123,stellar-payment,completed,ethereum,polygon,hop,100,1.5,0xabc...,2024-01-15T10:00:00.000Z,2024-01-15T10:05:00.000Z',
      },
      'application/json': {
        schema: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid export format or parameters',
  })
  async exportTransactions(
    @Param('format') format: ExportFormat,
    @Query() filters: ExportTransactionsDto,
    @Res() res: Response,
  ) {
    const data = await this.exportService.getTransactionsForExport(filters);

    if (format === ExportFormat.CSV) {
      const csvContent = this.exportService.convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="transactions_${new Date().toISOString().split('T')[0]}.csv"`,
      );
      return res.send(csvContent);
    } else {
      const jsonContent = this.exportService.convertToJSON(data);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="transactions_${new Date().toISOString().split('T')[0]}.json"`,
      );
      return res.send(jsonContent);
    }
  }

  @Get(':id/failure-reason')
  @ApiOperation({
    summary: 'Get failure reason for transaction',
    description:
      'Retrieves detailed failure reason and suggested actions for a failed transaction.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    description: 'Unique transaction identifier',
  })
  @ApiResponse({
    status: 200,
    description: 'Failure reason retrieved successfully',
  })
  async getFailureReason(@Param('id') id: string) {
    const transaction = await this.transactionService.findById(id);

    if (transaction.status !== 'failed' && transaction.status !== 'partial') {
      return {
        category: 'UNKNOWN',
        message: 'Transaction has not failed',
        retryRecommended: false,
        timestamp: new Date(),
      };
    }

    // Analyze error and categorize
    const error = transaction.error || '';
    const category = this.categorizeError(error);

    return {
      category,
      message: this.getFailureMessage(category),
      details: error,
      errorCode: this.extractErrorCode(error),
      timestamp: transaction.updatedAt,
      txHash: transaction.metadata?.txHash,
      suggestedAction: this.getSuggestedAction(category),
      retryRecommended: this.isRetryRecommended(category),
    };
  }

  @Get(':id/alternative-routes')
  @ApiOperation({
    summary: 'Get alternative routes for failed transaction',
    description:
      'Suggests alternative bridge routes based on the original transaction parameters.',
  })
  @ApiResponse({
    status: 200,
    description: 'Alternative routes retrieved successfully',
  })
  async getAlternativeRoutes(@Param('id') id: string) {
    const transaction = await this.transactionService.findById(id);

    // Extract original transaction parameters
    const { sourceChain, destinationChain, token, amount } =
      transaction.metadata || {};

    if (!sourceChain || !destinationChain) {
      return [];
    }

    // TODO: Integrate with bridge recommendation service
    // For now, return mock alternative routes
    return [
      {
        bridgeName: 'Hop Protocol',
        sourceChain,
        destinationChain,
        sourceToken: token || 'ETH',
        destinationToken: token || 'ETH',
        estimatedAmount: `${(parseFloat(amount || '0') * 0.995).toFixed(4)}`,
        fee: '0.5%',
        estimatedTime: 300,
        successRate: 98,
        reliabilityScore: 95,
      },
      {
        bridgeName: 'Across Protocol',
        sourceChain,
        destinationChain,
        sourceToken: token || 'ETH',
        destinationToken: token || 'ETH',
        estimatedAmount: `${(parseFloat(amount || '0') * 0.997).toFixed(4)}`,
        fee: '0.3%',
        estimatedTime: 180,
        successRate: 99,
        reliabilityScore: 97,
      },
    ];
  }

  @Post(':id/retry')
  @ApiOperation({
    summary: 'Retry failed transaction',
    description:
      'Attempts to retry a failed transaction with exponential backoff.',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction retry initiated',
  })
  async retryTransaction(@Param('id') id: string) {
    const transaction = await this.transactionService.findById(id);

    if (transaction.status !== 'failed') {
      return {
        success: false,
        error: 'Transaction is not in failed state',
      };
    }

    const result = await this.retryService.retryTransaction(transaction);

    return {
      success: !!result,
      transaction: result,
    };
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel transaction',
    description:
      'Cancels a failed or pending transaction and initiates refund.',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction cancelled successfully',
  })
  async cancelTransaction(@Param('id') id: string) {
    const transaction = await this.transactionService.findById(id);

    // Update transaction status to cancelled
    const updated = await this.transactionService.update(id, {
      status: TransactionStatus.FAILED,
      state: { ...transaction.state, cancelled: true },
    });

    // TODO: Initiate refund process
    this.eventEmitter.emit('transaction.cancelled', updated);

    return {
      success: true,
      message: 'Transaction cancelled. Refund will be processed.',
    };
  }

  // Helper methods for error categorization
  private categorizeError(error: string): string {
    const lowerError = error.toLowerCase();

    if (lowerError.includes('insufficient') || lowerError.includes('balance')) {
      return 'INSUFFICIENT_FUNDS';
    }
    if (lowerError.includes('network') || lowerError.includes('connection')) {
      return 'NETWORK_ERROR';
    }
    if (lowerError.includes('slippage')) {
      return 'SLIPPAGE_EXCEEDED';
    }
    if (lowerError.includes('timeout') || lowerError.includes('time')) {
      return 'TIMEOUT';
    }
    if (lowerError.includes('liquidity')) {
      return 'BRIDGE_LIQUIDITY';
    }
    if (lowerError.includes('validation') || lowerError.includes('invalid')) {
      return 'VALIDATION_ERROR';
    }
    if (lowerError.includes('reject') || lowerError.includes('user')) {
      return 'USER_REJECTED';
    }
    if (lowerError.includes('contract') || lowerError.includes('revert')) {
      return 'CONTRACT_ERROR';
    }

    return 'UNKNOWN';
  }

  private getFailureMessage(category: string): string {
    const messages: Record<string, string> = {
      INSUFFICIENT_FUNDS: 'Insufficient funds to complete the transaction',
      NETWORK_ERROR: 'Network error occurred during transaction',
      SLIPPAGE_EXCEEDED: 'Price slippage exceeded the allowed threshold',
      TIMEOUT: 'Transaction timed out waiting for confirmation',
      BRIDGE_LIQUIDITY: 'Insufficient liquidity in bridge pool',
      VALIDATION_ERROR: 'Transaction validation failed',
      USER_REJECTED: 'Transaction was rejected by user',
      CONTRACT_ERROR: 'Smart contract execution failed',
      UNKNOWN: 'An unknown error occurred',
    };
    return messages[category] || messages.UNKNOWN;
  }

  private extractErrorCode(error: string): string | undefined {
    const match = error.match(/(?:error code|code)[:\s]*(\w+)/i);
    return match?.[1];
  }

  private getSuggestedAction(category: string): string {
    const actions: Record<string, string> = {
      INSUFFICIENT_FUNDS: 'Add more funds to your wallet and try again',
      NETWORK_ERROR: 'Check your internet connection and retry',
      SLIPPAGE_EXCEEDED:
        'Increase slippage tolerance or wait for lower volatility',
      TIMEOUT: 'Network is congested. Try again later or use a different route',
      BRIDGE_LIQUIDITY:
        'Try a different bridge provider with available liquidity',
      VALIDATION_ERROR: 'Verify transaction parameters and try again',
      USER_REJECTED: 'Confirm the transaction in your wallet to proceed',
      CONTRACT_ERROR:
        'Contract may be paused. Try again later or contact support',
      UNKNOWN: 'Contact support if the issue persists',
    };
    return actions[category] || actions.UNKNOWN;
  }

  private isRetryRecommended(category: string): boolean {
    const notRecommended = [
      'USER_REJECTED',
      'VALIDATION_ERROR',
      'INSUFFICIENT_FUNDS',
    ];
    return !notRecommended.includes(category);
  }
}
