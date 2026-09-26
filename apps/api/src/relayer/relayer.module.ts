import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FeeEstimatorController } from './fee-estimator.controller';
import { FeeEstimatorService } from './fee-estimator.service';
import { GasPriceAdapter } from '../fee-estimation/adapters/gas-price.adapter';

@Module({
  imports: [HttpModule],
  controllers: [FeeEstimatorController],
  providers: [FeeEstimatorService, GasPriceAdapter],
})
export class RelayerModule {}
