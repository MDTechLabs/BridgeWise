"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeLiquidityMonitor = void 0;
exports.prioritizeRoutesByLiquidity = prioritizeRoutesByLiquidity;
const DEFAULT_STORAGE_KEY = 'bridgewise_liquidity_cache_v1';
const defaultProviders = [
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
function getStorage() {
    const globalWithWindow = globalThis;
    try {
        return globalWithWindow.window?.localStorage ?? globalWithWindow.localStorage ?? null;
    }
    catch {
        return null;
    }
}
function toStored(item) {
    return {
        ...item,
        timestamp: item.timestamp.toISOString(),
    };
}
function fromStored(item) {
    const timestamp = new Date(item.timestamp);
    return {
        ...item,
        timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    };
}
function normalize(item, query, bridgeName) {
    return {
        bridgeName: item.bridgeName ?? bridgeName,
        token: item.token ?? query.token,
        sourceChain: item.sourceChain ?? query.sourceChain,
        destinationChain: item.destinationChain ?? query.destinationChain,
        availableAmount: typeof item.availableAmount === 'number' && Number.isFinite(item.availableAmount)
            ? item.availableAmount
            : 0,
        timestamp: item.timestamp ?? new Date(),
    };
}
class BridgeLiquidityMonitor {
    constructor(config) {
        this.providers = config?.providers?.length ? config.providers : defaultProviders;
        this.storageKey = config?.storageKey ?? DEFAULT_STORAGE_KEY;
    }
    async getLiquidity(query) {
        const providers = query.bridgeName
            ? this.providers.filter((provider) => provider.name.toLowerCase() === query.bridgeName?.toLowerCase())
            : this.providers;
        const liquidity = [];
        const errors = [];
        for (const provider of providers) {
            try {
                const value = await provider.fetchLiquidity(query);
                liquidity.push(normalize(value, query, provider.name));
            }
            catch (error) {
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
    getFromCache(query) {
        const storage = getStorage();
        if (!storage) {
            return [];
        }
        try {
            const raw = storage.getItem(this.storageKey);
            if (!raw) {
                return [];
            }
            const all = JSON.parse(raw);
            const key = this.buildKey(query);
            const entries = all[key] ?? [];
            return entries.map((item) => fromStored(item));
        }
        catch {
            return [];
        }
    }
    saveToCache(query, liquidity) {
        const storage = getStorage();
        if (!storage) {
            return;
        }
        try {
            const raw = storage.getItem(this.storageKey);
            const all = raw ? JSON.parse(raw) : {};
            all[this.buildKey(query)] = liquidity.map((item) => toStored(item));
            storage.setItem(this.storageKey, JSON.stringify(all));
        }
        catch {
            // no-op
        }
    }
    buildKey(query) {
        return [query.token, query.sourceChain, query.destinationChain, query.bridgeName ?? '*']
            .map((value) => value.toLowerCase())
            .join(':');
    }
}
exports.BridgeLiquidityMonitor = BridgeLiquidityMonitor;
function prioritizeRoutesByLiquidity(routes, liquidity) {
    const byBridge = new Map();
    for (const item of liquidity) {
        byBridge.set(item.bridgeName.toLowerCase(), item.availableAmount);
    }
    return [...routes].sort((left, right) => {
        const leftLiquidity = byBridge.get(left.provider.toLowerCase()) ?? 0;
        const rightLiquidity = byBridge.get(right.provider.toLowerCase()) ?? 0;
        return rightLiquidity - leftLiquidity;
    });
}
//# sourceMappingURL=monitor.js.map