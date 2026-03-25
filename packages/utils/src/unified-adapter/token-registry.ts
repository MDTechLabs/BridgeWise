/**
 * Token Registry Implementation
 *
 * In-memory registry for managing token metadata and mappings across chains
 */

import {
  ITokenRegistry,
  TokenMetadata,
  TokenMapping,
} from './token-registry.interface';
import { ChainId, BridgeProvider } from '../types';
import { ADAPTER_ERRORS } from './errors';

/**
 * Default in-memory implementation of token registry
 */
export class TokenRegistry implements ITokenRegistry {
  // Storage: Map<chain, Map<tokenAddress, TokenMetadata>>
  private tokens: Map<ChainId, Map<string, TokenMetadata>> = new Map();

  // Storage: Map<"source-target-provider", TokenMapping[]>
  private mappings: Map<string, TokenMapping[]> = new Map();

  // Index for quick lookup: Map<symbol, Map<ChainId, TokenMetadata>>
  private symbolIndex: Map<string, Map<ChainId, TokenMetadata>> = new Map();

  async registerToken(token: TokenMetadata): Promise<void> {
    await Promise.resolve(); // Added await to satisfy require-await
    // Get or create chain map
    if (!this.tokens.has(token.chain)) {
      this.tokens.set(token.chain, new Map());
    }
    const chainTokens = this.tokens.get(token.chain)!;

    // Store by address
    chainTokens.set(token.address.toLowerCase(), token);

    // Update symbol index
    const symbolLower = token.symbol.toLowerCase();
    if (!this.symbolIndex.has(symbolLower)) {
      this.symbolIndex.set(symbolLower, new Map());
    }
    this.symbolIndex.get(symbolLower)!.set(token.chain, token);
  }

  async registerMapping(mapping: TokenMapping): Promise<void> {
    await Promise.resolve(); // Added await to satisfy require-await
    const key = this.getMappingKey(
      mapping.sourceToken.chain,
      mapping.destinationToken.chain,
      mapping.provider,
    );

    if (!this.mappings.has(key)) {
      this.mappings.set(key, []);
    }

    const bridgeMappings = this.mappings.get(key)!;

    // Check if mapping already exists
    const existingIndex = bridgeMappings.findIndex(
      (m) =>
        m.sourceToken.address.toLowerCase() ===
          mapping.sourceToken.address.toLowerCase() &&
        m.destinationToken.address.toLowerCase() ===
          mapping.destinationToken.address.toLowerCase(),
    );

    if (existingIndex >= 0) {
      // Update existing mapping
      bridgeMappings[existingIndex] = mapping;
    } else {
      // Add new mapping
      bridgeMappings.push(mapping);
    }
  }

  async getToken(
    chain: ChainId,
    tokenAddress: string,
  ): Promise<TokenMetadata | null> {
    await Promise.resolve(); // Added await to satisfy require-await
    const chainTokens = this.tokens.get(chain);
    if (!chainTokens) {
      return null;
    }

    const token = chainTokens.get(tokenAddress.toLowerCase());
    return token || null;
  }

  async getMapping(
    sourceChain: ChainId,
    targetChain: ChainId,
    sourceToken: string,
    provider?: BridgeProvider,
  ): Promise<TokenMapping | null> {
    await Promise.resolve(); // Added await to satisfy require-await
    const sourceLower = sourceToken.toLowerCase();

    // Try direct address lookup first
    if (provider) {
      const key = this.getMappingKey(sourceChain, targetChain, provider);
      const mappings = this.mappings.get(key) || [];

      for (const mapping of mappings) {
        if (
          mapping.sourceToken.address.toLowerCase() === sourceLower ||
          mapping.sourceToken.symbol.toLowerCase() === sourceLower
        ) {
          return mapping;
        }
      }
    } else {
      // Search across all providers
      for (const [key, mappings] of this.mappings) {
        if (key.startsWith(`${sourceChain}-${targetChain}`)) {
          for (const mapping of mappings) {
            if (
              mapping.sourceToken.address.toLowerCase() === sourceLower ||
              mapping.sourceToken.symbol.toLowerCase() === sourceLower
            ) {
              return mapping;
            }
          }
        }
      }
    }

    return null;
  }

  async getMappingsForBridge(
    sourceChain: ChainId,
    targetChain: ChainId,
    provider: BridgeProvider,
  ): Promise<TokenMapping[]> {
    await Promise.resolve(); // Added await to satisfy require-await
    const key = this.getMappingKey(sourceChain, targetChain, provider);
    return this.mappings.get(key) || [];
  }

  async getTokensOnChain(chain: ChainId): Promise<TokenMetadata[]> {
    await Promise.resolve(); // Added await to satisfy require-await
    const chainTokens = this.tokens.get(chain);
    if (!chainTokens) {
      return [];
    }
    return Array.from(chainTokens.values());
  }

  async resolveTokenSymbol(
    symbol: string,
    chains?: ChainId[],
  ): Promise<Record<ChainId, string>> {
    await Promise.resolve(); // Added await to satisfy require-await
    const symbolLower = symbol.toLowerCase();
    const symbolTokens = this.symbolIndex.get(symbolLower);
    // List of all ChainId values
    const allChains: ChainId[] = [
      'ethereum',
      'stellar',
      'polygon',
      'arbitrum',
      'optimism',
      'base',
      'gnosis',
      'nova',
      'bsc',
      'avalanche',
    ];
    const result: Record<ChainId, string> = {} as Record<ChainId, string>;
    for (const chain of allChains) {
      if (!chains || chains.includes(chain)) {
        result[chain] = symbolTokens?.get(chain)?.address ?? '';
      } else {
        result[chain] = '';
      }
    }
    return result;
  }

  async isBridgeable(
    sourceChain: ChainId,
    targetChain: ChainId,
    sourceToken: string,
    provider?: BridgeProvider,
  ): Promise<boolean> {
    await Promise.resolve(); // Added await to satisfy require-await
    const mapping = await this.getMapping(
      sourceChain,
      targetChain,
      sourceToken,
      provider,
    );
    return mapping !== null && mapping.isActive;
  }

  async updateMapping(
    sourceChain: ChainId,
    targetChain: ChainId,
    sourceToken: string,
    provider: BridgeProvider,
    updates: Partial<TokenMapping>,
  ): Promise<void> {
    await Promise.resolve(); // Added await to satisfy require-await
    const key = this.getMappingKey(sourceChain, targetChain, provider);
    const mappings = this.mappings.get(key);

    if (!mappings) {
      throw ADAPTER_ERRORS.tokenMappingNotFound(
        sourceChain,
        targetChain,
        sourceToken,
      );
    }

    const sourceLower = sourceToken.toLowerCase();
    const mapping = mappings.find(
      (m) =>
        m.sourceToken.address.toLowerCase() === sourceLower ||
        m.sourceToken.symbol.toLowerCase() === sourceLower,
    );

    if (!mapping) {
      throw ADAPTER_ERRORS.tokenMappingNotFound(
        sourceChain,
        targetChain,
        sourceToken,
      );
    }

    Object.assign(mapping, updates);
  }

  async registerTokensBatch(tokens: TokenMetadata[]): Promise<void> {
    for (const token of tokens) {
      await this.registerToken(token);
    }
  }

  async registerMappingsBatch(mappings: TokenMapping[]): Promise<void> {
    for (const mapping of mappings) {
      await this.registerMapping(mapping);
    }
  }

  /**
   * Create a key for storing mappings
   *
   * @private
   */
  private getMappingKey(
    sourceChain: ChainId,
    targetChain: ChainId,
    provider: BridgeProvider,
  ): string {
    return `${sourceChain}-${targetChain}-${provider}`;
  }

  /**
   * Clear all registrations (useful for testing)
   *
   * @private
   */
  clear(): void {
    this.tokens.clear();
    this.mappings.clear();
    this.symbolIndex.clear();
  }

  /**
   * Get registry statistics
   */
  getStats() {
    let totalTokens = 0;
    for (const chainTokens of this.tokens.values()) {
      totalTokens += chainTokens.size;
    }

    return {
      totalTokens,
      chainsRegistered: this.tokens.size,
      mappingsRegistered: this.mappings.size,
    };
  }
}
