/**
 * Stellar Ecosystem Metrics Types
 *
 * Defines the data structures for Stellar/Soroban ecosystem-wide metrics.
 */

/**
 * Transfer metrics for a specific token or all tokens
 */
export interface StellarTransferMetrics {
  totalTransfers: number;
  totalVolume: number;
  successfulTransfers: number;
  failedTransfers: number;
  successRate: number;
  averageSettlementTimeMs: number | null;
  averageFee: number | null;
  averageSlippagePercent: number | null;
}

/**
 * Provider metrics for a specific bridge provider
 */
export interface StellarProviderMetrics {
  providerName: string;
  totalTransfers: number;
  totalVolume: number;
  successfulTransfers: number;
  failedTransfers: number;
  successRate: number;
  averageSettlementTimeMs: number | null;
  averageFee: number | null;
  routeCount: number;
}

/**
 * Ecosystem summary that combines all metrics
 */
export interface StellarEcosystemSummary {
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  overall: StellarTransferMetrics;
  topProviders: StellarProviderMetrics[];
  topTokens: Array<{
    token: string;
    totalTransfers: number;
    totalVolume: number;
  }>;
  activeRoutes: number;
  uniqueTokens: number;
}
