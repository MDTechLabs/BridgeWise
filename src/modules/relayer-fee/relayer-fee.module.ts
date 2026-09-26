import { Module } from '@nestjs/common';
import { RelayerFeeService } from './relayer-fee.service';
import { RelayerFeeController } from './relayer-fee.controller';

@Module({
  controllers: [RelayerFeeController],
  providers: [RelayerFeeService],
  exports: [RelayerFeeService],
})
export class RelayerFeeModule {}
