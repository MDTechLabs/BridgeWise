/**
 * File: apps/dashboard/intelligence/stellar/index.ts
 *
 * Module barrel for the Soroban Bridge Intelligence Dashboard.
 *
 * Consumers (e.g. Next.js pages) can import the public surface from a
 * single path:
 *
 *   import {
 *     SorobanBridgeIntelligenceDashboard,
 *     useSorobanIntelligence,
 *   } from '@bridgewise/dashboard/intelligence/stellar';
 */

export { SorobanBridgeIntelligenceDashboard } from './SorobanBridgeIntelligenceDashboard';
export { default } from './SorobanBridgeIntelligenceDashboard';
export { useSorobanIntelligence, EMPTY_SNAPSHOT } from './useSorobanIntelligence';
export {
  computeNetworkHealth,
  percentageChange,
  reliabilityTier,
  round,
  sumVolume,
  trendDirection,
} from './metrics';
export {
  DEFAULT_ASSET_METRICS,
  DEFAULT_PROVIDER_METRICS,
  DEFAULT_ROUTE_METRICS,
} from './data';

export type {
  AssetMetric,
  DashboardDrillDownContext,
  DrillDownResolver,
  DrillDownTarget,
  MetricTrend,
  ProviderMetric,
  RouteMetric,
  TrendPoint,
} from './types';

export type {
  SorobanIntelligenceInput,
  SorobanIntelligenceSnapshot,
} from './useSorobanIntelligence';

export type { SorobanBridgeIntelligenceDashboardProps } from './SorobanBridgeIntelligenceDashboard';
