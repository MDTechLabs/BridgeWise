import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { FeeEstimationController } from './fee-estimation.controller';
import { FeeEstimationService } from './fee-estimation.service';
import { TokenService } from './token.service';
import { StellarAdapter } from './adapters/stellar.adapter';
import { LayerZeroAdapter } from './adapters/layerzero.adapter';
import { HopAdapter } from './adapters/hop.adapter';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [FeeEstimationController],
  providers: [
    FeeEstimationService,
    TokenService,
    StellarAdapter,
    LayerZeroAdapter,
    HopAdapter,
  ],
  exports: [FeeEstimationService],
})
export class FeeEstimationModule {}