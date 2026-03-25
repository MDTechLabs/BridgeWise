import { BridgeRoute, RouteRequest, BridgeProvider } from '../types';

/**
 * Base interface that all bridge adapters must implement
 */
export interface BridgeAdapter {
  /** Unique identifier for this bridge provider */
  readonly provider: BridgeProvider;

  /** Check if this adapter supports the given chain pair */
  supportsChainPair(sourceChain: string, targetChain: string): boolean;

  /**
   * Fetch routes for the given request
   * @param request Route request parameters
   * @returns Promise resolving to an array of routes, or empty array if none found
   */
  fetchRoutes(request: RouteRequest): Promise<BridgeRoute[]>;

  /**
   * Get the display name for this bridge provider
   */
  getName(): string;
}

/**
 * Base class providing common functionality for bridge adapters
 */
export abstract class BaseBridgeAdapter implements BridgeAdapter {
  abstract readonly provider: BridgeProvider;

  abstract supportsChainPair(sourceChain: string, targetChain: string): boolean;

  abstract fetchRoutes(request: RouteRequest): Promise<BridgeRoute[]>;

  abstract getName(): string;

  /**
   * Normalize a chain identifier to the adapter's expected format
   */
  protected normalizeChain(chain: string): string {
    return chain.toLowerCase();
  }

  /**
   * Generate a unique route ID
   */
  protected generateRouteId(
    provider: BridgeProvider,
    sourceChain: string,
    targetChain: string,
    index: number,
  ): string {
    return `${provider}-${sourceChain}-${targetChain}-${index}-${Date.now()}`;
  }

  /**
   * Calculate fee percentage from input and output amounts
   */
  protected calculateFeePercentage(
    inputAmount: string,
    outputAmount: string,
  ): number {
    const input = BigInt(inputAmount);
    const output = BigInt(outputAmount);

    if (input === 0n) return 0;

    const fee = input - output;
    const feePercentage = Number((fee * 10000n) / input) / 100;

    return Math.max(0, Math.min(100, feePercentage));
  }
}
