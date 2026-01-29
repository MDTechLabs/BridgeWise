import {
  Controller,
  Get,
  Query,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { FeeEstimationService } from './fee-estimation.service';
import { NetworkType } from './interfaces/fees.interface';

@ApiTags('Fee Estimation')
@Controller('api/v1/fees')
export class FeeEstimationController {
  constructor(private readonly feeEstimationService: FeeEstimationService) {}

  @Get()
  @ApiOperation({
    summary: 'Get fee estimates for all supported networks',
    description:
      'Retrieves current fee estimates from all supported blockchain networks (Stellar, LayerZero, and Hop Protocol). Results are cached for 10 seconds to optimize performance. This endpoint aggregates data from multiple fee estimation providers for each network.',
    externalDocs: {
      url: 'https://docs.bridgewise.example.com/fee-estimation',
      description: 'Fee Estimation Documentation',
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Fee estimates retrieved successfully',
    example: {
      success: true,
      data: {
        timestamp: 1706526000000,
        networks: {
          stellar: {
            network: 'stellar',
            available: true,
            fees: {
              slow: '100',
              standard: '150',
              fast: '200',
            },
            currency: 'stroops',
            estimatedTime: {
              slow: 30000,
              standard: 15000,
              fast: 5000,
            },
            lastUpdated: 1706525990000,
            additionalData: {
              baseFee: '100',
              medianFee: '150',
              percentiles: {
                p10: '110',
                p50: '150',
                p90: '180',
              },
            },
          },
          layerzero: {
            network: 'layerzero',
            available: true,
            fees: {
              slow: '0.5',
              standard: '0.75',
              fast: '1.0',
            },
            currency: 'GWEI',
            estimatedTime: {
              slow: 20000,
              standard: 12000,
              fast: 3000,
            },
            lastUpdated: 1706525985000,
          },
          hop: {
            network: 'hop',
            available: true,
            fees: {
              slow: '0.1',
              standard: '0.15',
              fast: '0.2',
            },
            currency: 'ETH',
            estimatedTime: {
              slow: 25000,
              standard: 15000,
              fast: 5000,
            },
            lastUpdated: 1706525980000,
            additionalData: {
              lpFee: '0.05',
              bonderFee: '0.08',
            },
          },
        },
        metadata: {
          successfulProviders: 3,
          totalProviders: 3,
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - fee estimation service unavailable',
    example: {
      success: false,
      error: 'Failed to fetch fee estimates',
      details: 'Connection timeout to fee provider',
    },
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
  @ApiOperation({
    summary: 'Get fee estimate for a specific network',
    description:
      'Retrieves fee estimates for a single specified blockchain network. Supports Stellar, LayerZero, and Hop Protocol. Results are cached for 10 seconds. Adapter-specific fields vary by network.',
  })
  @ApiQuery({
    name: 'network',
    enum: NetworkType,
    description: 'Target blockchain network',
    example: 'stellar',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Fee estimate retrieved successfully',
    schema: {
      oneOf: [
        {
          title: 'Stellar Fee Response',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                network: { type: 'string', example: 'stellar' },
                available: { type: 'boolean' },
                fees: {
                  type: 'object',
                  properties: {
                    slow: { type: 'string', example: '100' },
                    standard: { type: 'string', example: '150' },
                    fast: { type: 'string', example: '200' },
                  },
                },
                currency: { type: 'string', example: 'stroops' },
                estimatedTime: {
                  type: 'object',
                  properties: {
                    slow: { type: 'number', example: 30000 },
                    standard: { type: 'number', example: 15000 },
                    fast: { type: 'number', example: 5000 },
                  },
                },
                additionalData: {
                  type: 'object',
                  properties: {
                    baseFee: { type: 'string' },
                    decimals: { type: 'number', example: 7 },
                    symbol: { type: 'string', example: 'XLM' },
                  },
                  description: 'Stellar-specific adapter data',
                },
              },
            },
          },
        },
        {
          title: 'LayerZero Fee Response',
          type: 'object',
          description: 'For network=layerzero. Includes cross-chain details.',
          properties: {
            additionalData: {
              type: 'object',
              properties: {
                sourceChain: { type: 'string', example: 'ethereum' },
                destinationChain: { type: 'string', example: 'polygon' },
              },
              description: 'LayerZero omnichain routing data',
            },
          },
        },
        {
          title: 'Hop Fee Response',
          type: 'object',
          description: 'For network=hop. Includes bridge routing data.',
          properties: {
            additionalData: {
              type: 'object',
              properties: {
                token: { type: 'string', example: 'USDC' },
                sourceChain: { type: 'string', example: 'ethereum' },
                destinationChain: { type: 'string', example: 'polygon' },
                lpFee: { type: 'string', description: 'Liquidity provider fee' },
                bonderFee: { type: 'string', description: 'Bonder fee' },
              },
              description: 'Hop Protocol bridge-specific data',
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid network parameter',
    example: {
      success: false,
      error: 'Invalid network',
      supportedNetworks: ['stellar', 'layerzero', 'hop'],
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Failed to fetch fees for specified network',
    example: {
      success: false,
      error: 'Failed to fetch fees for stellar',
      details: 'Stellar RPC service temporarily unavailable',
    },
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
  @ApiOperation({
    summary: 'Health check for fee estimation service',
    description:
      'Verifies the health and availability of the fee estimation service and all underlying network adapters (Stellar, LayerZero, Hop). Useful for monitoring and diagnostics.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service health status retrieved successfully',
    example: {
      success: true,
      healthy: true,
      providers: {
        total: 3,
        available: 3,
        unavailable: 0,
      },
      networks: {
        stellar: true,
        layerzero: true,
        hop: true,
      },
      timestamp: 1706526000000,
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Service unhealthy - no providers available',
    example: {
      success: true,
      healthy: false,
      providers: {
        total: 3,
        available: 0,
        unavailable: 3,
      },
      networks: {
        stellar: false,
        layerzero: false,
        hop: false,
      },
      timestamp: 1706526000000,
    },
  })
  async healthCheck() {
    const fees = await this.feeEstimationService.getAllFeeEstimates();

    return {
      success: true,
      healthy: fees.metadata.successfulProviders > 0,
      providers: {
        total: fees.metadata.totalProviders,
        available: fees.metadata.successfulProviders,
        unavailable:
          fees.metadata.totalProviders - fees.metadata.successfulProviders,
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