import { Injectable } from '@nestjs/common';
import {
  AssetIntelligence,
  IntelligenceFilter,
  IntelligenceResponse,
  ProviderIntelligence,
  RouteIntelligence,
} from './types';

/**
 * Soroban Cross-Chain Intelligence Service (#563).
 *
 * Exposes intelligence data about cross-chain routes, providers, and assets.
 * Operates on in-memory seed data that would be replaced by a production
 * database in a deployed environment.
 */
@Injectable()
export class CrossChainIntelligenceService {
  private readonly routes: RouteIntelligence[] = [
    {
      routeId: 'stellar-ethereum-stellarbridge',
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      bridge: 'StellarBridge',
      available: true,
      feeUsd: 0.5,
      estimatedTimeSeconds: 5,
      reliabilityScore: 97,
      minVolume: 10,
      maxVolume: 100000,
    },
    {
      routeId: 'stellar-polygon-fastbridge',
      sourceChain: 'stellar',
      destinationChain: 'polygon',
      bridge: 'FastBridge',
      available: true,
      feeUsd: 1.2,
      estimatedTimeSeconds: 3,
      reliabilityScore: 92,
      minVolume: 5,
      maxVolume: 50000,
    },
    {
      routeId: 'ethereum-stellar-axelar',
      sourceChain: 'ethereum',
      destinationChain: 'stellar',
      bridge: 'Axelar',
      available: true,
      feeUsd: 2.0,
      estimatedTimeSeconds: 10,
      reliabilityScore: 95,
      minVolume: 20,
      maxVolume: 200000,
    },
  ];

  private readonly providers: ProviderIntelligence[] = [
    {
      providerId: 'stellarbridge',
      name: 'StellarBridge',
      supportedChains: ['stellar', 'ethereum'],
      supportedAssets: ['XLM', 'USDC', 'ETH'],
      reliabilityScore: 97,
      averageFeeUsd: 0.5,
      averageTimeSeconds: 5,
      totalTransfers: 15000,
      successRate: 0.99,
    },
    {
      providerId: 'fastbridge',
      name: 'FastBridge',
      supportedChains: ['stellar', 'polygon'],
      supportedAssets: ['XLM', 'USDC', 'MATIC'],
      reliabilityScore: 92,
      averageFeeUsd: 1.2,
      averageTimeSeconds: 3,
      totalTransfers: 8500,
      successRate: 0.96,
    },
    {
      providerId: 'axelar',
      name: 'Axelar',
      supportedChains: ['stellar', 'ethereum', 'polygon'],
      supportedAssets: ['XLM', 'USDC', 'ETH', 'MATIC'],
      reliabilityScore: 95,
      averageFeeUsd: 2.0,
      averageTimeSeconds: 10,
      totalTransfers: 22000,
      successRate: 0.98,
    },
  ];

  private readonly assets: AssetIntelligence[] = [
    {
      assetId: 'xlm',
      symbol: 'XLM',
      name: 'Stellar Lumens',
      chains: ['stellar'],
      bridgeAvailability: [
        { bridge: 'StellarBridge', chain: 'stellar', available: true },
        { bridge: 'FastBridge', chain: 'stellar', available: true },
        { bridge: 'Axelar', chain: 'stellar', available: true },
      ],
      totalLiquidityUsd: 50000000,
      averageFeeUsd: 0.1,
    },
    {
      assetId: 'usdc',
      symbol: 'USDC',
      name: 'USD Coin',
      chains: ['stellar', 'ethereum', 'polygon'],
      bridgeAvailability: [
        { bridge: 'StellarBridge', chain: 'stellar', available: true },
        { bridge: 'StellarBridge', chain: 'ethereum', available: true },
        { bridge: 'FastBridge', chain: 'stellar', available: true },
        { bridge: 'FastBridge', chain: 'polygon', available: true },
        { bridge: 'Axelar', chain: 'stellar', available: true },
        { bridge: 'Axelar', chain: 'ethereum', available: true },
        { bridge: 'Axelar', chain: 'polygon', available: true },
      ],
      totalLiquidityUsd: 120000000,
      averageFeeUsd: 0.3,
    },
    {
      assetId: 'eth',
      symbol: 'ETH',
      name: 'Ether',
      chains: ['ethereum'],
      bridgeAvailability: [
        { bridge: 'StellarBridge', chain: 'ethereum', available: true },
        { bridge: 'Axelar', chain: 'ethereum', available: true },
      ],
      totalLiquidityUsd: 80000000,
      averageFeeUsd: 1.5,
    },
  ];

  getRoutes(filter: IntelligenceFilter = {}): IntelligenceResponse<RouteIntelligence> {
    const filtered = this.routes.filter((r) => {
      if (filter.chain && r.sourceChain !== filter.chain && r.destinationChain !== filter.chain) return false;
      if (filter.sourceChain && r.sourceChain !== filter.sourceChain) return false;
      if (filter.destinationChain && r.destinationChain !== filter.destinationChain) return false;
      if (filter.bridge && r.bridge !== filter.bridge) return false;
      if (filter.provider && r.bridge !== filter.provider) return false;
      if (filter.maxFee != null && r.feeUsd > filter.maxFee) return false;
      return true;
    });
    return {
      data: filtered,
      total: this.routes.length,
      filtered: filtered.length,
      timestamp: Date.now(),
    };
  }

  getProviders(filter: IntelligenceFilter = {}): IntelligenceResponse<ProviderIntelligence> {
    const filtered = this.providers.filter((p) => {
      if (filter.provider && p.providerId !== filter.provider) return false;
      if (filter.chain && !p.supportedChains.includes(filter.chain)) return false;
      if (filter.token && !p.supportedAssets.includes(filter.token.toUpperCase())) return false;
      if (filter.minReliability != null && p.reliabilityScore < filter.minReliability) return false;
      return true;
    });
    return {
      data: filtered,
      total: this.providers.length,
      filtered: filtered.length,
      timestamp: Date.now(),
    };
  }

  getAssets(filter: IntelligenceFilter = {}): IntelligenceResponse<AssetIntelligence> {
    const filtered = this.assets.filter((a) => {
      if (filter.token && a.symbol !== filter.token.toUpperCase() && a.assetId !== filter.token.toLowerCase()) return false;
      if (filter.chain && !a.chains.includes(filter.chain)) return false;
      if (filter.minLiquidity != null && a.totalLiquidityUsd < filter.minLiquidity) return false;
      if (filter.maxFee != null && a.averageFeeUsd > filter.maxFee) return false;
      return true;
    });
    return {
      data: filtered,
      total: this.assets.length,
      filtered: filtered.length,
      timestamp: Date.now(),
    };
  }
}
