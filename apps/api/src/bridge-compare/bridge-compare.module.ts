import { Module } from '@nestjs/common';
import { BridgeCompareController } from './bridge-compare.controller';
import { BridgeCompareService } from './bridge-compare.service';
import { AggregationService } from './aggregation.service';
import { SlippageService } from './slippage.service';
import { ReliabilityService } from './reliability.service';
import { RankingService } from './ranking.service';
import { FailureRiskService } from './failure-risk.service';

@Module({
  controllers: [BridgeCompareController],
  providers: [
    BridgeCompareService,
    AggregationService,
    SlippageService,
    ReliabilityService,
    RankingService,
    FailureRiskService,
  ],
  exports: [BridgeCompareService],
})
export class BridgeCompareModule {}
