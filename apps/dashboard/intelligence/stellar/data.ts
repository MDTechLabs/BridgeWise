/**
 * File: apps/dashboard/intelligence/stellar/data.ts
 *
 * Mock data sources for the Soroban Bridge Intelligence Dashboard.
 *
 * In production, the parent app would inject real-time data via the hook
 * (`useSorobanIntelligence`). For the standalone demo / Storybook, we
 * ship a deterministic mock so the dashboard renders consistently.
 */

import type { AssetMetric, ProviderMetric, RouteMetric } from './types';

function makeTrend(start: number, step: number, count: number, baseTime: number) {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: baseTime + index * 3_600_000,
    value: round(start + index * step),
  }));
}

const baseTime = Date.UTC(2026, 5, 20, 12, 0, 0);

export const DEFAULT_ROUTE_METRICS: RouteMetric[] = [
  {
    routeId: 'eth-xlm-usdc-allbridge',
    routeLabel: 'ETH ↔ XLM (USDC) via Allbridge',
    providerId: 'allbridge',
    totalVolumeUsd: 1_245_300,
    successRate: 0.978,
    averageLatencySeconds: 78,
    averageFeeUsd: 0.42,
    trend: makeTrend(78_200, 4_500, 8, baseTime),
  },
  {
    routeId: 'eth-xlm-usdc-squid',
    routeLabel: 'ETH ↔ XLM (USDC) via Squid',
    providerId: 'squid',
    totalVolumeUsd: 982_410,
    successRate: 0.961,
    averageLatencySeconds: 92,
    averageFeeUsd: 0.55,
    trend: makeTrend(63_400, 3_100, 8, baseTime),
  },
  {
    routeId: 'bsc-xlm-usdt-wormhole',
    routeLabel: 'BSC ↔ XLM (USDT) via Wormhole',
    providerId: 'wormhole',
    totalVolumeUsd: 712_880,
    successRate: 0.942,
    averageLatencySeconds: 118,
    averageFeeUsd: 0.61,
    trend: makeTrend(45_100, 2_900, 8, baseTime),
  },
];

export const DEFAULT_PROVIDER_METRICS: ProviderMetric[] = [
  {
    providerId: 'allbridge',
    providerName: 'Allbridge',
    supportedRoutes: 14,
    totalVolumeUsd: 4_210_000,
    reliabilityScore: 0.967,
    incidentCount: 1,
    trend: makeTrend(520_000, 14_000, 8, baseTime),
  },
  {
    providerId: 'squid',
    providerName: 'Squid',
    supportedRoutes: 11,
    totalVolumeUsd: 3_120_000,
    reliabilityScore: 0.948,
    incidentCount: 2,
    trend: makeTrend(390_000, 11_000, 8, baseTime),
  },
  {
    providerId: 'wormhole',
    providerName: 'Wormhole',
    supportedRoutes: 9,
    totalVolumeUsd: 1_980_000,
    reliabilityScore: 0.911,
    incidentCount: 4,
    trend: makeTrend(245_000, 8_000, 8, baseTime),
  },
];

export const DEFAULT_ASSET_METRICS: AssetMetric[] = [
  {
    asset: 'USDC',
    totalLiquidityUsd: 6_700_000,
    bridgesUsed: ['allbridge', 'squid'],
    averageBridgeFeeUsd: 0.45,
    trend: makeTrend(820_000, 18_000, 8, baseTime),
  },
  {
    asset: 'USDT',
    totalLiquidityUsd: 2_140_000,
    bridgesUsed: ['wormhole'],
    averageBridgeFeeUsd: 0.62,
    trend: makeTrend(265_000, 4_500, 8, baseTime),
  },
  {
    asset: 'XLM',
    totalLiquidityUsd: 980_000,
    bridgesUsed: ['allbridge', 'squid', 'wormhole'],
    averageBridgeFeeUsd: 0.18,
    trend: makeTrend(120_000, 2_000, 8, baseTime),
  },
];

function round(value: number) {
  return Math.round(value * 100) / 100;
}
