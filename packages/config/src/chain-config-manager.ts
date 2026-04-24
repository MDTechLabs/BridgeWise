/**
 * Chain Configuration Manager
 * Manages chain configurations across the application
 */

import { ChainConfig, ChainsConfiguration } from './chain-config-schema';

export class ChainConfigManager {
  private static chains: ChainConfig[] = [];
  private static version = '1.0.0';
  private static initialized = false;

  /**
   * Initialize with chains
   */
  static initialize(chains: ChainConfig[], version?: string): void {
    this.chains = chains;
    if (version) {
      this.version = version;
    }
    this.initialized = true;
  }

  /**
   * Get all chains
   */
  static getChains(): ChainConfig[] {
    return [...this.chains];
  }

  /**
   * Get chain by ID
   */
  static getChainById(chainId: string): ChainConfig | undefined {
    return this.chains.find(chain => chain.id.toLowerCase() === chainId.toLowerCase());
  }

  /**
   * Get chain by numeric chain ID
   */
  static getChainByNumericId(numericChainId: number): ChainConfig | undefined {
    return this.chains.find(chain => chain.chainId === numericChainId);
  }

  /**
   * Get chains by type
   */
  static getChainsByType(type: string): ChainConfig[] {
    return this.chains.filter(chain => chain.type === type);
  }

  /**
   * Get bridgeable chains
   */
  static getBridgeableChains(): ChainConfig[] {
    return this.chains.filter(chain => chain.features.supportsBridging);
  }

  /**
   * Get testnet chains
   */
  static getTestnetChains(): ChainConfig[] {
    return this.chains.filter(chain => chain.isTestnet);
  }

  /**
   * Get mainnet chains
   */
  static getMainnetChains(): ChainConfig[] {
    return this.chains.filter(chain => !chain.isTestnet);
  }

  /**
   * Add chain
   */
  static addChain(chain: ChainConfig): void {
    const existing = this.chains.findIndex(c => c.id.toLowerCase() === chain.id.toLowerCase());
    if (existing >= 0) {
      this.chains[existing] = chain;
    } else {
      this.chains.push(chain);
    }
  }

  /**
   * Remove chain
   */
  static removeChain(chainId: string): boolean {
    const index = this.chains.findIndex(c => c.id.toLowerCase() === chainId.toLowerCase());
    if (index >= 0) {
      this.chains.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Update chain RPC URL
   */
  static updateChainRpcUrl(chainId: string, rpcUrl: string): boolean {
    const chain = this.getChainById(chainId);
    if (chain) {
      chain.rpcUrl = rpcUrl;
      return true;
    }
    return false;
  }

  /**
   * Export configuration
   */
  static exportConfiguration(): ChainsConfiguration {
    return {
      chains: this.chains,
      version: this.version,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Check if initialized
   */
  static isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reset configuration
   */
  static reset(): void {
    this.chains = [];
    this.initialized = false;
  }

  /**
   * Get configuration stats
   */
  static getStats() {
    return {
      totalChains: this.chains.length,
      bridgeableChains: this.chains.filter(c => c.features.supportsBridging).length,
      evmChains: this.chains.filter(c => c.type === 'EVM').length,
      testnetChains: this.chains.filter(c => c.isTestnet).length,
      mainnetChains: this.chains.filter(c => !c.isTestnet).length,
    };
  }
}
