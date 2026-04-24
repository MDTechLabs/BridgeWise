/**
 * Chain Registry
 * Provides a centralized registry of supported chains with validation
 */

import { ChainConfig, validateChainConfig } from './chain-config-schema';

export class ChainRegistry {
  private chains: Map<string, ChainConfig> = new Map();
  private chainsByNumericId: Map<number, ChainConfig> = new Map();
  private chainsByType: Map<string, Set<string>> = new Map();

  /**
   * Register a chain
   */
  register(chain: ChainConfig): void {
    const validation = validateChainConfig(chain);
    if (!validation.valid) {
      throw new Error(`Invalid chain configuration: ${validation.errors.join(', ')}`);
    }

    const chainIdLower = chain.id.toLowerCase();

    // Register by ID
    this.chains.set(chainIdLower, chain);

    // Register by numeric chain ID
    this.chainsByNumericId.set(chain.chainId, chain);

    // Register by type
    if (!this.chainsByType.has(chain.type)) {
      this.chainsByType.set(chain.type, new Set());
    }
    this.chainsByType.get(chain.type)!.add(chainIdLower);
  }

  /**
   * Register multiple chains
   */
  registerBatch(chains: ChainConfig[]): void {
    for (const chain of chains) {
      this.register(chain);
    }
  }

  /**
   * Get chain by ID
   */
  get(chainId: string): ChainConfig | undefined {
    return this.chains.get(chainId.toLowerCase());
  }

  /**
   * Get chain by numeric chain ID
   */
  getByNumericId(numericChainId: number): ChainConfig | undefined {
    return this.chainsByNumericId.get(numericChainId);
  }

  /**
   * Get all chains
   */
  getAll(): ChainConfig[] {
    return Array.from(this.chains.values());
  }

  /**
   * Get chains by type
   */
  getByType(type: string): ChainConfig[] {
    const chainIds = this.chainsByType.get(type);
    if (!chainIds) {
      return [];
    }
    return Array.from(chainIds)
      .map(id => this.chains.get(id)!)
      .filter(Boolean);
  }

  /**
   * Check if chain is registered
   */
  has(chainId: string): boolean {
    return this.chains.has(chainId.toLowerCase());
  }

  /**
   * Unregister a chain
   */
  unregister(chainId: string): boolean {
    const chainIdLower = chainId.toLowerCase();
    const chain = this.chains.get(chainIdLower);

    if (!chain) {
      return false;
    }

    // Remove from main registry
    this.chains.delete(chainIdLower);

    // Remove from numeric ID registry
    this.chainsByNumericId.delete(chain.chainId);

    // Remove from type registry
    const typeSet = this.chainsByType.get(chain.type);
    if (typeSet) {
      typeSet.delete(chainIdLower);
      if (typeSet.size === 0) {
        this.chainsByType.delete(chain.type);
      }
    }

    return true;
  }

  /**
   * Update chain
   */
  update(chainId: string, updates: Partial<ChainConfig>): boolean {
    const chain = this.get(chainId);
    if (!chain) {
      return false;
    }

    const updated = { ...chain, ...updates, id: chain.id };
    const validation = validateChainConfig(updated);

    if (!validation.valid) {
      throw new Error(`Invalid chain update: ${validation.errors.join(', ')}`);
    }

    // If type changed, update type registry
    if (updates.type && updates.type !== chain.type) {
      const oldTypeSet = this.chainsByType.get(chain.type);
      if (oldTypeSet) {
        oldTypeSet.delete(chainId.toLowerCase());
      }

      if (!this.chainsByType.has(updates.type)) {
        this.chainsByType.set(updates.type, new Set());
      }
      this.chainsByType.get(updates.type)!.add(chainId.toLowerCase());
    }

    // If numeric chain ID changed, update numeric ID registry
    if (updates.chainId && updates.chainId !== chain.chainId) {
      this.chainsByNumericId.delete(chain.chainId);
      this.chainsByNumericId.set(updates.chainId, updated);
    }

    // Update main registry
    this.chains.set(chainId.toLowerCase(), updated);
    return true;
  }

  /**
   * Clear all chains
   */
  clear(): void {
    this.chains.clear();
    this.chainsByNumericId.clear();
    this.chainsByType.clear();
  }

  /**
   * Get registry size
   */
  size(): number {
    return this.chains.size;
  }

  /**
   * Get supported types
   */
  getSupportedTypes(): string[] {
    return Array.from(this.chainsByType.keys());
  }

  /**
   * Export as JSON
   */
  toJSON() {
    return {
      chains: this.getAll(),
      metadata: {
        totalChains: this.size(),
        supportedTypes: this.getSupportedTypes(),
        updatedAt: new Date().toISOString(),
      },
    };
  }
}
