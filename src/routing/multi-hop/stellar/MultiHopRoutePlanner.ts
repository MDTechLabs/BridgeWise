```ts
/**
 * Stellar Multi-Hop Route Planner
 *
 * Standalone implementation for discovering and evaluating
 * multi-hop routes between Stellar assets.
 *
 * This file is intentionally self-contained and does not
 * modify or depend on existing application code.
 *
 * Supported:
 * - Intermediary asset discovery
 * - Multi-hop route construction
 * - Cumulative fee calculation
 * - Expected output calculation
 * - Cyclic route detection/rejection
 */

export interface StellarAsset {
  id: string;
  symbol: string;
}

export interface StellarBridgePath {
  from: string;
  to: string;
  fee: number;
  exchangeRate: number;
}

export interface StellarRoute {
  assets: string[];
  hops: number;
  totalFee: number;
  expectedOutput: number;
}

export interface RoutePlanningOptions {
  maxHops?: number;
}

export class MultiHopRoutePlanner {
  private readonly paths: StellarBridgePath[];
  private readonly maxHops: number;

  constructor(
    paths: StellarBridgePath[],
    options: RoutePlanningOptions = {},
  ) {
    this.paths = paths;
    this.maxHops = options.maxHops ?? 4;
  }

  /**
   * Find all valid routes between a source and destination asset.
   */
  findRoutes(
    sourceAsset: string,
    destinationAsset: string,
    amount: number,
  ): StellarRoute[] {
    if (amount <= 0) {
      throw new Error("Amount must be greater than zero.");
    }

    if (sourceAsset === destinationAsset) {
      return [];
    }

    const routes: StellarRoute[] = [];

    this.searchRoutes(
      sourceAsset,
      destinationAsset,
      amount,
      [sourceAsset],
      [],
      routes,
    );

    return routes;
  }

  /**
   * Recursively discover possible paths.
   */
  private searchRoutes(
    currentAsset: string,
    destinationAsset: string,
    currentAmount: number,
    visitedAssets: string[],
    routePaths: StellarBridgePath[],
    routes: StellarRoute[],
  ): void {
    if (routePaths.length >= this.maxHops) {
      return;
    }

    const nextPaths = this.getCompatiblePaths(currentAsset);

    for (const path of nextPaths) {
      /**
       * Reject cyclic routes.
       *
       * Example:
       * USDC -> XLM -> USDC
       *
       * USDC already exists in visitedAssets,
       * so this route is ignored.
       */
      if (visitedAssets.includes(path.to)) {
        continue;
      }

      const nextAmount = this.calculateOutput(
        currentAmount,
        path.exchangeRate,
        path.fee,
      );

      const nextVisitedAssets = [
        ...visitedAssets,
        path.to,
      ];

      const nextRoutePaths = [
        ...routePaths,
        path,
      ];

      if (path.to === destinationAsset) {
        routes.push(
          this.createRoute(
            nextVisitedAssets,
            nextRoutePaths,
            amountFromPaths(nextRoutePaths, amount),
          ),
        );

        continue;
      }

      this.searchRoutes(
        path.to,
        destinationAsset,
        nextAmount,
        nextVisitedAssets,
        nextRoutePaths,
        routes,
      );
    }
  }

  /**
   * Find bridge paths originating from an asset.
   */
  private getCompatiblePaths(
    asset: string,
  ): StellarBridgePath[] {
    return this.paths.filter(
      (path) => path.from === asset,
    );
  }

  /**
   * Calculate the output of a single hop.
   *
   * Formula:
   *
   * output = (input * exchangeRate) - fee
   */
  private calculateOutput(
    input: number,
    exchangeRate: number,
    fee: number,
  ): number {
    return input * exchangeRate - fee;
  }

  /**
   * Build the final route object.
   */
  private createRoute(
    assets: string[],
    paths: StellarBridgePath[],
    expectedOutput: number,
  ): StellarRoute {
    return {
      assets,
      hops: paths.length,
      totalFee: this.calculateTotalFees(paths),
      expectedOutput,
    };
  }

  /**
   * Calculate cumulative fees across all hops.
   */
  private calculateTotalFees(
    paths: StellarBridgePath[],
  ): number {
    return paths.reduce(
      (total, path) => total + path.fee,
      0,
    );
  }

  /**
   * Return the best route based on expected output.
   */
  findBestRoute(
    sourceAsset: string,
    destinationAsset: string,
    amount: number,
  ): StellarRoute | null {
    const routes = this.findRoutes(
      sourceAsset,
      destinationAsset,
      amount,
    );

    if (routes.length === 0) {
      return null;
    }

    return routes.reduce((best, current) =>
      current.expectedOutput > best.expectedOutput
        ? current
        : best,
    );
  }

  /**
   * Check whether a route contains a cycle.
   */
  hasCycle(assets: string[]): boolean {
    return new Set(assets).size !== assets.length;
  }

  /**
   * Discover intermediary assets that can connect
   * a source asset to a destination asset.
   */
  discoverIntermediaries(
    sourceAsset: string,
    destinationAsset: string,
  ): string[] {
    const intermediaries = new Set<string>();

    for (const path of this.paths) {
      if (
        path.from === sourceAsset &&
        path.to !== destinationAsset
      ) {
        const canReachDestination = this.paths.some(
          (nextPath) =>
            nextPath.from === path.to &&
            nextPath.to === destinationAsset,
        );

        if (canReachDestination) {
          intermediaries.add(path.to);
        }
      }
    }

    return [...intermediaries];
  }
}

/**
 * Calculate the final output after applying all bridge paths.
 */
function amountFromPaths(
  paths: StellarBridgePath[],
  initialAmount: number,
): number {
  return paths.reduce(
    (amount, path) =>
      amount * path.exchangeRate - path.fee,
    initialAmount,
  );
}

/*
 * --------------------------------------------------------------------------
 * Example
 * --------------------------------------------------------------------------
 *
 * The example below demonstrates how the standalone planner can be used.
 *
 * It is intentionally not executed automatically and does not modify
 * any existing application code.
 */


