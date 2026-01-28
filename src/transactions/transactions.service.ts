/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { Transaction, TransactionStatus } from './entities/transaction.entity';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateTransactionDto): Promise<Transaction> {
    const transaction = this.transactionRepo.create({
      type: dto.type,
      metadata: dto.metadata || {},
      state: {},
      totalSteps: dto.totalSteps || 0,
      status: TransactionStatus.PENDING,
    });

    const saved = await this.transactionRepo.save(transaction);
    this.emitStateChange(saved);
    return saved;
  }

  async findById(id: string): Promise<Transaction> {
    const transaction = await this.transactionRepo.findOne({ where: { id } });
    if (!transaction) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }
    return transaction;
  }

  async update(id: string, dto: UpdateTransactionDto): Promise<Transaction> {
    const transaction = await this.findById(id);

    if (dto.status) transaction.status = dto.status;
    if (dto.state) transaction.state = { ...transaction.state, ...dto.state };
    if (dto.currentStep !== undefined)
      transaction.currentStep = dto.currentStep;
    if (dto.error) transaction.error = dto.error;

    if (dto.status === TransactionStatus.COMPLETED) {
      transaction.completedAt = new Date();
    }

    const updated = await this.transactionRepo.save(transaction);
    this.emitStateChange(updated);
    return updated;
  }

  async updateState(
    id: string,
    stateUpdate: Record<string, any>,
  ): Promise<Transaction> {
    return this.update(id, { state: stateUpdate });
  }

  async advanceStep(
    id: string,
    stepData?: Record<string, any>,
  ): Promise<Transaction> {
    const transaction = await this.findById(id);

    const nextStep = transaction.currentStep + 1;
    const updates: UpdateTransactionDto = {
      currentStep: nextStep,
      status: TransactionStatus.IN_PROGRESS,
    };

    if (stepData) {
      updates.state = stepData;
    }

    // Check if completed
    if (nextStep >= transaction.totalSteps && transaction.totalSteps > 0) {
      updates.status = TransactionStatus.COMPLETED;
    }

    return this.update(id, updates);
  }

  async markFailed(id: string, error: string): Promise<Transaction> {
    return this.update(id, {
      status: TransactionStatus.FAILED,
      error,
    });
  }

  async markPartial(id: string, error: string): Promise<Transaction> {
    return this.update(id, {
      status: TransactionStatus.PARTIAL,
      error,
    });
  }

  async getRecentTransactions(limit = 10): Promise<Transaction[]> {
    return this.transactionRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  private emitStateChange(transaction: Transaction): void {
    this.eventEmitter.emit('transaction.updated', transaction);
  }
}
