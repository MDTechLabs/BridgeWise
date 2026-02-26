import { Module, OnModuleInit } from '@nestjs/common';
import { BridgeRegistryService } from './services/bridge-registry.service';
import { FeeAggregationService } from './services/fee-aggregation.service';
import { QuoteScoringService } from './services/quote-scoring.service';
import { QuotesController } from './quotes.controller';
import { AcrossAdapter, HopAdapter, StargateAdapter } from './adapters/bridge.adapters';

@Module({
  controllers: [QuotesController],
  providers: [
    BridgeRegistryService,
    FeeAggregationService,
    QuoteScoringService,
    // Bridge adapters
    AcrossAdapter,
    HopAdapter,
    StargateAdapter,
  ],
  exports: [FeeAggregationService, BridgeRegistryService],
})
export class FeeAggregationModule implements OnModuleInit {
  constructor(
    private readonly registry: BridgeRegistryService,
    private readonly across: AcrossAdapter,
    private readonly hop: HopAdapter,
    private readonly stargate: StargateAdapter,
  ) {}

  onModuleInit() {
    this.registry.register(this.across);
    this.registry.register(this.hop);
    this.registry.register(this.stargate);
  }
}
