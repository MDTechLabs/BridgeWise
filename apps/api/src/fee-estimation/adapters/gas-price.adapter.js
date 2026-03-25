"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GasPriceAdapter = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
/**
 * Gas Price Adapter
 *
 * Fetches real-time gas prices for EVM chains from various sources.
 * Supports fallback to static estimates when dynamic fetching fails.
 */
let GasPriceAdapter = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var GasPriceAdapter = _classThis = class {
        constructor(httpService) {
            this.httpService = httpService;
            this.logger = new common_1.Logger(GasPriceAdapter.name);
            this.cache = new Map();
            this.CACHE_TTL_MS = 30000; // 30 seconds
            // Fallback gas prices by chain (in Gwei)
            this.fallbackPrices = {
                ethereum: 30,
                polygon: 100,
                arbitrum: 0.5,
                optimism: 0.001,
                base: 0.1,
                bsc: 5,
                avalanche: 25,
                fantom: 35,
                gnosis: 3,
                scroll: 0.5,
                linea: 0.5,
                zksync: 0.25,
                zkevm: 0.5,
            };
            // Recommended gas limits by operation type
            this.gasLimits = {
                bridgeTransfer: 200000,
                tokenApproval: 65000,
                swap: 150000,
                wrap: 50000,
            };
        }
        /**
         * Get gas price for a chain
         */
        async getGasPrice(chain) {
            const normalizedChain = chain.toLowerCase();
            // Check cache
            const cached = this.cache.get(normalizedChain);
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
                return cached.data;
            }
            try {
                const gasPrice = await this.fetchGasPrice(normalizedChain);
                const congestion = await this.fetchNetworkCongestion(normalizedChain);
                const info = {
                    chain: normalizedChain,
                    gasPriceGwei: gasPrice,
                    congestionLevel: congestion,
                    recommendedGasLimit: this.gasLimits.bridgeTransfer,
                    lastUpdated: new Date(),
                    expiresAt: new Date(Date.now() + this.CACHE_TTL_MS),
                };
                // Cache the result
                this.cache.set(normalizedChain, { data: info, timestamp: Date.now() });
                return info;
            }
            catch (error) {
                this.logger.warn(`Failed to fetch gas price for ${chain}: ${error.message}`);
                return this.getFallbackGasPrice(normalizedChain);
            }
        }
        /**
         * Get network congestion status
         */
        async getNetworkCongestion(chain) {
            const normalizedChain = chain.toLowerCase();
            try {
                const gasPrice = await this.getGasPrice(normalizedChain);
                // Determine congestion status based on gas price
                const basePrice = this.fallbackPrices[normalizedChain] || 10;
                const ratio = gasPrice.gasPriceGwei / basePrice;
                let status;
                if (ratio < 0.5)
                    status = 'low';
                else if (ratio < 1.5)
                    status = 'moderate';
                else if (ratio < 3)
                    status = 'high';
                else
                    status = 'severe';
                return {
                    chain: normalizedChain,
                    congestionLevel: gasPrice.congestionLevel || 50,
                    status,
                    averageGasPriceGwei: gasPrice.gasPriceGwei,
                    pendingTransactions: 0, // Would need additional API
                    averageBlockTimeSeconds: this.getAverageBlockTime(normalizedChain),
                    lastUpdated: new Date(),
                };
            }
            catch (error) {
                this.logger.warn(`Failed to get congestion for ${chain}: ${error.message}`);
                return {
                    chain: normalizedChain,
                    congestionLevel: 50,
                    status: 'moderate',
                    averageGasPriceGwei: this.fallbackPrices[normalizedChain] || 10,
                    pendingTransactions: 0,
                    averageBlockTimeSeconds: this.getAverageBlockTime(normalizedChain),
                    lastUpdated: new Date(),
                };
            }
        }
        /**
         * Calculate gas fee for a transaction
         */
        calculateGasFee(chain, gasPriceGwei, gasLimit = this.gasLimits.bridgeTransfer) {
            // Convert Gwei to native token units
            const gasFeeNative = (gasPriceGwei * gasLimit) / 1e9;
            return gasFeeNative;
        }
        /**
         * Fetch gas price from various sources
         */
        async fetchGasPrice(chain) {
            // Try multiple sources in order
            const sources = [
                () => this.fetchFromEtherscan(chain),
                () => this.fetchFromBlockNative(chain),
                () => this.fetchFromPublicRPC(chain),
            ];
            for (const source of sources) {
                try {
                    const price = await source();
                    if (price > 0)
                        return price;
                }
                catch (error) {
                    this.logger.debug(`Source failed for ${chain}: ${error.message}`);
                }
            }
            throw new Error(`All gas price sources failed for ${chain}`);
        }
        /**
         * Fetch from Etherscan-like explorers
         */
        async fetchFromEtherscan(chain) {
            const apiUrls = {
                ethereum: `https://api.etherscan.io/api?module=gastracker&action=gasoracle`,
                polygon: `https://api.polygonscan.com/api?module=gastracker&action=gasoracle`,
                bsc: `https://api.bscscan.com/api?module=gastracker&action=gasoracle`,
                arbitrum: `https://api.arbiscan.io/api?module=gastracker&action=gasoracle`,
                optimism: `https://api-optimistic.etherscan.io/api?module=gastracker&action=gasoracle`,
                base: `https://api.basescan.org/api?module=gastracker&action=gasoracle`,
                avalanche: `https://api.snowtrace.io/api?module=gastracker&action=gasoracle`,
            };
            const apiUrl = apiUrls[chain];
            if (!apiUrl)
                throw new Error(`No Etherscan API for ${chain}`);
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(apiUrl, { timeout: 5000 }));
            if (response.data.status === '1' && response.data.result) {
                // Use ProposeGasPrice (medium priority)
                return parseFloat(response.data.result.ProposeGasPrice);
            }
            throw new Error('Invalid response from Etherscan');
        }
        /**
         * Fetch from BlockNative
         */
        async fetchFromBlockNative(chain) {
            const chainMapping = {
                ethereum: 'main',
                polygon: 'matic-main',
                bsc: 'bsc-main',
                arbitrum: 'arbitrum-main',
                optimism: 'optimism-main',
                base: 'base-main',
            };
            const blockNativeChain = chainMapping[chain];
            if (!blockNativeChain)
                throw new Error(`No BlockNative mapping for ${chain}`);
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`https://api.blocknative.com/gasprices/blockprices?chainid=${this.getChainId(chain)}`, { timeout: 5000 }));
            if (response.data.blockPrices && response.data.blockPrices[0]) {
                return response.data.blockPrices[0].estimatedPrices[1].price; // Medium priority
            }
            throw new Error('Invalid response from BlockNative');
        }
        /**
         * Fetch from public RPC (fallback)
         */
        async fetchFromPublicRPC(chain) {
            const rpcUrls = {
                ethereum: 'https://eth.llamarpc.com',
                polygon: 'https://polygon.llamarpc.com',
                arbitrum: 'https://arbitrum.llamarpc.com',
                optimism: 'https://optimism.llamarpc.com',
                base: 'https://base.llamarpc.com',
                bsc: 'https://binance.llamarpc.com',
                avalanche: 'https://avalanche.llamarpc.com',
            };
            const rpcUrl = rpcUrls[chain];
            if (!rpcUrl)
                throw new Error(`No RPC URL for ${chain}`);
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(rpcUrl, {
                jsonrpc: '2.0',
                method: 'eth_gasPrice',
                params: [],
                id: 1,
            }, { timeout: 5000 }));
            if (response.data.result) {
                const wei = parseInt(response.data.result, 16);
                return wei / 1e9; // Convert to Gwei
            }
            throw new Error('Invalid RPC response');
        }
        /**
         * Fetch network congestion level
         */
        async fetchNetworkCongestion(chain) {
            try {
                // Use pending transaction count as a proxy for congestion
                const rpcUrls = {
                    ethereum: 'https://eth.llamarpc.com',
                    polygon: 'https://polygon.llamarpc.com',
                };
                const rpcUrl = rpcUrls[chain];
                if (!rpcUrl)
                    return 50; // Default moderate congestion
                // This is a simplified check - real implementation would analyze more metrics
                return 50;
            }
            catch {
                return 50;
            }
        }
        /**
         * Get fallback gas price
         */
        getFallbackGasPrice(chain) {
            const fallbackPrice = this.fallbackPrices[chain] || 10;
            return {
                chain,
                gasPriceGwei: fallbackPrice,
                congestionLevel: 50,
                recommendedGasLimit: this.gasLimits.bridgeTransfer,
                lastUpdated: new Date(),
                expiresAt: new Date(Date.now() + 60000), // 1 minute expiry for fallback
            };
        }
        /**
         * Get chain ID
         */
        getChainId(chain) {
            const chainIds = {
                ethereum: 1,
                polygon: 137,
                arbitrum: 42161,
                optimism: 10,
                base: 8453,
                bsc: 56,
                avalanche: 43114,
                fantom: 250,
                gnosis: 100,
            };
            return chainIds[chain] || 1;
        }
        /**
         * Get average block time
         */
        getAverageBlockTime(chain) {
            const blockTimes = {
                ethereum: 12,
                polygon: 2.3,
                arbitrum: 0.25,
                optimism: 2,
                base: 2,
                bsc: 3,
                avalanche: 2,
                fantom: 1,
                gnosis: 5,
            };
            return blockTimes[chain] || 12;
        }
        /**
         * Clear cache
         */
        clearCache() {
            this.cache.clear();
        }
    };
    __setFunctionName(_classThis, "GasPriceAdapter");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        GasPriceAdapter = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return GasPriceAdapter = _classThis;
})();
exports.GasPriceAdapter = GasPriceAdapter;
//# sourceMappingURL=gas-price.adapter.js.map