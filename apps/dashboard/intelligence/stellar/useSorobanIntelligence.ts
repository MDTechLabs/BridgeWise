/**
 * File: apps/dashboard/intelligence/stellar/useSorobanIntelligence.ts
 *
 * Data hook for the Soroban Bridge Intelligence Dashboard.
 *
 * Consumer pages call `useSorobanIntelligence()` to receive a
 * deterministic snapshot of the route / provider / asset metrics plus
 * derived totals. The hook is mock-friendly: callers can pass a fetcher
 * that will eventually hit the API, while the default falls back to the
 * deterministic mock data in `./data`.
 */

import { useMemo } from 'react';

import {
  DEFAULT_ASSET_METRICS,
  DEFAULT_PROVIDER_METRICS,
  DEFAULT_ROUTE_METRICS,
} from './data';
import {
  computeNetworkHealth,
  reliabilityTier,
  sumVolume,
} from './metrics';
import type {
  AssetMetric,
  ProviderMetric,
  RouteMetric,
} from './types';

export interface SorobanIntelligenceInput {
  routes?: RouteMetric[];
  providers?: ProviderMetric[];
  assets?: AssetMetric[];
}

export interface SorobanIntelligenceSnapshot {
  routes: RouteMetric[];
  providers: ProviderMetric[];
  assets: AssetMetric[];
  derived: {
    totalVolumeUsd: number;
    averageSuccessRate: number;
    averageReliability: number;
    averageLatencySeconds: number;
    networkHealth: number;
    reliabilityTiers: Record<string, 'excellent' | 'good' | 'fair' | 'poor'>;
  };
}

const EMPTY_DERIVED: SorobanIntelligenceSnapshot['derived'] = {
  totalVolumeUsd: 0,
  averageSuccessRate: 0,
  averageReliability: 0,
  averageLatencySeconds: 0,
  networkHealth: 0,
  reliabilityTiers: {},
};

/**
 * Returns a fully-typed snapshot for the dashboard. Pure / memoised so
 * re-renders stay cheap when used inside a `React.memo` parent.
 */
export function useSorobanIntelligence(
  input: SorobanIntelligenceInput = {},
): SorobanIntelligenceSnapshot {
  return useMemo(() => {
    const routes = input.routes ?? DEFAULT_ROUTE_METRICS;
    const providers = input.providers ?? DEFAULT_PROVIDER_METRICS;
    const assets = input.assets ?? DEFAULT_ASSET_METRICS;

    const totalVolumeUsd =
      sumVolume(routes) + sumVolume(providers) + sumVolume(assets);

    const averageSuccessRate = average(routes.map((r) => r.successRate));
    const averageReliability = average(
      providers.map((p) => p.reliabilityScore),
    );
    const averageLatencySeconds = average(
      routes.map((r) => r.averageLatencySeconds),
    );

    const networkHealth = computeNetworkHealth({
      averageSuccessRate,
      averageReliability,
      averageLatencySeconds,
    });

    const reliabilityTiers = providers.reduce<
      Record<string, 'excellent' | 'good' | 'fair' | 'poor'>
    >((acc, provider) => {
      acc[provider.providerId] = reliabilityTier(provider.reliabilityScore);
      return acc;
    }, {});

    const derived = {
      totalVolumeUsd,
      averageSuccessRate,
      averageReliability,
      averageLatencySeconds,
      networkHealth,
      reliabilityTiers,
    };

    return { routes, providers, assets, derived };
  }, [
    input.routes,
    input.providers,
    input.assets,
  ]);
}

export const EMPTY_SNAPSHOT: SorobanIntelligenceSnapshot = {
  routes: [],
  providers: [],
  assets: [],
  derived: EMPTY_DERIVED,
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + (value || 0), 0);
  return total / values.length;
}
