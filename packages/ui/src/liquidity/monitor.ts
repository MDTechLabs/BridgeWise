import type { BridgeRoute } from '../../../bridge-core/src/types';
import type {
  BridgeLiquidity,
  BridgeLiquidityMonitorConfig,
  BridgeLiquidityProvider,
  BridgeLiquidityQuery,
  LiquidityProviderError,
} from './types';

const DEFAULT_STORAGE_KEY = 'bridgewise_liquidity_cache_v1';

type StoredLiquidity = Omit<BridgeLiquidity, 'timestamp'> & { timestamp: string };

const defaultProviders: BridgeLiquidityProvider[] = [
  {
    name: 'hop',
    fetchLiquidity: async (query) => ({
      bridgeName: 'hop',
      token: query.token,
      sourceChain: query.sourceChain,
      destinationChain: query.destinationChain,
      availableAmount: 75000,
      timestamp: new Date(),
    }),
  },
  {
    name: 'layerzero',
    fetchLiquidity: async (query) => ({
      bridgeName: 'layerzero',
      token: query.token,
      sourceChain: query.sourceChain,
      destinationChain: query.destinationChain,
      availableAmount: 100000,
      timestamp: new Date(),
    }),
  },
  {
    name: 'stellar',
    fetchLiquidity: async (query) => ({
      bridgeName: 'stellar',
      token: query.token,
      sourceChain: query.sourceChain,
      destinationChain: query.destinationChain,
      availableAmount: 50000,
      timestamp: new Date(),
    }),
  },
];

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function getStorage(): StorageLike | null {
  const globalWithWindow = globalThis as {
    window?: { localStorage?: StorageLike };
    localStorage?: StorageLike;
  };

  try {
    return globalWithWindow.window?.localStorage ?? globalWithWindow.localStorage ?? null;
  } catch {
    return null;
  }
}

function toStored(item: BridgeLiquidity): StoredLiquidity {
  return {
    ...item,
    timestamp: item.timestamp.toISOString(),
  };
}

function fromStored(item: StoredLiquidity): BridgeLiquidity {
  const timestamp = new Date(item.timestamp);
  return {
    ...item,
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
  };
}

function normalize(item: Partial<BridgeLiquidity>, query: BridgeLiquidityQuery, bridgeName: string): BridgeLiquidity {
  return {
    bridgeName: item.bridgeName ?? bridgeName,
    token: item.token ?? query.token,
    sourceChain: item.sourceChain ?? query.sourceChain,
    destinationChain: item.destinationChain ?? query.destinationChain,
    availableAmount:
      typeof item.availableAmount === 'number' && Number.isFinite(item.availableAmount)
        ? item.availableAmount
        : 0,
    timestamp: item.timestamp ?? new Date(),
  };
}

export class BridgeLiquidityMonitor {
  private readonly providers: BridgeLiquidityProvider[];

  private readonly storageKey: string;

  constructor(config?: BridgeLiquidityMonitorConfig) {
    this.providers = config?.providers?.length ? config.providers : defaultProviders;
    this.storageKey = config?.storageKey ?? DEFAULT_STORAGE_KEY;
  }

  async getLiquidity(query: BridgeLiquidityQuery): Promise<{
    liquidity: BridgeLiquidity[];
    errors: LiquidityProviderError[];
    usedFallback: boolean;
  }> {
    const providers = query.bridgeName
      ? this.providers.filter((provider) => provider.name.toLowerCase() === query.bridgeName?.toLowerCase())
      : this.providers;

    const liquidity: BridgeLiquidity[] = [];
    const errors: LiquidityProviderError[] = [];

    for (const provider of providers) {
      try {
        const value = await provider.fetchLiquidity(query);
        liquidity.push(normalize(value, query, provider.name));
      } catch (error) {
        errors.push({
          bridgeName: provider.name,
          message: error instanceof Error ? error.message : 'Failed to fetch liquidity',
        });
      }
    }

    if (liquidity.length > 0) {
      this.saveToCache(query, liquidity);
      return { liquidity, errors, usedFallback: false };
    }

    const fallback = this.getFromCache(query);
    return {
      liquidity: fallback,
      errors,
      usedFallback: fallback.length > 0,
    };
  }

  private getFromCache(query: BridgeLiquidityQuery): BridgeLiquidity[] {
    const storage = getStorage();
    if (!storage) {
      return [];
    }

    try {
      const raw = storage.getItem(this.storageKey);
      if (!raw) {
        return [];
      }

      const all = JSON.parse(raw) as Record<string, StoredLiquidity[]>;
      const key = this.buildKey(query);
      const entries = all[key] ?? [];
      return entries.map((item) => fromStored(item));
    } catch {
      return [];
    }
  }

  private saveToCache(query: BridgeLiquidityQuery, liquidity: BridgeLiquidity[]): void {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    try {
      const raw = storage.getItem(this.storageKey);
      const all = raw ? (JSON.parse(raw) as Record<string, StoredLiquidity[]>) : {};
      all[this.buildKey(query)] = liquidity.map((item) => toStored(item));
      storage.setItem(this.storageKey, JSON.stringify(all));
    } catch {
      // no-op
    }
  }

  private buildKey(query: BridgeLiquidityQuery): string {
    return [query.token, query.sourceChain, query.destinationChain, query.bridgeName ?? '*']
      .map((value) => value.toLowerCase())
      .join(':');
  }
}

export function prioritizeRoutesByLiquidity(
  routes: BridgeRoute[],
  liquidity: BridgeLiquidity[],
): BridgeRoute[] {
  const byBridge = new Map<string, number>();
  for (const item of liquidity) {
    byBridge.set(item.bridgeName.toLowerCase(), item.availableAmount);
  }

  return [...routes].sort((left, right) => {
    const leftLiquidity = byBridge.get(left.provider.toLowerCase()) ?? 0;
    const rightLiquidity = byBridge.get(right.provider.toLowerCase()) ?? 0;
    return rightLiquidity - leftLiquidity;
  });
}
