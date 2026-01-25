import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LayerZeroChainId,
  BridgeRoute,
  FeeEstimate,
  LatencyEstimate,
  BridgeEstimate,
  HealthStatus,
  LayerZeroMessage,
} from '../types/layerzero.types';

@Injectable()
export class LayerZeroService implements OnModuleInit {
  private readonly logger = new Logger(LayerZeroService.name);
  private latencyCache = new Map<string, LatencyEstimate>();
  private healthStatus = new Map<LayerZeroChainId, HealthStatus>();

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.logger.log('Initializing LayerZero Adapter Service');
    await this.initializeHealthChecks();
  }

  /**
   * Estimate fees for a LayerZero bridge transaction
   */
  async estimateFees(route: BridgeRoute, payload: string): Promise<FeeEstimate> {
    try {
      this.logger.debug(
        `Estimating fees for route: ${route.sourceChainId} -> ${route.destinationChainId}`,
      );

      // In production, this would call the actual LayerZero endpoint contract
      const message: LayerZeroMessage = {
        dstChainId: route.destinationChainId,
        dstAddress: route.tokenAddress,
        payload,
        refundAddress: '0x0000000000000000000000000000000000000000',
        zroPaymentAddress: '0x0000000000000000000000000000000000000000',
        adapterParams: '0x',
      };

      // Simulate fee calculation based on chain and payload size
      const baseFee = this.calculateBaseFee(route.sourceChainId, route.destinationChainId);
      const payloadCost = Buffer.from(payload.replace('0x', ''), 'hex').length * 16;
      const nativeFee = (baseFee + payloadCost).toString();

      const feeEstimate: FeeEstimate = {
        nativeFee,
        zroFee: '0', // ZRO token fee (optional payment method)
        totalFeeUsd: await this.convertToUsd(nativeFee, route.sourceChainId),
        estimatedAt: new Date(),
      };

      this.logger.debug(`Fee estimate: ${JSON.stringify(feeEstimate)}`);
      return feeEstimate;
    } catch (error) {
      this.logger.error(`Failed to estimate fees: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Estimate latency for a bridge transaction
   */
  async estimateLatency(route: BridgeRoute): Promise<LatencyEstimate> {
    const cacheKey = `${route.sourceChainId}-${route.destinationChainId}`;
    
    // Check cache first
    if (this.latencyCache.has(cacheKey)) {
      const cached = this.latencyCache.get(cacheKey);
      const cacheAge = Date.now() - cached.lastUpdated.getTime();
      
      // Return cached value if less than 5 minutes old
      if (cacheAge < 5 * 60 * 1000) {
        this.logger.debug(`Returning cached latency for ${cacheKey}`);
        return cached;
      }
    }

    // Calculate new estimate
    const estimate = this.calculateLatencyEstimate(
      route.sourceChainId,
      route.destinationChainId,
    );

    this.latencyCache.set(cacheKey, estimate);
    return estimate;
  }

  /**
   * Get complete bridge estimate (fees + latency)
   */
  async getBridgeEstimate(
    route: BridgeRoute,
    payload: string,
  ): Promise<BridgeEstimate> {
    const [fee, latency] = await Promise.all([
      this.estimateFees(route, payload),
      this.estimateLatency(route),
    ]);

    return {
      fee,
      latency,
      route,
    };
  }

  /**
   * Health check for specific chain endpoint
   */
  async checkHealth(chainId: LayerZeroChainId): Promise<HealthStatus> {
    const startTime = Date.now();
    const endpoint = this.getEndpointForChain(chainId);
    const errors: string[] = [];

    try {
      // Simulate endpoint health check
      // In production, this would ping the actual LayerZero endpoint
      await this.pingEndpoint(endpoint);

      const latency = Date.now() - startTime;
      const isHealthy = latency < 5000; // Consider unhealthy if > 5s

      if (!isHealthy) {
        errors.push(`High latency: ${latency}ms`);
      }

      const status: HealthStatus = {
        isHealthy,
        endpoint,
        chainId,
        latency,
        lastChecked: new Date(),
        errors: errors.length > 0 ? errors : undefined,
      };

      this.healthStatus.set(chainId, status);
      return status;
    } catch (error) {
      this.logger.error(`Health check failed for chain ${chainId}: ${error.message}`);
      
      const status: HealthStatus = {
        isHealthy: false,
        endpoint,
        chainId,
        latency: Date.now() - startTime,
        lastChecked: new Date(),
        errors: [error.message],
      };

      this.healthStatus.set(chainId, status);
      return status;
    }
  }

  /**
   * Check health of all configured chains
   */
  async checkAllHealth(): Promise<HealthStatus[]> {
    const chains = Object.values(LayerZeroChainId).filter(
      (v) => typeof v === 'number',
    ) as LayerZeroChainId[];

    const healthChecks = await Promise.all(
      chains.map((chainId) => this.checkHealth(chainId)),
    );

    return healthChecks;
  }

  /**
   * Get cached health status
   */
  getHealthStatus(chainId?: LayerZeroChainId): HealthStatus | HealthStatus[] {
    if (chainId) {
      return this.healthStatus.get(chainId);
    }
    return Array.from(this.healthStatus.values());
  }

  /**
   * Private helper methods
   */

  private async initializeHealthChecks() {
    this.logger.log('Running initial health checks...');
    await this.checkAllHealth();
    
    // Schedule periodic health checks every 60 seconds
    setInterval(() => {
      this.checkAllHealth().catch((error) => {
        this.logger.error('Periodic health check failed', error);
      });
    }, 60000);
  }

  private calculateBaseFee(
    sourceChain: LayerZeroChainId,
    destChain: LayerZeroChainId,
  ): number {
    // Base fees vary by chain combination
    const chainPairKey = `${sourceChain}-${destChain}`;
    
    const baseFees = {
      [`${LayerZeroChainId.ETHEREUM}-${LayerZeroChainId.POLYGON}`]: 500000000000000, // 0.0005 ETH
      [`${LayerZeroChainId.ETHEREUM}-${LayerZeroChainId.ARBITRUM}`]: 300000000000000, // 0.0003 ETH
      [`${LayerZeroChainId.POLYGON}-${LayerZeroChainId.ETHEREUM}`]: 1000000000000000000, // 1 MATIC
      default: 1000000000000000, // 0.001 ETH default
    };

    return baseFees[chainPairKey] || baseFees.default;
  }

  private calculateLatencyEstimate(
    sourceChain: LayerZeroChainId,
    destChain: LayerZeroChainId,
  ): LatencyEstimate {
    // Latency estimates based on chain finality and network conditions
    const baseLatency = {
      [LayerZeroChainId.ETHEREUM]: 900, // ~15 minutes for finality
      [LayerZeroChainId.POLYGON]: 180, // ~3 minutes
      [LayerZeroChainId.ARBITRUM]: 120, // ~2 minutes
      [LayerZeroChainId.OPTIMISM]: 120,
      [LayerZeroChainId.BSC]: 120,
      [LayerZeroChainId.AVALANCHE]: 60,
      [LayerZeroChainId.FANTOM]: 60,
    };

    const sourceLatency = baseLatency[sourceChain] || 300;
    const destLatency = baseLatency[destChain] || 300;
    const networkOverhead = 60; // Additional network processing time

    const estimatedSeconds = sourceLatency + destLatency + networkOverhead;

    // Confidence based on how well-tested the route is
    let confidence: 'low' | 'medium' | 'high' = 'medium';
    if (sourceChain === LayerZeroChainId.ETHEREUM || destChain === LayerZeroChainId.ETHEREUM) {
      confidence = 'high'; // Well-established routes
    }

    return {
      estimatedSeconds,
      confidence,
      lastUpdated: new Date(),
    };
  }

  private async convertToUsd(weiAmount: string, chainId: LayerZeroChainId): Promise<number> {
    // In production, fetch real-time prices from an oracle or price feed
    const mockPrices = {
      [LayerZeroChainId.ETHEREUM]: 2000, // ETH price
      [LayerZeroChainId.POLYGON]: 0.8, // MATIC price
      [LayerZeroChainId.BSC]: 300, // BNB price
      [LayerZeroChainId.AVALANCHE]: 30, // AVAX price
      [LayerZeroChainId.ARBITRUM]: 2000, // Uses ETH
      [LayerZeroChainId.OPTIMISM]: 2000, // Uses ETH
      [LayerZeroChainId.FANTOM]: 0.5, // FTM price
    };

    const price = mockPrices[chainId] || 1;
    const ethAmount = Number(weiAmount) / 1e18;
    return ethAmount * price;
  }

  private getEndpointForChain(chainId: LayerZeroChainId): string {
    // In production, these would be actual LayerZero endpoint addresses
    const endpoints = {
      [LayerZeroChainId.ETHEREUM]: '0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675',
      [LayerZeroChainId.BSC]: '0x3c2269811836af69497E5F486A85D7316753cf62',
      [LayerZeroChainId.POLYGON]: '0x3c2269811836af69497E5F486A85D7316753cf62',
      [LayerZeroChainId.AVALANCHE]: '0x3c2269811836af69497E5F486A85D7316753cf62',
      [LayerZeroChainId.ARBITRUM]: '0x3c2269811836af69497E5F486A85D7316753cf62',
      [LayerZeroChainId.OPTIMISM]: '0x3c2269811836af69497E5F486A85D7316753cf62',
      [LayerZeroChainId.FANTOM]: '0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7',
    };

    return endpoints[chainId] || '';
  }

  private async pingEndpoint(endpoint: string): Promise<void> {
    // Simulate endpoint check with random delay
    const delay = Math.random() * 1000 + 500;
    await new Promise((resolve) => setTimeout(resolve, delay));
    
    // Simulate occasional failures (5% chance)
    if (Math.random() < 0.05) {
      throw new Error('Endpoint unreachable');
    }
  }
}