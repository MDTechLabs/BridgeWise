import { Injectable, Logger } from '@nestjs/common';
import { StellarAdapter } from './adapters/stellar.adapter';
import { LayerZeroAdapter } from './adapters/layerzero.adapter';
import { HopAdapter } from './adapters/hop.adapter';
import { FeeEstimate, NormalizedFeeData, NetworkType } from './interfaces/fees.interface';
import { TokenService } from './token.service';

@Injectable()
export class FeeEstimationService {
  private readonly logger = new Logger(FeeEstimationService.name);

  constructor(
    private readonly stellarAdapter: StellarAdapter,
    private readonly layerZeroAdapter: LayerZeroAdapter,
    private readonly hopAdapter: HopAdapter,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Get fee estimates for all supported networks
   */
  async getAllFeeEstimates(): Promise<NormalizedFeeData> {
    const estimates = await Promise.allSettled([
      this.getStellarFees(),
      this.getLayerZeroFees(),
      this.getHopFees(),
    ]);

    const stellarResult = this.extractResult(estimates[0], 'Stellar');
    const layerzeroResult = this.extractResult(estimates[1], 'LayerZero');
    const hopResult = this.extractResult(estimates[2], 'Hop');

    // Count only providers that are actually available
    const successfulProviders = [stellarResult, layerzeroResult, hopResult]
      .filter(result => result.available).length;

    return {
      timestamp: Date.now(),
      networks: {
        stellar: stellarResult,
        layerzero: layerzeroResult,
        hop: hopResult,
      },
      metadata: {
        successfulProviders,
        totalProviders: estimates.length,
      },
    };
  }

  /**
   * Get fee estimate for a specific network
   */
  async getFeeEstimate(network: NetworkType): Promise<FeeEstimate> {
    try {
      switch (network) {
        case NetworkType.STELLAR:
          return await this.getStellarFees();
        case NetworkType.LAYERZERO:
          return await this.getLayerZeroFees();
        case NetworkType.HOP:
          return await this.getHopFees();
        default:
          throw new Error(`Unsupported network: ${network}`);
      }
    } catch (error) {
      this.logger.error(`Failed to fetch fees for ${network}:`, error.message);
      return this.createUnavailableEstimate(network, error.message);
    }
  }

  /**
   * Get Stellar network fees
   */
  private async getStellarFees(): Promise<FeeEstimate> {
    try {
      const rawFees = await this.stellarAdapter.getFees();
      
      return {
        network: NetworkType.STELLAR,
        available: true,
        fees: {
          slow: this.tokenService.normalizeAmount(
            rawFees.min,
            rawFees.decimals,
            rawFees.symbol,
          ),
          standard: this.tokenService.normalizeAmount(
            rawFees.mode,
            rawFees.decimals,
            rawFees.symbol,
          ),
          fast: this.tokenService.normalizeAmount(
            rawFees.p90,
            rawFees.decimals,
            rawFees.symbol,
          ),
        },
        currency: rawFees.symbol,
        estimatedTime: {
          slow: 5000, // 5 seconds
          standard: 5000,
          fast: 5000,
        },
        lastUpdated: Date.now(),
      };
    } catch (error) {
      this.logger.error('Stellar adapter failed:', error.message);
      return this.createUnavailableEstimate(NetworkType.STELLAR, error.message);
    }
  }

  /**
   * Get LayerZero cross-chain fees
   */
  private async getLayerZeroFees(): Promise<FeeEstimate> {
    try {
      const rawFees = await this.layerZeroAdapter.getFees();
      
      return {
        network: NetworkType.LAYERZERO,
        available: true,
        fees: {
          slow: this.tokenService.normalizeAmount(
            rawFees.baseFee,
            rawFees.decimals,
            rawFees.symbol,
          ),
          standard: this.tokenService.normalizeAmount(
            rawFees.standardFee,
            rawFees.decimals,
            rawFees.symbol,
          ),
          fast: this.tokenService.normalizeAmount(
            rawFees.priorityFee,
            rawFees.decimals,
            rawFees.symbol,
          ),
        },
        currency: rawFees.symbol,
        estimatedTime: {
          slow: 300000, // 5 minutes
          standard: 180000, // 3 minutes
          fast: 60000, // 1 minute
        },
        lastUpdated: Date.now(),
        additionalData: {
          destinationChain: rawFees.destinationChain,
          sourceChain: rawFees.sourceChain,
        },
      };
    } catch (error) {
      this.logger.error('LayerZero adapter failed:', error.message);
      return this.createUnavailableEstimate(NetworkType.LAYERZERO, error.message);
    }
  }

  /**
   * Get Hop Protocol bridge fees
   */
  private async getHopFees(): Promise<FeeEstimate> {
    try {
      const rawFees = await this.hopAdapter.getFees();
      
      return {
        network: NetworkType.HOP,
        available: true,
        fees: {
          slow: this.tokenService.normalizeAmount(
            rawFees.lpFee,
            rawFees.decimals,
            rawFees.symbol,
          ),
          standard: this.tokenService.normalizeAmount(
            rawFees.lpFee + rawFees.bonderFee,
            rawFees.decimals,
            rawFees.symbol,
          ),
          fast: this.tokenService.normalizeAmount(
            rawFees.lpFee + rawFees.bonderFee + rawFees.destinationTxFee,
            rawFees.decimals,
            rawFees.symbol,
          ),
        },
        currency: rawFees.symbol,
        estimatedTime: {
          slow: 1200000, // 20 minutes
          standard: 600000, // 10 minutes
          fast: 300000, // 5 minutes
        },
        lastUpdated: Date.now(),
        additionalData: {
          route: `${rawFees.sourceChain} -> ${rawFees.destinationChain}`,
          token: rawFees.token,
        },
      };
    } catch (error) {
      this.logger.error('Hop adapter failed:', error.message);
      return this.createUnavailableEstimate(NetworkType.HOP, error.message);
    }
  }

  /**
   * Extract result from Promise.allSettled
   */
  private extractResult(
    result: PromiseSettledResult<FeeEstimate>,
    providerName: string,
  ): FeeEstimate {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    
    this.logger.warn(`${providerName} provider unavailable:`, result.reason?.message);
    return this.createUnavailableEstimate(
      providerName.toLowerCase() as NetworkType,
      result.reason?.message || 'Unknown error',
    );
  }

  /**
   * Create unavailable estimate fallback
   */
  private createUnavailableEstimate(
    network: NetworkType,
    error: string,
  ): FeeEstimate {
    return {
      network,
      available: false,
      fees: {
        slow: '0',
        standard: '0',
        fast: '0',
      },
      currency: 'N/A',
      estimatedTime: {
        slow: 0,
        standard: 0,
        fast: 0,
      },
      lastUpdated: Date.now(),
      error,
    };
  }
}