import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BridgeTransactionEvent } from './bridge-transaction-event.entity';
import { BridgeReliabilityMetric } from './bridge-reliability-metric.entity';
import { BridgeReliabilityService } from './bridge-reliability.service';
import { BridgeReliabilityController } from './bridge-reliability.controller';
import { ReliabilityCalculatorService } from './reliability-calculator.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BridgeTransactionEvent, BridgeReliabilityMetric]),
  ],
  controllers: [BridgeReliabilityController],
  providers: [BridgeReliabilityService, ReliabilityCalculatorService],
  exports: [BridgeReliabilityService, ReliabilityCalculatorService],
})
export class BridgeReliabilityModule {}
