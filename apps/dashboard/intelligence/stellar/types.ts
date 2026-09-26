/**
 * File: apps/dashboard/intelligence/stellar/types.ts
 *
 * Shared type definitions for the Soroban Bridge Intelligence Dashboard.
 *
 * The dashboard is intentionally typed so consumers (graphs, exports, CLI
 * tooling) can pull a single, stable shape out of the data layer. Any new
 * metric we want to visualize must be added here first.
 */

export type MetricTrend = 'up' | 'down' | 'flat';

export interface TrendPoint {
  /** ISO timestamp or epoch ms – the dashboard normalizes for display. */
  timestamp: number;
  /** Numeric value for the metric at this point in time. */
  value: number;
}

export interface RouteMetric {
  routeId: string;
  routeLabel: string;
  providerId: string;
  totalVolumeUsd: number;
  successRate: number;
  averageLatencySeconds: number;
  averageFeeUsd: number;
  trend: TrendPoint[];
}

export interface ProviderMetric {
  providerId: string;
  providerName: string;
  supportedRoutes: number;
  totalVolumeUsd: number;
  reliabilityScore: number;
  /** Aggregated historical incidents reported against this provider. */
  incidentCount: number;
  trend: TrendPoint[];
}

export interface AssetMetric {
  asset: string;
  totalLiquidityUsd: number;
  bridgesUsed: string[];
  averageBridgeFeeUsd: number;
  trend: TrendPoint[];
}

export interface DrillDownTarget {
  kind: 'route' | 'provider' | 'asset';
  id: string;
}

export type DrillDownResolver = (target: DrillDownTarget) => void;

export interface DashboardDrillDownContext {
  onDrillDown: DrillDownResolver;
  selected: DrillDownTarget | null;
}
