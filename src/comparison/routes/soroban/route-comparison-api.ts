export interface RouteOption {
  routeId: string;
  provider: string;
  sourceChain: string;
  destChain: string;
  asset: string;
  feeUsd: number;
  estimatedLatencyMs: number;
  reliability: number;
}

export interface ComparisonResult {
  routes: RouteOption[];
  bestFee: RouteOption;
  bestLatency: RouteOption;
  bestReliability: RouteOption;
}

function findBest(routes: RouteOption[], key: keyof RouteOption, asc: boolean): RouteOption {
  return routes.reduce((best, r) => {
    const a = r[key] as number;
    const b = best[key] as number;
    return asc ? (a < b ? r : best) : (a > b ? r : best);
  }, routes[0]);
}

export function compareRoutes(routes: RouteOption[]): ComparisonResult {
  if (routes.length === 0) throw new Error('No routes to compare');
  return {
    routes,
    bestFee: findBest(routes, 'feeUsd', true),
    bestLatency: findBest(routes, 'estimatedLatencyMs', true),
    bestReliability: findBest(routes, 'reliability', false),
  };
}

export function filterByAsset(routes: RouteOption[], asset: string): RouteOption[] {
  return routes.filter(r => r.asset === asset);
}
