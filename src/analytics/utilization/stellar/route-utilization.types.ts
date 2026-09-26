/**
 * Types for Stellar Route Utilization Analytics
 * @see Issue #510 — Implement Stellar Route Utilization Analytics
 */

export interface RouteUsageEntry {
  routeId: string;
  usageCount: number;
  firstUsed: number;
  lastUsed: number;
  totalVolumeUsd: number;
}

export interface RouteUtilizationMetrics extends RouteUsageEntry {
  /** Average uses per day since first recorded usage */
  avgDailyUsage: number;
}

export interface UtilizationReport {
  generatedAt: number;
  totalRoutes: number;
  totalUsageCount: number;
  /** Routes sorted by usageCount descending */
  metrics: RouteUtilizationMetrics[];
}

export interface TrackUsageOptions {
  /** USD-denominated volume for this single usage event. Default 0. */
  volumeUsd?: number;
}

export interface RouteUtilizationConfig {
  /** Injected clock for deterministic testing. Defaults to Date.now. */
  now?: () => number;
}
