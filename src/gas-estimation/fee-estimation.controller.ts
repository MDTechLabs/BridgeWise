import {
  Controller,
  Get,
  Query,
  HttpStatus,
  HttpException,
  UseInterceptors,
  CacheInterceptor,
  CacheTTL,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { FeeEstimationService } from './fee-estimation.service';
import { NetworkType } from './interfaces/fee.interface';

@ApiTags('Fee Estimation')
@Controller('api/v1/fees')
@UseInterceptors(CacheInterceptor)
export class FeeEstimationController {
  constructor(private readonly feeEstimationService: FeeEstimationService) {}

  @Get()
  @CacheTTL(10) // Cache for 10 seconds
  @ApiOperation({ summary: 'Get fee estimates for all supported networks' })
  @ApiResponse({
    status: 200,
    description: 'Fee estimates retrieved successfully',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  async getAllFees() {
    try {
      const fees = await this.feeEstimationService.getAllFeeEstimates();
      return {
        success: true,
        data: fees,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: 'Failed to fetch fee estimates',
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('network')
  @CacheTTL(10) // Cache for 10 seconds
  @ApiOperation({ summary: 'Get fee estimate for a specific network' })
  @ApiQuery({
    name: 'network',
    enum: NetworkType,
    description: 'Network to get fees for',
  })
  @ApiResponse({
    status: 200,
    description: 'Fee estimate retrieved successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid network specified',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  async getNetworkFee(@Query('network') network: string) {
    if (!Object.values(NetworkType).includes(network as NetworkType)) {
      throw new HttpException(
        {
          success: false,
          error: 'Invalid network',
          supportedNetworks: Object.values(NetworkType),
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const fees = await this.feeEstimationService.getFeeEstimate(
        network as NetworkType,
      );
      return {
        success: true,
        data: fees,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: `Failed to fetch fees for ${network}`,
          details: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check for fee estimation service' })
  @ApiResponse({
    status: 200,
    description: 'Service health status',
  })
  async healthCheck() {
    const fees = await this.feeEstimationService.getAllFeeEstimates();
    
    return {
      success: true,
      healthy: fees.metadata.successfulProviders > 0,
      providers: {
        total: fees.metadata.totalProviders,
        available: fees.metadata.successfulProviders,
        unavailable: fees.metadata.totalProviders - fees.metadata.successfulProviders,
      },
      networks: {
        stellar: fees.networks.stellar.available,
        layerzero: fees.networks.layerzero.available,
        hop: fees.networks.hop.available,
      },
      timestamp: fees.timestamp,
    };
  }
}