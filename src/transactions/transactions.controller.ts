import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionService } from './transactions.service';

@ApiTags('Transactions')
@Controller('transactions')
export class TransactionController {
  constructor(
    private readonly transactionService: TransactionService,
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
}
