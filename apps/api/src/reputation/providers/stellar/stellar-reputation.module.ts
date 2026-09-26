import { Module } from '@nestjs/common';
import { StellarReputationStore }      from './stellar-reputation.store';
import { StellarReputationCalculator } from './stellar-reputation.calculator';
import { StellarReputationReporter }   from './stellar-reputation.reporter';
import { StellarReputationTracker }    from './stellar-reputation.tracker';

@Module({
  providers: [
    StellarReputationStore,
    StellarReputationCalculator,
    StellarReputationReporter,
    StellarReputationTracker,
  ],
  exports: [StellarReputationTracker],
})
export class StellarReputationModule {}