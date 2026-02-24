/**
 * Mock Bridge Adapter for Local Testing
 *
 * Provides a sandbox mode for testing bridge integrations without
 * connecting to real bridge APIs. Simulates realistic bridge responses
 * with configurable delays, failures, and scenarios.
 *
 * @example
 * ```typescript
 * import { MockBridgeAdapter } from '@bridgewise/bridge-core';
 *
 * // Create mock adapter with default settings
 * const mockAdapter = new MockBridgeAdapter();
 *
 * // Create with custom configuration
 * const mockAdapter = new MockBridgeAdapter({
 *   networkDelay: 100,
 *   failureRate: 0.1,
 *   sandboxMode: true
 * });
 *
 * // Use in tests
 * const routes = await mockAdapter.fetchRoutes({
 *   sourceChain: 'ethereum',
 *   targetChain: 'polygon',
 *   assetAmount: '1000000000000000000'
 * });
 * ```
 */

import {
  BridgeAdapter,
  BridgeAdapterConfig,
  NormalizedFee,
  BridgeTokenMapping,
} from '../unified-adapter/adapter.interface';
import { BridgeRoute, RouteRequest, BridgeProvider, ChainId } from '../types';

/**
 * Configuration options for the MockBridgeAdapter
 */
export interface MockAdapterConfig {
  /** Simulate network delay in milliseconds (default: 0) */
  networkDelay?: number;

  /** Rate of simulated failures 0-1 (default: 0) */
  failureRate?: number;

  /** Enable sandbox mode - returns mock data without external calls (default: true) */
  sandboxMode?: boolean;

  /** Custom mock responses for specific scenarios */
  customResponses?: {
    routes?: BridgeRoute[];
    fees?: NormalizedFee;
    health?: {
      healthy: boolean;
      uptime: number;
      message?: string;
    };
  };

  /** Supported chain pairs for testing */
  supportedChainPairs?: Array<[ChainId, ChainId]>;

  /** Supported tokens per chain */
  supportedTokens?: Record<ChainId, string[]>;
}

/**
 * Mock bridge adapter for local testing and development
 * Implements the full BridgeAdapter interface with mock data
 */
export class MockBridgeAdapter implements BridgeAdapter {
  readonly provider: BridgeProvider = 'hop'; // Using hop as mock provider

  private config: Required<MockAdapterConfig>;
  private _isReady: boolean = false;
  private requestCount: number = 0;

  // Default supported chain pairs
  private static readonly DEFAULT_CHAIN_PAIRS: Array<[ChainId, ChainId]> = [
    ['ethereum', 'polygon'],
    ['ethereum', 'arbitrum'],
    ['ethereum', 'optimism'],
    ['ethereum', 'base'],
    ['polygon', 'ethereum'],
    ['polygon', 'arbitrum'],
    ['polygon', 'optimism'],
    ['arbitrum', 'ethereum'],
    ['arbitrum', 'polygon'],
    ['arbitrum', 'optimism'],
    ['optimism', 'ethereum'],
    ['optimism', 'polygon'],
    ['optimism', 'arbitrum'],
    ['base', 'ethereum'],
    ['base', 'polygon'],
  ];

  // Default supported tokens
  private static readonly DEFAULT_TOKENS: Record<ChainId, string[]> = {
    ethereum: ['0x0000000000000000000000000000000000000000', '0xA0b86a33E6441e6C7D3D4B4f6c7E8f9a0B1c2D3e', 'USDC', 'USDT', 'DAI', 'ETH'],
    polygon: ['0x0000000000000000000000000000000000000000', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', 'USDC', 'USDT', 'DAI', 'MATIC'],
    arbitrum: ['0x0000000000000000000000000000000000000000', '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', 'USDC', 'USDT', 'DAI', 'ETH'],
    optimism: ['0x0000000000000000000000000000000000000000', '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', 'USDC', 'USDT', 'DAI', 'ETH'],
    base: ['0x0000000000000000000000000000000000000000', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'USDC', 'USDT', 'ETH'],
    gnosis: ['0x0000000000000000000000000000000000000000', 'USDC', 'USDT', 'XDAI'],
    nova: ['0x0000000000000000000000000000000000000000', 'USDC', 'ETH'],
    stellar: ['native', 'USDC', 'USDT'],
    bsc: ['0x0000000000000000000000000000000000000000', 'USDC', 'USDT', 'BNB'],
    avalanche: ['0x0000000000000000000000000000000000000000', 'USDC', 'USDT', 'AVAX'],
  };

  constructor(config: MockAdapterConfig = {}) {
    this.config = {
      networkDelay: config.networkDelay ?? 0,
      failureRate: config.failureRate ?? 0,
      sandboxMode: config.sandboxMode ?? true,
      customResponses: config.customResponses ?? {},
      supportedChainPairs: config.supportedChainPairs ?? MockBridgeAdapter.DEFAULT_CHAIN_PAIRS,
      supportedTokens: config.supportedTokens ?? MockBridgeAdapter.DEFAULT_TOKENS,
    };
  }

  /**
   * Get adapter configuration
   */
  getConfig(): BridgeAdapterConfig {
    return {
      provider: this.provider,
      name: this.getName(),
      endpoints: {
        primary: 'mock://localhost',
        fallback: undefined,
        rpc: undefined,
      },
      timeout: 30000,
      retry: {
        attempts: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
      },
      rateLimit: {
        requestsPerSecond: 100,
        windowMs: 1000,
      },
      metadata: {
        sandboxMode: this.config.sandboxMode,
        mockAdapter: true,
      },
    };
  }

  /**
   * Get display name for this bridge provider
   */
  getName(): string {
    return 'Mock Bridge Adapter (Sandbox)';
  }

  /**
   * Initialize the adapter
   */
  async initialize(): Promise<void> {
    await this.simulateDelay();
    this._isReady = true;
  }

  /**
   * Check if adapter is ready to use
   */
  isReady(): boolean {
    return this._isReady;
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    this._isReady = false;
  }

  /**
   * Check if this adapter supports the given chain pair
   */
  supportsChainPair(sourceChain: ChainId, targetChain: ChainId): boolean {
    return this.config.supportedChainPairs.some(
      ([s, t]) => s === sourceChain && t === targetChain
    );
  }

  /**
   * Check if this adapter supports a specific token pair
   */
  async supportsTokenPair(
    sourceChain: ChainId,
    targetChain: ChainId,
    sourceToken: string,
    destinationToken: string,
  ): Promise<boolean> {
    await this.simulateDelay();

    if (!this.supportsChainPair(sourceChain, targetChain)) {
      return false;
    }

    const sourceTokens = this.config.supportedTokens[sourceChain] || [];
    const destTokens = this.config.supportedTokens[targetChain] || [];

    const normalizedSource = this.normalizeToken(sourceToken);
    const normalizedDest = this.normalizeToken(destinationToken);

    const sourceSupported = sourceTokens.some(
      t => this.normalizeToken(t) === normalizedSource
    );
    const destSupported = destTokens.some(
      t => this.normalizeToken(t) === normalizedDest
    );

    return sourceSupported && destSupported;
  }

  /**
   * Get token mapping information for a specific bridge route
   */
  async getTokenMapping(
    sourceChain: ChainId,
    targetChain: ChainId,
    sourceToken: string,
  ): Promise<BridgeTokenMapping | null> {
    await this.simulateDelay();

    if (!this.supportsChainPair(sourceChain, targetChain)) {
      return null;
    }

    // Generate mock token mapping
    const mapping: BridgeTokenMapping = {
      sourceToken,
      destinationToken: this.getDestinationToken(sourceToken),
      sourceDecimals: 18,
      destinationDecimals: 18,
      conversionMultiplier: '1',
      isSupported: true,
      bridgeTokenId: `mock-${sourceChain}-${targetChain}-${sourceToken}`,
      minAmount: '1000000000000000', // 0.001 ETH equivalent
      maxAmount: '1000000000000000000000', // 1000 ETH equivalent
    };

    return mapping;
  }

  /**
   * Fetch available routes for the given request
   */
  async fetchRoutes(request: RouteRequest): Promise<BridgeRoute[]> {
    await this.simulateDelay();
    this.requestCount++;

    // Check for simulated failure
    if (this.shouldFail()) {
      throw new Error('[MockBridgeAdapter] Simulated API failure');
    }

    // Return custom routes if provided
    if (this.config.customResponses.routes) {
      return this.config.customResponses.routes;
    }

    // Check chain pair support
    if (!this.supportsChainPair(request.sourceChain, request.targetChain)) {
      return [];
    }

    // Generate mock route
    const inputAmount = BigInt(request.assetAmount);
    const feePercentage = 0.5; // 0.5% fee
    const fee = (inputAmount * BigInt(Math.round(feePercentage * 100))) / 10000n;
    const outputAmount = inputAmount - fee;

    const route: BridgeRoute = {
      id: this.generateRouteId(request.sourceChain, request.targetChain, 0),
      provider: this.provider,
      sourceChain: request.sourceChain,
      targetChain: request.targetChain,
      inputAmount: inputAmount.toString(),
      outputAmount: outputAmount.toString(),
      fee: fee.toString(),
      feePercentage,
      estimatedTime: this.estimateBridgeTime(request.sourceChain, request.targetChain),
      reliability: 0.98,
      minAmountOut: (outputAmount * 995n / 1000n).toString(), // 0.5% slippage
      maxAmountOut: outputAmount.toString(),
      deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      transactionData: {
        contractAddress: '0xMockBridgeContractAddress',
        calldata: '0xMockCalldata',
        value: '0',
        gasEstimate: '150000',
      },
      metadata: {
        description: `Mock bridge route from ${request.sourceChain} to ${request.targetChain}`,
        riskLevel: 1,
        feeBreakdown: {
          networkFee: (fee / 3n).toString(),
          bridgeFee: (fee / 3n).toString(),
          slippageFee: (fee / 3n).toString(),
        },
        tokenIn: request.tokenAddress || 'native',
        tokenOut: request.tokenAddress || 'native',
      },
    };

    return [route];
  }

  /**
   * Get normalized fee information
   */
  async getNormalizedFee(
    sourceChain: ChainId,
    targetChain: ChainId,
    tokenAddress?: string,
    amount?: string,
  ): Promise<NormalizedFee> {
    await this.simulateDelay();

    if (this.config.customResponses.fees) {
      return this.config.customResponses.fees;
    }

    const baseFee = amount ? BigInt(amount) / 200n : 5000000000000000n; // 0.5% or default

    return {
      total: baseFee.toString(),
      percentage: 0.5,
      breakdown: {
        network: (baseFee / 3n).toString(),
        protocol: (baseFee / 3n).toString(),
        slippage: (baseFee / 3n).toString(),
      },
      currency: tokenAddress || 'native',
      lastUpdated: Date.now(),
    };
  }

  /**
   * Get list of supported source chains
   */
  getSupportedSourceChains(): ChainId[] {
    const chains = new Set<ChainId>();
    this.config.supportedChainPairs.forEach(([source]) => chains.add(source));
    return Array.from(chains);
  }

  /**
   * Get list of supported destination chains for a given source chain
   */
  getSupportedDestinationChains(sourceChain: ChainId): ChainId[] {
    const chains = new Set<ChainId>();
    this.config.supportedChainPairs.forEach(([source, target]) => {
      if (source === sourceChain) {
        chains.add(target);
      }
    });
    return Array.from(chains);
  }

  /**
   * Get supported tokens on a specific chain
   */
  async getSupportedTokens(chain: ChainId): Promise<string[]> {
    await this.simulateDelay();
    return this.config.supportedTokens[chain] || [];
  }

  /**
   * Get bridge health/status information
   */
  async getHealth(): Promise<{
    healthy: boolean;
    uptime: number;
    lastChecked: number;
    message?: string;
  }> {
    await this.simulateDelay();

    if (this.config.customResponses.health) {
      return {
        ...this.config.customResponses.health,
        lastChecked: Date.now(),
      };
    }

    return {
      healthy: this._isReady && !this.shouldFail(),
      uptime: 99.9,
      lastChecked: Date.now(),
      message: this._isReady ? 'Mock adapter is healthy' : 'Mock adapter not initialized',
    };
  }

  /**
   * Get the number of requests made to this adapter
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Reset the adapter state
   */
  reset(): void {
    this.requestCount = 0;
    this._isReady = false;
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(config: Partial<MockAdapterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ============================================================================
  // Private helper methods
  // ============================================================================

  private async simulateDelay(): Promise<void> {
    if (this.config.networkDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.networkDelay));
    }
  }

  private shouldFail(): boolean {
    return Math.random() < this.config.failureRate;
  }

  private normalizeToken(token: string): string {
    if (token.startsWith('0x') || token.startsWith('0X')) {
      return token.slice(2).toLowerCase();
    }
    return token.toLowerCase();
  }

  private generateRouteId(
    sourceChain: string,
    targetChain: string,
    index: number,
  ): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `mock-${sourceChain}-${targetChain}-${index}-${timestamp}-${random}`;
  }

  private estimateBridgeTime(sourceChain: ChainId, targetChain: ChainId): number {
    const l1Chains = new Set(['ethereum']);
    const source = l1Chains.has(sourceChain) ? 'l1' : 'l2';
    const target = l1Chains.has(targetChain) ? 'l1' : 'l2';

    if (source === 'l1' && target === 'l1') {
      return 1200; // 20 minutes
    } else if ((source === 'l1' && target === 'l2') || (source === 'l2' && target === 'l1')) {
      return 300; // 5 minutes
    } else {
      return 180; // 3 minutes for L2->L2
    }
  }

  private getDestinationToken(sourceToken: string): string {
    // Simple mapping for common tokens
    const tokenMap: Record<string, string> = {
      '0xa0b86a33e6441e6c7d3d4b4f6c7e8f9a0b1c2d3e': '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC eth->poly
      '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': '0xa0b86a33e6441e6c7d3d4b4f6c7e8f9a0b1c2d3e', // USDC poly->eth
      'usdc': 'usdc',
      'usdt': 'usdt',
      'dai': 'dai',
      'native': 'native',
    };

    const normalized = this.normalizeToken(sourceToken);
    return tokenMap[normalized] || sourceToken;
  }
}

/**
 * Factory function to create a pre-configured mock adapter for testing
 */
export function createMockAdapter(
  scenario: 'happy-path' | 'slow-network' | 'unreliable' | 'empty-routes' = 'happy-path'
): MockBridgeAdapter {
  const scenarios: Record<string, MockAdapterConfig> = {
    'happy-path': {
      networkDelay: 50,
      failureRate: 0,
      sandboxMode: true,
    },
    'slow-network': {
      networkDelay: 2000,
      failureRate: 0,
      sandboxMode: true,
    },
    'unreliable': {
      networkDelay: 100,
      failureRate: 0.3,
      sandboxMode: true,
    },
    'empty-routes': {
      networkDelay: 50,
      failureRate: 0,
      sandboxMode: true,
      customResponses: {
        routes: [],
      },
    },
  };

  return new MockBridgeAdapter(scenarios[scenario]);
}

export default MockBridgeAdapter;
