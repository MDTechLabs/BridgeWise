import { Injectable, Logger } from '@nestjs/common';
import { BridgeFeeConfig } from '../types/fee-estimate.types';

/**
 * Bridge Fee Adapter
 *
 * Provides fee configurations and calculations for different bridge protocols.
 * Supports both static and dynamic fee structures.
 */
@Injectable()
export class BridgeFeeAdapter {
  private readonly logger = new Logger(BridgeFeeAdapter.name);

  // Bridge fee configurations
  private readonly bridgeConfigs: Record<string, BridgeFeeConfig> = {
    hop: {
      bridgeName: 'hop',
      baseFee: 0,
      percentageFee: 0.0004, // 0.04%
      minFee: 0.0001,
      maxFee: 10,
      supportsDynamicFees: true,
      feeToken: 'ETH',
    },
    across: {
      bridgeName: 'across',
      baseFee: 0,
      percentageFee: 0.0006, // 0.06%
      minFee: 0.0001,
      maxFee: 10,
      supportsDynamicFees: true,
      feeToken: 'ETH',
    },
    stargate: {
      bridgeName: 'stargate',
      baseFee: 0.0001,
      percentageFee: 0.0006, // 0.06%
      minFee: 0.0001,
      maxFee: 100,
      supportsDynamicFees: true,
      feeToken: 'ETH',
    },
    cctp: {
      bridgeName: 'cctp',
      baseFee: 0,
      percentageFee: 0,
      minFee: 0,
      maxFee: 0,
      supportsDynamicFees: false,
      feeToken: 'ETH',
    },
    synapse: {
      bridgeName: 'synapse',
      baseFee: 0,
      percentageFee: 0.001, // 0.1%
      minFee: 0.0005,
      maxFee: 50,
      supportsDynamicFees: true,
      feeToken: 'ETH',
    },
    connext: {
      bridgeName: 'connext',
      baseFee: 0,
      percentageFee: 0.0005, // 0.05%
      minFee: 0.0001,
      maxFee: 10,
      supportsDynamicFees: true,
      feeToken: 'ETH',
    },
    layerzero: {
      bridgeName: 'layerzero',
      baseFee: 0.0001,
      percentageFee: 0,
      minFee: 0.0001,
      maxFee: 1,
      supportsDynamicFees: true,
      feeToken: 'ETH',
    },
    axelar: {
      bridgeName: 'axelar',
      baseFee: 0.0001,
      percentageFee: 0.0001,
      minFee: 0.0001,
      maxFee: 5,
      supportsDynamicFees: true,
      feeToken: 'ETH',
    },
    wormhole: {
      bridgeName: 'wormhole',
      baseFee: 0,
      percentageFee: 0,
      minFee: 0,
      maxFee: 0,
      supportsDynamicFees: false,
      feeToken: 'ETH',
    },
  };

  // Chain-specific fee adjustments
  private readonly chainAdjustments: Record<string, number> = {
    ethereum: 1.0,
    polygon: 0.01,
    arbitrum: 0.5,
    optimism: 0.5,
    base: 0.5,
    bsc: 0.3,
    avalanche: 0.8,
    fantom: 0.2,
    gnosis: 0.1,
    scroll: 0.5,
    linea: 0.5,
    zksync: 0.5,
    zkevm: 0.5,
  };

  /**
   * Get bridge fee configuration
   */
  getBridgeConfig(bridgeName: string): BridgeFeeConfig | null {
    return this.bridgeConfigs[bridgeName.toLowerCase()] || null;
  }

  /**
   * Calculate bridge fee
   */
  calculateBridgeFee(
    bridgeName: string,
    amount: number,
    sourceChain: string,
  ): { bridgeFee: number; protocolFee: number } {
    const config = this.getBridgeConfig(bridgeName);
    if (!config) {
      this.logger.warn(`No fee config for bridge: ${bridgeName}`);
      return { bridgeFee: 0, protocolFee: 0 };
    }

    // Apply chain adjustment
    const adjustment = this.chainAdjustments[sourceChain.toLowerCase()] || 1.0;
    
    // Calculate percentage fee
    let fee = config.baseFee + amount * config.percentageFee;
    
    // Apply min/max bounds
    fee = Math.max(config.minFee, Math.min(config.maxFee, fee));
    
    // Apply chain adjustment
    fee *= adjustment;

    // Split into bridge fee and protocol fee (80/20 split)
    const bridgeFee = fee * 0.8;
    const protocolFee = fee * 0.2;

    return { bridgeFee, protocolFee };
  }

  /**
   * Calculate liquidity-based fee
   */
  calculateLiquidityFee(
    amount: number,
    poolLiquidity: number,
    feeTier: number = 0.003, // 0.3% default
  ): number {
    if (poolLiquidity <= 0) return 0;

    // Calculate price impact
    const priceImpact = amount / (poolLiquidity + amount);
    
    // Fee increases with price impact
    const impactMultiplier = 1 + priceImpact * 10;
    
    return amount * feeTier * impactMultiplier;
  }

  /**
   * Get supported bridges
   */
  getSupportedBridges(): string[] {
    return Object.keys(this.bridgeConfigs);
  }

  /**
   * Check if bridge supports dynamic fees
   */
  supportsDynamicFees(bridgeName: string): boolean {
    const config = this.getBridgeConfig(bridgeName);
    return config?.supportsDynamicFees || false;
  }

  /**
   * Get fee token for bridge
   */
  getFeeToken(bridgeName: string): string {
    const config = this.getBridgeConfig(bridgeName);
    return config?.feeToken || 'ETH';
  }

  /**
   * Estimate total bridge cost including all fees
   */
  estimateTotalBridgeCost(
    bridgeName: string,
    amount: number,
    sourceChain: string,
    poolLiquidity?: number,
  ): {
    bridgeFee: number;
    protocolFee: number;
    liquidityFee: number;
    totalFee: number;
  } {
    const { bridgeFee, protocolFee } = this.calculateBridgeFee(
      bridgeName,
      amount,
      sourceChain,
    );

    const liquidityFee = poolLiquidity
      ? this.calculateLiquidityFee(amount, poolLiquidity)
      : 0;

    return {
      bridgeFee,
      protocolFee,
      liquidityFee,
      totalFee: bridgeFee + protocolFee + liquidityFee,
    };
  }

  /**
   * Update bridge configuration (for dynamic updates)
   */
  updateBridgeConfig(
    bridgeName: string,
    updates: Partial<BridgeFeeConfig>,
  ): void {
    const normalizedName = bridgeName.toLowerCase();
    if (this.bridgeConfigs[normalizedName]) {
      this.bridgeConfigs[normalizedName] = {
        ...this.bridgeConfigs[normalizedName],
        ...updates,
      };
      this.logger.log(`Updated fee config for ${bridgeName}`);
    }
  }

  /**
   * Add new bridge configuration
   */
  addBridgeConfig(config: BridgeFeeConfig): void {
    this.bridgeConfigs[config.bridgeName.toLowerCase()] = config;
    this.logger.log(`Added fee config for ${config.bridgeName}`);
  }
}
