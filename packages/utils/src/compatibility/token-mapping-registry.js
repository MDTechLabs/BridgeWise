"use strict";
/**
 * Token Mapping Registry
 *
 * Centralized registry for token mappings across chains and bridges.
 * Handles wrapped token equivalents and prevents duplicate representations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenMappingRegistry = void 0;
/**
 * Token Mapping Registry
 *
 * Provides centralized token mapping management with support for:
 * - Cross-chain token mappings
 * - Wrapped token equivalents
 * - Duplicate prevention
 * - Fast lookups
 */
class TokenMappingRegistry {
    constructor() {
        /**
         * Token metadata storage: Map<chain, Map<address, metadata>>
         */
        this.tokens = new Map();
        /**
         * Symbol index: Map<symbol, Map<chain, address>>
         */
        this.symbolIndex = new Map();
        /**
         * Token mappings: Map<"sourceChain:destChain:provider", TokenMappingEntry[]>
         */
        this.mappings = new Map();
        /**
         * Wrapped token mappings: Map<chain, Map<original, wrapped>>
         */
        this.wrappedTokens = new Map();
        /**
         * Supported tokens per bridge: Map<bridge, Map<chain, Set<token>>>
         */
        this.bridgeSupportedTokens = new Map();
    }
    /**
     * Register a token for a specific chain
     */
    async registerToken(chain, address, metadata) {
        // Get or create chain map
        if (!this.tokens.has(chain)) {
            this.tokens.set(chain, new Map());
        }
        const chainTokens = this.tokens.get(chain);
        // Normalize address for EVM chains
        const normalizedAddress = this.normalizeAddress(address, chain);
        // Store token metadata
        chainTokens.set(normalizedAddress, metadata);
        // Update symbol index
        const symbolLower = metadata.symbol.toLowerCase();
        if (!this.symbolIndex.has(symbolLower)) {
            this.symbolIndex.set(symbolLower, new Map());
        }
        this.symbolIndex.get(symbolLower).set(chain, normalizedAddress);
        // Update bridge supported tokens
        for (const bridge of metadata.supportedBridges) {
            this.addBridgeSupportedToken(bridge, chain, normalizedAddress);
            this.addBridgeSupportedToken(bridge, chain, metadata.symbol.toLowerCase());
        }
    }
    /**
     * Register multiple tokens in batch
     */
    async registerTokensBatch(tokens) {
        await Promise.all(tokens.map(({ chain, address, metadata }) => this.registerToken(chain, address, metadata)));
    }
    /**
     * Register a token mapping between chains
     */
    async registerMapping(sourceChain, destinationChain, sourceToken, destinationToken, provider, config) {
        const key = this.getMappingKey(sourceChain, destinationChain, provider);
        if (!this.mappings.has(key)) {
            this.mappings.set(key, []);
        }
        const mappings = this.mappings.get(key);
        // Check for existing mapping
        const existingIndex = mappings.findIndex((m) => this.normalizeAddress(m.sourceToken, sourceChain) ===
            this.normalizeAddress(sourceToken, sourceChain) &&
            this.normalizeAddress(m.destinationToken, destinationChain) ===
                this.normalizeAddress(destinationToken, destinationChain));
        const entry = {
            sourceChain,
            destinationChain,
            sourceToken,
            destinationToken,
            provider,
            isActive: true,
            minAmount: config.minAmount,
            maxAmount: config.maxAmount,
            conversionRate: config.conversionRate,
            bridgeTokenId: config.bridgeTokenId,
        };
        if (existingIndex >= 0) {
            mappings[existingIndex] = entry;
        }
        else {
            mappings.push(entry);
        }
    }
    /**
     * Register a wrapped token mapping
     */
    async registerWrappedToken(chain, originalToken, wrappedToken, wrapperProvider) {
        if (!this.wrappedTokens.has(chain)) {
            this.wrappedTokens.set(chain, new Map());
        }
        const chainWrapped = this.wrappedTokens.get(chain);
        chainWrapped.set(originalToken.toLowerCase(), {
            originalToken: originalToken.toLowerCase(),
            wrappedToken: wrappedToken.toLowerCase(),
            chain,
            wrapperProvider,
            isActive: true,
        });
    }
    /**
     * Get token metadata
     */
    async getToken(chain, tokenAddress) {
        const chainTokens = this.tokens.get(chain);
        if (!chainTokens)
            return null;
        const normalizedAddress = this.normalizeAddress(tokenAddress, chain);
        // Try direct address lookup
        let metadata = chainTokens.get(normalizedAddress);
        // Try symbol lookup if address not found
        if (!metadata) {
            const symbolLower = tokenAddress.toLowerCase();
            const symbolChains = this.symbolIndex.get(symbolLower);
            if (symbolChains) {
                const address = symbolChains.get(chain);
                if (address) {
                    metadata = chainTokens.get(address);
                }
            }
        }
        if (!metadata)
            return null;
        return {
            original: tokenAddress,
            normalizedAddress,
            symbol: metadata.symbol,
            decimals: metadata.decimals,
            chain,
            isWrapped: metadata.isWrapped,
            underlyingToken: metadata.underlyingSymbol,
        };
    }
    /**
     * Get token mapping for a bridge route
     */
    async getMapping(sourceChain, destinationChain, sourceToken, provider) {
        const normalizedSource = this.normalizeAddress(sourceToken, sourceChain);
        if (provider) {
            const key = this.getMappingKey(sourceChain, destinationChain, provider);
            const mappings = this.mappings.get(key) || [];
            const mapping = mappings.find((m) => this.normalizeAddress(m.sourceToken, sourceChain) ===
                normalizedSource && m.isActive);
            if (mapping) {
                const sourceTokenData = await this.getToken(sourceChain, mapping.sourceToken);
                const destTokenData = await this.getToken(destinationChain, mapping.destinationToken);
                if (sourceTokenData && destTokenData) {
                    return {
                        sourceToken: sourceTokenData,
                        destinationToken: destTokenData,
                        minAmount: mapping.minAmount,
                        maxAmount: mapping.maxAmount,
                        conversionRate: mapping.conversionRate,
                        isActive: mapping.isActive,
                        bridgeTokenId: mapping.bridgeTokenId,
                    };
                }
            }
        }
        else {
            // Search all providers
            const providers = ['hop', 'layerzero', 'stellar'];
            for (const p of providers) {
                const result = await this.getMapping(sourceChain, destinationChain, sourceToken, p);
                if (result)
                    return result;
            }
        }
        return null;
    }
    /**
     * Check if a token pair is bridgeable
     */
    async isBridgeable(sourceChain, destinationChain, sourceToken, provider) {
        const mapping = await this.getMapping(sourceChain, destinationChain, sourceToken, provider);
        return mapping !== null && mapping.isActive;
    }
    /**
     * Get wrapped token mapping
     */
    async getWrappedToken(chain, originalToken) {
        const chainWrapped = this.wrappedTokens.get(chain);
        if (!chainWrapped)
            return null;
        return chainWrapped.get(originalToken.toLowerCase()) || null;
    }
    /**
     * Get supported tokens for a bridge on a specific chain
     */
    async getSupportedTokensForBridge(chain, destinationChain, provider) {
        const key = this.getMappingKey(chain, destinationChain, provider);
        const mappings = this.mappings.get(key) || [];
        const tokens = new Set();
        mappings
            .filter((m) => m.isActive)
            .forEach((m) => {
            tokens.add(m.sourceToken);
        });
        return Array.from(tokens);
    }
    /**
     * Get all supported tokens on a chain
     */
    async getTokensOnChain(chain) {
        const chainTokens = this.tokens.get(chain);
        if (!chainTokens)
            return [];
        const tokens = [];
        for (const [address, metadata] of chainTokens) {
            tokens.push({
                original: address,
                normalizedAddress: address,
                symbol: metadata.symbol,
                decimals: metadata.decimals,
                chain,
                isWrapped: metadata.isWrapped,
                underlyingToken: metadata.underlyingSymbol,
            });
        }
        return tokens;
    }
    /**
     * Resolve token symbol to addresses across chains
     */
    async resolveTokenSymbol(symbol, chains) {
        const result = {};
        const symbolLower = symbol.toLowerCase();
        const symbolChains = this.symbolIndex.get(symbolLower);
        if (!symbolChains)
            return result;
        const targetChains = chains || Array.from(symbolChains.keys());
        for (const chain of targetChains) {
            const address = symbolChains.get(chain);
            if (address) {
                result[chain] = address;
            }
        }
        return result;
    }
    /**
     * Update mapping status
     */
    async updateMappingStatus(sourceChain, destinationChain, sourceToken, provider, isActive) {
        const key = this.getMappingKey(sourceChain, destinationChain, provider);
        const mappings = this.mappings.get(key);
        if (!mappings)
            return;
        const normalizedSource = this.normalizeAddress(sourceToken, sourceChain);
        const mapping = mappings.find((m) => this.normalizeAddress(m.sourceToken, sourceChain) === normalizedSource);
        if (mapping) {
            mapping.isActive = isActive;
        }
    }
    /**
     * Get all mappings for a bridge
     */
    async getMappingsForBridge(sourceChain, destinationChain, provider) {
        const key = this.getMappingKey(sourceChain, destinationChain, provider);
        return this.mappings.get(key) || [];
    }
    /**
     * Check if token is supported by a bridge
     */
    async isTokenSupportedByBridge(chain, token, provider) {
        const bridgeTokens = this.bridgeSupportedTokens.get(provider);
        if (!bridgeTokens)
            return false;
        const chainTokens = bridgeTokens.get(chain);
        if (!chainTokens)
            return false;
        const normalizedToken = this.normalizeAddress(token, chain);
        return (chainTokens.has(normalizedToken) || chainTokens.has(token.toLowerCase()));
    }
    /**
     * Get registry statistics
     */
    getStats() {
        let totalTokens = 0;
        for (const chainTokens of this.tokens.values()) {
            totalTokens += chainTokens.size;
        }
        let mappingsRegistered = 0;
        for (const bridgeMappings of this.mappings.values()) {
            mappingsRegistered += bridgeMappings.length;
        }
        let wrappedTokensRegistered = 0;
        for (const chainWrapped of this.wrappedTokens.values()) {
            wrappedTokensRegistered += chainWrapped.size;
        }
        return {
            totalTokens,
            chainsRegistered: this.tokens.size,
            mappingsRegistered,
            wrappedTokensRegistered,
        };
    }
    /**
     * Add token to bridge supported tokens
     */
    addBridgeSupportedToken(bridge, chain, token) {
        if (!this.bridgeSupportedTokens.has(bridge)) {
            this.bridgeSupportedTokens.set(bridge, new Map());
        }
        const bridgeChains = this.bridgeSupportedTokens.get(bridge);
        if (!bridgeChains.has(chain)) {
            bridgeChains.set(chain, new Set());
        }
        bridgeChains.get(chain).add(token.toLowerCase());
    }
    /**
     * Normalize address based on chain type
     */
    normalizeAddress(address, chain) {
        if (chain === 'stellar') {
            // Stellar addresses are case-sensitive
            return address;
        }
        // EVM chains: lowercase
        return address.toLowerCase();
    }
    /**
     * Generate mapping key
     */
    getMappingKey(sourceChain, destinationChain, provider) {
        return `${sourceChain}:${destinationChain}:${provider}`;
    }
    /**
     * Clear all registry data (useful for testing)
     */
    clear() {
        this.tokens.clear();
        this.symbolIndex.clear();
        this.mappings.clear();
        this.wrappedTokens.clear();
        this.bridgeSupportedTokens.clear();
    }
}
exports.TokenMappingRegistry = TokenMappingRegistry;
//# sourceMappingURL=token-mapping-registry.js.map