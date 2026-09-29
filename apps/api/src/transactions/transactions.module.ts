import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { TransactionsExportService } from './transactions-export.service';
import { TransactionsStatusService } from './transactions-status.service';
import { AuditLoggerService } from '../common/logger/audit-logger.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    EventEmitterModule.forRoot(),
  ],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    TransactionsExportService,
    TransactionsStatusService,
    AuditLoggerService,
  ],
})
export class TransactionsModule {}
