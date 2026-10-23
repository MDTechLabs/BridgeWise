import { Module } from '@nestjs/common';
import { ChainLatencyController } from './chain-latency.controller';
import { ChainLatencyService } from './chain-latency.service';

@Module({
  controllers: [ChainLatencyController],
  providers: [ChainLatencyService],
  exports: [ChainLatencyService],
})
export class ChainLatencyModule {}
