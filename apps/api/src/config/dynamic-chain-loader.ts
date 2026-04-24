/**
 * Dynamic Chain Configuration Loader
 * Loads chain configurations from JSON files and environment variables
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import {
  ChainConfig,
  ChainsConfiguration,
  ChainConfigOptions,
  validateChainConfig,
} from './chain-config-schema';

export class DynamicChainConfigLoader {
  private static readonly logger = new Logger(DynamicChainConfigLoader.name);
  private static cachedChains: ChainConfig[] | null = null;

  /**
   * Load chains from all configured sources
   */
  static loadChains(options: ChainConfigOptions = {}): ChainConfig[] {
    // Return cached chains if available and not forced to reload
    if (!options.skipValidation && this.cachedChains) {
      return this.cachedChains;
    }

    let chains: ChainConfig[] = [];

    // Load from JSON files (primary source)
    if (options.fromJson !== false) {
      chains = this.loadChainsFromJson(options);
    }

    // Load from environment variables (override/supplement JSON)
    if (options.fromEnv !== false) {
      const envChains = this.loadChainsFromEnvironment(options);
      chains = this.mergeChains(chains, envChains);
    }

    // Apply overrides
    chains = this.applyOverrides(chains, options);

    // Filter chains
    chains = this.filterChains(chains, options);

    // Validate all chains
    if (!options.skipValidation) {
      chains = this.validateAndCleanChains(chains);
    }

    // Cache the result
    this.cachedChains = chains;

    this.logger.debug(`Loaded ${chains.length} chains from configuration`);
    return chains;
  }

  /**
   * Load chains from JSON configuration files
   */
  private static loadChainsFromJson(options: ChainConfigOptions): ChainConfig[] {
    const chains: ChainConfig[] = [];

    // Determine which config files to load based on environment
    const nodeEnv = process.env.NODE_ENV || 'development';
    const configDir = path.join(__dirname, 'chains-config');

    // Load chains from different config files (in order of precedence)
    const configFiles = [
      'chains.config.json', // Base configuration
      `chains.config.${nodeEnv}.json`, // Environment-specific
    ];

    for (const file of configFiles) {
      const filePath = path.join(configDir, file);

      if (fs.existsSync(filePath)) {
        try {
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          const config: ChainsConfiguration = JSON.parse(fileContent);

          if (config.chains && Array.isArray(config.chains)) {
            chains.push(...config.chains);
            this.logger.debug(`Loaded ${config.chains.length} chains from ${file}`);
          }
        } catch (error) {
          this.logger.error(`Failed to load chains from ${file}:`, error);
        }
      }
    }

    // Also check if there are chain configs in root config directory
    const rootConfigFile = path.join(__dirname, '..', '..', 'config', 'chains.json');
    if (fs.existsSync(rootConfigFile)) {
      try {
        const fileContent = fs.readFileSync(rootConfigFile, 'utf-8');
        const config: ChainsConfiguration = JSON.parse(fileContent);
        if (config.chains && Array.isArray(config.chains)) {
          chains.push(...config.chains);
          this.logger.debug(`Loaded ${config.chains.length} chains from root config`);
        }
      } catch (error) {
        this.logger.error(`Failed to load chains from root config:`, error);
      }
    }

    return chains;
  }

  /**
   * Load chains from environment variables
   * Supports format: CHAIN_<ID>_<PROPERTY>=value
   * Example: CHAIN_ETHEREUM_RPC_URL=https://...
   */
  private static loadChainsFromEnvironment(options: ChainConfigOptions): ChainConfig[] {
    const chains: Map<string, Partial<ChainConfig>> = new Map();

    // Regular expression to match CHAIN_* environment variables
    const chainEnvPattern = /^CHAIN_([A-Z0-9_]+)_([A-Z0-9_]+)$/;

    for (const [key, value] of Object.entries(process.env)) {
      const match = key.match(chainEnvPattern);
      if (match) {
        const chainId = match[1].toLowerCase();
        const property = match[2].toLowerCase();

        if (!chains.has(chainId)) {
          chains.set(chainId, { id: chainId });
        }

        const chainData = chains.get(chainId)!;

        // Map environment variable names to chain config properties
        switch (property) {
          case 'name':
            chainData.name = value;
            break;
          case 'symbol':
            chainData.symbol = value;
            break;
          case 'chain_id':
          case 'chainid':
            chainData.chainId = parseInt(value, 10);
            break;
          case 'rpc_url':
          case 'rpcurl':
            chainData.rpcUrl = value;
            break;
          case 'explorer_url':
          case 'explorerurl':
            chainData.explorerUrl = value;
            break;
          case 'type':
            chainData.type = value as any;
            break;
          case 'is_testnet':
          case 'istestnet':
            chainData.isTestnet = value.toLowerCase() === 'true';
            break;
          case 'supports_bridging':
          case 'supportsbridging':
            if (!chainData.features) {
              chainData.features = {} as any;
            }
            (chainData.features as any).supportsBridging = value.toLowerCase() === 'true';
            break;
          case 'supports_quotes':
          case 'supportsquotes':
            if (!chainData.features) {
              chainData.features = {} as any;
            }
            (chainData.features as any).supportsQuotes = value.toLowerCase() === 'true';
            break;
          case 'native_decimals':
          case 'nativedecimals':
            if (!chainData.features) {
              chainData.features = {} as any;
            }
            (chainData.features as any).nativeCurrencyDecimals = parseInt(value, 10);
            break;
        }
      }
    }

    // Convert partial chains to array
    const result: ChainConfig[] = [];
    for (const chain of chains.values()) {
      if (chain.id && chain.name && chain.symbol && chain.chainId) {
        result.push(chain as ChainConfig);
      }
    }

    if (result.length > 0) {
      this.logger.debug(`Loaded ${result.length} chains from environment variables`);
    }

    return result;
  }

  /**
   * Merge chains from multiple sources, preferring environment configs
   */
  private static mergeChains(jsonChains: ChainConfig[], envChains: ChainConfig[]): ChainConfig[] {
    const chainMap = new Map<string, ChainConfig>();

    // First add JSON chains
    for (const chain of jsonChains) {
      chainMap.set(chain.id.toLowerCase(), chain);
    }

    // Then override/add from environment chains
    for (const chain of envChains) {
      chainMap.set(chain.id.toLowerCase(), {
        ...chainMap.get(chain.id.toLowerCase()),
        ...chain,
      });
    }

    return Array.from(chainMap.values());
  }

  /**
   * Apply configuration overrides
   */
  private static applyOverrides(chains: ChainConfig[], options: ChainConfigOptions): ChainConfig[] {
    if (!options.overrideRpcUrls && !options.overrideExplorerUrls) {
      return chains;
    }

    return chains.map(chain => {
      let updated = { ...chain };

      if (options.overrideRpcUrls?.[chain.id]) {
        updated.rpcUrl = options.overrideRpcUrls[chain.id];
      }

      if (options.overrideExplorerUrls?.[chain.id]) {
        updated.explorerUrl = options.overrideExplorerUrls[chain.id];
      }

      return updated;
    });
  }

  /**
   * Filter chains based on options
   */
  private static filterChains(chains: ChainConfig[], options: ChainConfigOptions): ChainConfig[] {
    let filtered = chains;

    // Filter testnets option
    if (options.includeTestnets === false) {
      filtered = filtered.filter(chain => !chain.isTestnet);
    }

    // Filter by enabled chain IDs
    if (options.enabledChainIds && options.enabledChainIds.length > 0) {
      const enabledIds = new Set(options.enabledChainIds.map(id => id.toLowerCase()));
      filtered = filtered.filter(chain => enabledIds.has(chain.id.toLowerCase()));
    }

    return filtered;
  }

  /**
   * Validate and clean chain configurations
   */
  private static validateAndCleanChains(chains: ChainConfig[]): ChainConfig[] {
    const validated: ChainConfig[] = [];

    for (const chain of chains) {
      const validation = validateChainConfig(chain);

      if (validation.valid) {
        validated.push(chain);
      } else {
        this.logger.warn(`Chain ${chain.id} failed validation:`, validation.errors);
      }
    }

    return validated;
  }

  /**
   * Clear the cache to force reload on next load
   */
  static clearCache(): void {
    this.cachedChains = null;
  }

  /**
   * Get a specific chain by ID
   */
  static getChainById(chainId: string, options?: ChainConfigOptions): ChainConfig | undefined {
    const chains = this.loadChains(options);
    return chains.find(chain => chain.id.toLowerCase() === chainId.toLowerCase());
  }

  /**
   * Get EVM chain by numeric chainId
   */
  static getEVMChainByChainId(
    numericChainId: number,
    options?: ChainConfigOptions,
  ): ChainConfig | undefined {
    const chains = this.loadChains(options);
    return chains.find(chain => chain.chainId === numericChainId && chain.type === 'EVM');
  }

  /**
   * Get all chains of a specific type
   */
  static getChainsByType(
    type: string,
    options?: ChainConfigOptions,
  ): ChainConfig[] {
    const chains = this.loadChains(options);
    return chains.filter(chain => chain.type === type);
  }

  /**
   * Check if a chain is bridgeable
   */
  static isBridgeable(chainId: string, options?: ChainConfigOptions): boolean {
    const chain = this.getChainById(chainId, options);
    return chain ? chain.features.supportsBridging : false;
  }

  /**
   * Export chains configuration to JSON format
   */
  static exportToJson(chains: ChainConfig[], version: string = '1.0.0'): ChainsConfiguration {
    return {
      chains,
      version,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Generate environment variable format for chains
   * Useful for .env file generation
   */
  static generateEnvFormat(chains: ChainConfig[]): string {
    const lines: string[] = ['# Generated Chain Configuration Environment Variables\n'];

    for (const chain of chains) {
      const prefix = `CHAIN_${chain.id.toUpperCase()}`;
      lines.push(`# ${chain.name}`);
      lines.push(`${prefix}_NAME=${chain.name}`);
      lines.push(`${prefix}_SYMBOL=${chain.symbol}`);
      lines.push(`${prefix}_CHAIN_ID=${chain.chainId}`);
      lines.push(`${prefix}_RPC_URL=${chain.rpcUrl}`);
      lines.push(`${prefix}_EXPLORER_URL=${chain.explorerUrl}`);
      lines.push(`${prefix}_TYPE=${chain.type}`);
      if (chain.isTestnet) {
        lines.push(`${prefix}_IS_TESTNET=true`);
      }
      if (chain.features) {
        lines.push(`${prefix}_SUPPORTS_BRIDGING=${chain.features.supportsBridging}`);
        lines.push(`${prefix}_SUPPORTS_QUOTES=${chain.features.supportsQuotes}`);
        lines.push(`${prefix}_NATIVE_DECIMALS=${chain.features.nativeCurrencyDecimals}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
