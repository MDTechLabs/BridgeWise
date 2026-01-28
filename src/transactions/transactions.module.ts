/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionController } from './transactions.controller';
import { TransactionService } from './transactions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    EventEmitterModule.forRoot(),
  ],
  controllers: [TransactionController],
  providers: [TransactionService],
})
export class TransactionsModule {}
