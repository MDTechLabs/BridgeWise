import { Controller, Post, Body } from '@nestjs/common';
import { RelayerFeeService } from './relayer-fee.service';
import { CalculateRelayerFeeDto } from './dto/relayer-fee.dto';

@Controller('relayer-fee')
export class RelayerFeeController {
  constructor(private readonly relayerFeeService: RelayerFeeService) {}

  @Post('calculate')
  calculateFee(@Body() dto: CalculateRelayerFeeDto) {
    const fee = this.relayerFeeService.calculateFee(dto);
    return {
      assetId: dto.assetId,
      volumeUsd: dto.volumeUsd,
      totalFeeUsd: fee,
    };
  }
}
