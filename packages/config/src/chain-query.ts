/**
 * Chain Query Utilities
 * Provides query and filtering capabilities for chains
 */

import { ChainConfig } from './chain-config-schema';

export interface ChainQueryOptions {
  type?: string | string[];
  bridgeable?: boolean;
  testnet?: boolean | null;
  symbol?: string;
  rpcUrl?: string;
  excludeChainIds?: string[];
}

export interface ChainQueryResult {
  chains: ChainConfig[];
  total: number;
  applied: string[];
}

/**
 * Create a chain query builder
 */
export function createChainQuery(chains: ChainConfig[]) {
  return new ChainQueryBuilder(chains);
}

/**
 * Chain Query Builder
 */
class ChainQueryBuilder {
  private chains: ChainConfig[];
  private appliedFilters: string[] = [];

  constructor(chains: ChainConfig[]) {
    this.chains = [...chains];
  }

  /**
   * Filter by chain type
   */
  byType(type: string | string[]): this {
    const types = Array.isArray(type) ? type : [type];
    this.chains = this.chains.filter(chain => types.includes(chain.type));
    this.appliedFilters.push(`type: [${types.join(', ')}]`);
    return this;
  }

  /**
   * Filter by bridgeable status
   */
  bridgeable(enabled: boolean = true): this {
    this.chains = this.chains.filter(chain => chain.features.supportsBridging === enabled);
    this.appliedFilters.push(`bridgeable: ${enabled}`);
    return this;
  }

  /**
   * Filter by testnet status
   */
  testnet(include: boolean | null = null): this {
    if (include !== null) {
      this.chains = this.chains.filter(chain => chain.isTestnet === include);
      this.appliedFilters.push(`testnet: ${include}`);
    }
    return this;
  }

  /**
   * Filter by symbol
   */
  bySymbol(symbol: string | string[]): this {
    const symbols = Array.isArray(symbol) ? symbol : [symbol];
    const symbolSet = new Set(symbols.map(s => s.toUpperCase()));
    this.chains = this.chains.filter(chain => symbolSet.has(chain.symbol.toUpperCase()));
    this.appliedFilters.push(`symbol: [${symbols.join(', ')}]`);
    return this;
  }

  /**
   * Filter by RPC URL
   */
  byRpcUrl(rpcUrl: string): this {
    this.chains = this.chains.filter(chain => chain.rpcUrl.includes(rpcUrl));
    this.appliedFilters.push(`rpcUrl contains: ${rpcUrl}`);
    return this;
  }

  /**
   * Exclude specific chains
   */
  exclude(...chainIds: string[]): this {
    const excludeSet = new Set(chainIds.map(id => id.toLowerCase()));
    this.chains = this.chains.filter(chain => !excludeSet.has(chain.id.toLowerCase()));
    this.appliedFilters.push(`exclude: [${chainIds.join(', ')}]`);
    return this;
  }

  /**
   * Filter using custom predicate
   */
  filter(predicate: (chain: ChainConfig) => boolean, description?: string): this {
    this.chains = this.chains.filter(predicate);
    if (description) {
      this.appliedFilters.push(description);
    }
    return this;
  }

  /**
   * Sort results
   */
  sortBy(comparator: (a: ChainConfig, b: ChainConfig) => number): this {
    this.chains.sort(comparator);
    return this;
  }

  /**
   * Sort by name ascending
   */
  sortByName(): this {
    this.chains.sort((a, b) => a.name.localeCompare(b.name));
    this.appliedFilters.push('sorted by name');
    return this;
  }

  /**
   * Sort by chain ID ascending
   */
  sortByChainId(): this {
    this.chains.sort((a, b) => a.chainId - b.chainId);
    this.appliedFilters.push('sorted by chainId');
    return this;
  }

  /**
   * Limit results
   */
  limit(count: number): this {
    this.chains = this.chains.slice(0, count);
    this.appliedFilters.push(`limit: ${count}`);
    return this;
  }

  /**
   * Offset results
   */
  offset(count: number): this {
    this.chains = this.chains.slice(count);
    this.appliedFilters.push(`offset: ${count}`);
    return this;
  }

  /**
   * Get single result
   */
  first(): ChainConfig | undefined {
    return this.chains[0];
  }

  /**
   * Get all results
   */
  toArray(): ChainConfig[] {
    return [...this.chains];
  }

  /**
   * Get results with metadata
   */
  toResult(): ChainQueryResult {
    return {
      chains: [...this.chains],
      total: this.chains.length,
      applied: [...this.appliedFilters],
    };
  }

  /**
   * Execute query with options
   */
  static execute(chains: ChainConfig[], options: ChainQueryOptions): ChainQueryResult {
    let query = createChainQuery(chains);

    if (options.type) {
      query = query.byType(options.type);
    }

    if (options.bridgeable !== undefined) {
      query = query.bridgeable(options.bridgeable);
    }

    if (options.testnet !== undefined && options.testnet !== null) {
      query = query.testnet(options.testnet);
    }

    if (options.symbol) {
      query = query.bySymbol(options.symbol);
    }

    if (options.rpcUrl) {
      query = query.byRpcUrl(options.rpcUrl);
    }

    if (options.excludeChainIds && options.excludeChainIds.length > 0) {
      query = query.exclude(...options.excludeChainIds);
    }

    return query.toResult();
  }
}
