import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FeeEstimatorService } from './fee-estimator.service';
import { EstimateFeeQueryDto, RelayFeeEstimateDto } from './dto/estimate-fee.dto';

@ApiTags('Relayer')
@Controller('api/v1/relayer')
export class FeeEstimatorController {
  constructor(private readonly feeEstimatorService: FeeEstimatorService) {}

  @Get('estimate-fee')
  @ApiOperation({
    summary: 'Estimate the total relay cost for a cross-chain payload',
    description:
      'Calculates the destination gas cost plus relayer margin for dispatching a cross-chain message, given the source chain, target chain, and payload size.',
  })
  @ApiResponse({
    status: 200,
    description: 'Relay fee quote calculated successfully',
    type: RelayFeeEstimateDto,
  })
  estimateFee(
    @Query() query: EstimateFeeQueryDto,
  ): Promise<RelayFeeEstimateDto> {
    return this.feeEstimatorService.estimateFee(query);
  }
}
