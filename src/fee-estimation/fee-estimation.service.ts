import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { FeeEstimate } from './entities/fee-estimate.entity';
import { GasPriceAdapter } from './adapters/gas-price.adapter';
import { BridgeFeeAdapter } from './adapters/bridge-fee.adapter';
import {
  FeeEstimateDto,
  FeeEstimateQueryDto,
  BatchFeeEstimateQueryDto,
  BatchFeeEstimateResponseDto,
  FeeComparisonResponseDto,
  FeeComparisonDto,
} from './dto/fee-estimate.dto';
import { FeeEstimateRequest, FeeCacheEntry } from './types/fee-estimate.types';

/**
 * Dynamic Fee Estimation Service
 *
 * Provides real-time fee estimates for bridge routes by combining
 * gas prices, bridge fees, and liquidity impacts.
 */
@Injectable()
export class FeeEstimationService {
  private readonly logger = new Logger(FeeEstimationService.name);
  private cache: Map<string, FeeCacheEntry> = new Map();
  private readonly DEFAULT_CACHE_TTL = 60000; // 1 minute

  constructor(
    @InjectRepository(FeeEstimate)
    private readonly feeEstimateRepository: Repository<FeeEstimate>,
    private readonly gasPriceAdapter: GasPriceAdapter,
    private readonly bridgeFeeAdapter: BridgeFeeAdapter,
  ) {}

  /**
   * Get fee estimate for a route
   */
  async getFeeEstimate(query: FeeEstimateQueryDto): Promise<FeeEstimateDto> {
    const cacheKey = this.buildCacheKey(query);
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return this.mapToDto(cached.estimate);
    }

    try {
      const estimate = await this.calculateFeeEstimate(query);
      
      // Cache the result
      this.cache.set(cacheKey, {
        estimate,
        timestamp: Date.now(),
        ttl: estimate.cacheTtlSeconds * 1000,
      });

      // Store in database for analytics
      await this.saveFeeEstimate(estimate);

      return this.mapToDto(estimate);
    } catch (error) {
      this.logger.error(`Failed to calculate fee estimate: ${error.message}`);
      return this.getFallbackEstimate(query, error.message);
    }
  }

  /**
   * Get batch fee estimates
   */
  async getBatchFeeEstimates(
    query: BatchFeeEstimateQueryDto,
  ): Promise<BatchFeeEstimateResponseDto> {
    const estimates: FeeEstimateDto[] = [];
    let fallbacks = 0;

    for (const route of query.routes) {
      try {
        const estimate = await this.getFeeEstimate({
          bridgeName: route.bridgeName,
          sourceChain: route.sourceChain,
          destinationChain: route.destinationChain,
          token: route.token,
          amount: route.amount,
          includeUsd: query.includeUsd,
        });

        if (estimate.isFallback) {
          fallbacks++;
        }

        estimates.push(estimate);
      } catch (error) {
        this.logger.warn(`Failed to get estimate for route: ${error.message}`);
        fallbacks++;
        estimates.push(
          this.getFallbackEstimate(
            {
              bridgeName: route.bridgeName,
              sourceChain: route.sourceChain,
              destinationChain: route.destinationChain,
            },
            error.message,
          ),
        );
      }
    }

    return {
      estimates,
      successful: estimates.length - fallbacks,
      fallbacks,
      generatedAt: new Date(),
    };
  }

  /**
   * Compare fees across multiple bridges
   */
  async compareFees(
    sourceChain: string,
    destinationChain: string,
    token?: string,
    amount?: number,
    bridges?: string[],
  ): Promise<FeeComparisonResponseDto> {
    const bridgeList = bridges || this.bridgeFeeAdapter.getSupportedBridges();
    const comparisons: FeeComparisonDto[] = [];

    for (const bridgeName of bridgeList) {
      try {
        const estimate = await this.getFeeEstimate({
          bridgeName,
          sourceChain,
          destinationChain,
          token,
          amount,
        });

        comparisons.push({
          bridgeName,
          totalFee: estimate.totalFee,
          totalFeeUsd: estimate.totalFeeUsd,
          breakdown: {
            gasFee: estimate.gasFee,
            bridgeFee: estimate.bridgeFee,
            liquidityFee: estimate.liquidityFee,
            protocolFee: estimate.protocolFee,
          },
          isFallback: estimate.isFallback,
          rank: 0, // Will be set after sorting
          savingsPercent: 0, // Will be calculated
        });
      } catch (error) {
        this.logger.warn(`Failed to compare fee for ${bridgeName}: ${error.message}`);
      }
    }

    // Sort by total fee and assign ranks
    comparisons.sort((a, b) => a.totalFee - b.totalFee);
    
    const cheapest = comparisons[0];
    const mostExpensive = comparisons[comparisons.length - 1];

    comparisons.forEach((comp, index) => {
      comp.rank = index + 1;
      if (mostExpensive.totalFee > 0) {
        comp.savingsPercent =
          ((mostExpensive.totalFee - comp.totalFee) / mostExpensive.totalFee) * 100;
      }
    });

    return {
      comparisons,
      cheapest,
      fastest: comparisons.find((c) => !c.isFallback) || cheapest,
      sourceChain,
      destinationChain,
      generatedAt: new Date(),
    };
  }

  /**
   * Calculate fee estimate
   */
  private async calculateFeeEstimate(
    query: FeeEstimateQueryDto,
  ): Promise<FeeEstimate> {
    const { bridgeName, sourceChain, destinationChain, token, amount } = query;

    // Get gas price
    const gasPrice = await this.gasPriceAdapter.getGasPrice(sourceChain);
    
    // Calculate gas fee
    const gasFee = this.gasPriceAdapter.calculateGasFee(
      sourceChain,
      gasPrice.gasPriceGwei,
      gasPrice.recommendedGasLimit,
    );

    // Get bridge fees
    const bridgeFees = this.bridgeFeeAdapter.estimateTotalBridgeCost(
      bridgeName,
      amount || 0,
      sourceChain,
    );

    // Calculate total fee
    const totalFee = gasFee + bridgeFees.totalFee;

    // Get fee token (native token of source chain)
    const feeToken = this.getNativeToken(sourceChain);

    // Calculate USD values (simplified - would need price oracle in production)
    const feeTokenPriceUsd = await this.getTokenPriceUsd(feeToken);
    const totalFeeUsd = feeTokenPriceUsd ? totalFee * feeTokenPriceUsd : undefined;

    // Create estimate entity
    const estimate = this.feeEstimateRepository.create({
      bridgeName,
      sourceChain,
      destinationChain,
      token: token || null,
      amount: amount || null,
      totalFee,
      gasFee,
      bridgeFee: bridgeFees.bridgeFee,
      liquidityFee: bridgeFees.liquidityFee,
      protocolFee: bridgeFees.protocolFee,
      gasPriceGwei: gasPrice.gasPriceGwei,
      gasLimit: gasPrice.recommendedGasLimit,
      networkCongestion: gasPrice.congestionLevel,
      feeToken,
      feeTokenPriceUsd: feeTokenPriceUsd || null,
      totalFeeUsd: totalFeeUsd || null,
      isFallback: false,
      fallbackReason: null,
      estimatedDurationSeconds: this.estimateDuration(bridgeName, sourceChain, destinationChain),
      expiresAt: gasPrice.expiresAt,
      cacheTtlSeconds: Math.floor((gasPrice.expiresAt.getTime() - Date.now()) / 1000),
    });

    return estimate;
  }

  /**
   * Get fallback estimate when dynamic fetching fails
   */
  private getFallbackEstimate(
    query: Partial<FeeEstimateQueryDto>,
    reason: string,
  ): FeeEstimateDto {
    const fallbackGasFee = 0.001; // Conservative fallback
    const fallbackBridgeFee = 0.0001;
    
    const feeToken = query.sourceChain
      ? this.getNativeToken(query.sourceChain)
      : 'ETH';

    return {
      bridgeName: query.bridgeName || 'unknown',
      sourceChain: query.sourceChain || 'unknown',
      destinationChain: query.destinationChain || 'unknown',
      token: query.token,
      amount: query.amount,
      totalFee: fallbackGasFee + fallbackBridgeFee,
      gasFee: fallbackGasFee,
      bridgeFee: fallbackBridgeFee,
      liquidityFee: 0,
      protocolFee: 0,
      feeToken,
      isFallback: true,
      fallbackReason: reason,
      lastUpdated: new Date(),
      expiresAt: new Date(Date.now() + 300000), // 5 minutes
      cacheTtlSeconds: 60,
    };
  }

  /**
   * Save fee estimate to database
   */
  private async saveFeeEstimate(estimate: FeeEstimate): Promise<void> {
    try {
      await this.feeEstimateRepository.save(estimate);
    } catch (error) {
      this.logger.warn(`Failed to save fee estimate: ${error.message}`);
    }
  }

  /**
   * Get native token for chain
   */
  private getNativeToken(chain: string): string {
    const nativeTokens: Record<string, string> = {
      ethereum: 'ETH',
      polygon: 'MATIC',
      arbitrum: 'ETH',
      optimism: 'ETH',
      base: 'ETH',
      bsc: 'BNB',
      avalanche: 'AVAX',
      fantom: 'FTM',
      gnosis: 'xDAI',
      scroll: 'ETH',
      linea: 'ETH',
      zksync: 'ETH',
      zkevm: 'ETH',
    };
    return nativeTokens[chain.toLowerCase()] || 'ETH';
  }

  /**
   * Get token price in USD (simplified - would use price oracle)
   */
  private async getTokenPriceUsd(token: string): Promise<number | undefined> {
    // Simplified price mapping - in production, use a price oracle
    const prices: Record<string, number> = {
      ETH: 3000,
      MATIC: 0.8,
      BNB: 600,
      AVAX: 35,
      FTM: 0.6,
      xDAI: 1,
    };
    return prices[token];
  }

  /**
   * Estimate transaction duration
   */
  private estimateDuration(
    bridgeName: string,
    sourceChain: string,
    destinationChain: string,
  ): number {
    // Base durations by bridge (in seconds)
    const baseDurations: Record<string, number> = {
      hop: 300, // 5 minutes
      across: 120, // 2 minutes
      stargate: 600, // 10 minutes
      cctp: 1800, // 30 minutes
      synapse: 600,
      connext: 300,
      layerzero: 120,
      axelar: 300,
      wormhole: 900,
    };

    const baseDuration = baseDurations[bridgeName.toLowerCase()] || 600;
    
    // Add chain-specific delays
    const chainDelays: Record<string, number> = {
      ethereum: 60,
      polygon: 30,
      arbitrum: 15,
      optimism: 15,
    };

    const sourceDelay = chainDelays[sourceChain.toLowerCase()] || 30;
    const destDelay = chainDelays[destinationChain.toLowerCase()] || 30;

    return baseDuration + sourceDelay + destDelay;
  }

  /**
   * Build cache key
   */
  private buildCacheKey(query: FeeEstimateQueryDto): string {
    return `${query.bridgeName}:${query.sourceChain}:${query.destinationChain}:${query.token || 'none'}:${query.amount || 0}`;
  }

  /**
   * Map entity to DTO
   */
  private mapToDto(estimate: FeeEstimate): FeeEstimateDto {
    return {
      bridgeName: estimate.bridgeName,
      sourceChain: estimate.sourceChain,
      destinationChain: estimate.destinationChain,
      token: estimate.token || undefined,
      amount: estimate.amount || undefined,
      totalFee: estimate.totalFee,
      gasFee: estimate.gasFee,
      bridgeFee: estimate.bridgeFee,
      liquidityFee: estimate.liquidityFee,
      protocolFee: estimate.protocolFee,
      gasPriceGwei: estimate.gasPriceGwei || undefined,
      gasLimit: estimate.gasLimit || undefined,
      networkCongestion: estimate.networkCongestion || undefined,
      feeToken: estimate.feeToken,
      feeTokenPriceUsd: estimate.feeTokenPriceUsd || undefined,
      totalFeeUsd: estimate.totalFeeUsd || undefined,
      isFallback: estimate.isFallback,
      fallbackReason: estimate.fallbackReason || undefined,
      estimatedDurationSeconds: estimate.estimatedDurationSeconds || undefined,
      lastUpdated: estimate.lastUpdated,
      expiresAt: estimate.expiresAt,
      cacheTtlSeconds: estimate.cacheTtlSeconds,
    };
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would track in production
    };
  }
}
