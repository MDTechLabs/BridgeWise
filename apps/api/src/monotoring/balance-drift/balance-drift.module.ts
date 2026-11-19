import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceDriftRecord } from './balance-drift.entity';
import { BalanceDriftClassifier } from './balance-drift.classifier';
import { BalanceDriftController } from './balance-drift.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BalanceDriftRecord])],
  providers: [BalanceDriftClassifier],
  controllers: [BalanceDriftController],
  exports: [BalanceDriftClassifier],
})
export class BalanceDriftModule {}