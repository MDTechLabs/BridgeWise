/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
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
import { Observable } from 'rxjs';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionService } from './transactions.service';

@Controller('transactions')
export class TransactionController {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Post()
  async create(@Body() dto: CreateTransactionDto) {
    return this.transactionService.create(dto);
  }

  @Get(':id')
  async getTransaction(@Param('id') id: string) {
    return this.transactionService.findById(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTransactionDto) {
    return this.transactionService.update(id, dto);
  }

  @Put(':id/advance')
  async advanceStep(
    @Param('id') id: string,
    @Body() stepData?: Record<string, any>,
  ) {
    return this.transactionService.advanceStep(id, stepData);
  }

  // Server-Sent Events for real-time updates
  @Sse(':id/events')
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

  // Polling endpoint as fallback
  @Get(':id/poll')
  async pollTransaction(@Param('id') id: string) {
    return this.transactionService.findById(id);
  }
}
