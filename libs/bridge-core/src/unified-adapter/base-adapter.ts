/**
 * Base Bridge Adapter Implementation
 *
 * Provides common functionality for bridge adapters with sensible defaults
 */

import {
  BridgeAdapter,
  BridgeAdapterConfig,
  NormalizedFee,
  BridgeTokenMapping,
} from './adapter.interface';
import { BridgeRoute, RouteRequest, BridgeProvider, ChainId } from '../types';
import { validateAdapterConfig } from './validators';
import { ADAPTER_ERRORS } from './errors';

/**
 * Abstract base class for bridge adapters
 *
 * Provides common functionality and enforces the BridgeAdapter interface contract
 */
export abstract class BaseBridgeAdapter implements BridgeAdapter {
  /** Adapter configuration */
  protected config: BridgeAdapterConfig;

  /** Initialization state */
  protected _isReady: boolean = false;

  /**
   * Constructor
   *
   * @param config Adapter configuration
   */
  constructor(config: BridgeAdapterConfig) {
    validateAdapterConfig(config);
    this.config = config;
  }

  // ============================================================================
  // Abstract methods that subclasses must implement
  // ============================================================================

  abstract readonly provider: BridgeProvider;

  abstract supportsChainPair(
    sourceChain: ChainId,
    targetChain: ChainId,
  ): boolean;

  abstract fetchRoutes(request: RouteRequest): Promise<BridgeRoute[]>;

  abstract getName(): string;

  // ============================================================================
  // Concrete implementations with defaults
  // ============================================================================

  getConfig(): BridgeAdapterConfig {
    return this.config;
  }

  async supportsTokenPair(
    sourceChain: ChainId,
    targetChain: ChainId,
    sourceToken: string,
    destinationToken: string,
  ): Promise<boolean> {
    // Default implementation: check chain support
    // Subclasses should override for better token-specific checks
    return this.supportsChainPair(sourceChain, targetChain);
  }

  async getTokenMapping(
    sourceChain: ChainId,
    targetChain: ChainId,
    sourceToken: string,
  ): Promise<BridgeTokenMapping | null> {
    // Default implementation: no token mapping
    // Subclasses should override to provide token mappings
    return null;
  }

  async getNormalizedFee(
    sourceChain: ChainId,
    targetChain: ChainId,
    tokenAddress?: string,
    amount?: string,
  ): Promise<NormalizedFee> {
    // Default: 0.5% fee
    const fee: NormalizedFee = {
      total: '0',
      percentage: 0.5,
      lastUpdated: Date.now(),
    };
    return fee;
  }

  getSupportedSourceChains(): ChainId[] {
    // Default: empty array
    // Subclasses should override to return supported chains
    return [];
  }

  getSupportedDestinationChains(sourceChain: ChainId): ChainId[] {
    // Default: empty array
    // Subclasses should override to return chains supported for a given source
    return [];
  }

  async getSupportedTokens(chain: ChainId): Promise<string[]> {
    // Default: empty array
    // Subclasses should override to return supported tokens
    return [];
  }

  async getHealth(): Promise<{
    healthy: boolean;
    uptime: number;
    lastChecked: number;
    message?: string;
  }> {
    // Default: assume healthy if ready
    return {
      healthy: this._isReady,
      uptime: this._isReady ? 100 : 0,
      lastChecked: Date.now(),
      message: this._isReady ? 'Adapter is ready' : 'Adapter is not ready',
    };
  }

  isReady(): boolean {
    return this._isReady;
  }

  async initialize(): Promise<void> {
    // Default: mark as ready
    this._isReady = true;
  }

  async shutdown(): Promise<void> {
    // Default: mark as not ready
    this._isReady = false;
  }

  // ============================================================================
  // Protected utility methods
  // ============================================================================

  /**
   * Normalize chain identifier
   *
   * @protected
   */
  protected normalizeChain(chain: string): string {
    return chain.toLowerCase();
  }

  /**
   * Normalize token address
   *
   * @protected
   */
  protected normalizeToken(token: string): string {
    // Remove '0x' prefix if present and lowercase
    if (token.startsWith('0x') || token.startsWith('0X')) {
      return token.slice(2).toLowerCase();
    }
    return token.toLowerCase();
  }

  /**
   * Generate a unique route ID
   *
   * @protected
   */
  protected generateRouteId(
    sourceChain: string,
    targetChain: string,
    index: number = 0,
  ): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `${this.provider}-${sourceChain}-${targetChain}-${index}-${timestamp}-${random}`;
  }

  /**
   * Calculate fee percentage from input and output amounts
   *
   * @protected
   */
  protected calculateFeePercentage(
    inputAmount: string,
    outputAmount: string,
  ): number {
    try {
      const input = BigInt(inputAmount);
      const output = BigInt(outputAmount);

      if (input === 0n) return 0;

      const fee = input - output;
      const feePercentage = Number((fee * 10000n) / input) / 100;

      return Math.max(0, Math.min(100, feePercentage));
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate output amount given fee percentage
   *
   * @protected
   */
  protected calculateOutputAmount(
    inputAmount: string,
    feePercentage: number,
  ): string {
    try {
      const input = BigInt(inputAmount);
      const fee = (input * BigInt(Math.round(feePercentage * 100))) / 10000n;
      return (input - fee).toString();
    } catch (error) {
      return '0';
    }
  }

  /**
   * Convert between token decimals
   *
   * @protected
   */
  protected convertDecimals(
    amount: string,
    fromDecimals: number,
    toDecimals: number,
  ): string {
    try {
      const decimalDiff = toDecimals - fromDecimals;
      const bn = BigInt(amount);

      if (decimalDiff > 0) {
        return (bn * BigInt(10) ** BigInt(decimalDiff)).toString();
      } else if (decimalDiff < 0) {
        return (bn / BigInt(10) ** BigInt(-decimalDiff)).toString();
      } else {
        return amount;
      }
    } catch (error) {
      return '0';
    }
  }

  /**
   * Estimate bridge time in seconds
   *
   * @protected
   */
  protected estimateBridgeTime(
    sourceChain: ChainId,
    targetChain: ChainId,
  ): number {
    // Default estimates per bridge type
    // L1 to L1: 10-30 minutes
    // L1 to L2: 2-10 minutes
    // L2 to L2: 2-5 minutes
    // Can be overridden by subclasses for more accurate estimates

    const l1Chains = new Set(['ethereum']);
    const source = l1Chains.has(sourceChain) ? 'l1' : 'l2';
    const target = l1Chains.has(targetChain) ? 'l1' : 'l2';

    if (source === 'l1' && target === 'l1') {
      return 1200; // 20 minutes average
    } else if (
      (source === 'l1' && target === 'l2') ||
      (source === 'l2' && target === 'l1')
    ) {
      return 300; // 5 minutes average
    } else {
      return 180; // 3 minutes average for L2->L2
    }
  }

  /**
   * Check if adapter is initialized before operation
   *
   * @protected
   * @throws AdapterError if not ready
   */
  protected assertReady(): void {
    if (!this._isReady) {
      throw ADAPTER_ERRORS.notReady();
    }
  }

  /**
   * Helper to handle API errors uniformly
   *
   * @protected
   */
  protected handleApiError(error: any, context: string): never {
    if (error.response?.status === 429) {
      throw ADAPTER_ERRORS.rateLimited(
        error.response.headers['retry-after']
          ? parseInt(error.response.headers['retry-after'])
          : undefined,
      );
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw ADAPTER_ERRORS.timeout(context, this.config.timeout || 10000);
    }

    if (error.response?.status) {
      throw ADAPTER_ERRORS.apiError(
        `${context}: ${error.message}`,
        error.response.status,
        error.response?.data,
      );
    }

    throw ADAPTER_ERRORS.apiError(
      `${context}: ${error.message || 'Unknown error'}`,
    );
  }

  /**
   * Validate chain pair support
   *
   * @protected
   * @throws AdapterError if chain pair not supported
   */
  protected validateChainPair(
    sourceChain: ChainId,
    targetChain: ChainId,
  ): void {
    if (!this.supportsChainPair(sourceChain, targetChain)) {
      throw ADAPTER_ERRORS.unsupportedChainPair(sourceChain, targetChain);
    }
  }
}
