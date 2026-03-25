/**
 * Bridge Adapter Factory
 *
 * Central registry and factory for managing bridge adapters
 */

import { BridgeAdapter, BridgeAdapterConfig } from './adapter.interface';
import { BridgeProvider, ChainId } from '../types';
import { ADAPTER_ERRORS } from './errors';

/**
 * Adapter constructor type
 */
export type AdapterConstructor = new (
  config: BridgeAdapterConfig,
) => BridgeAdapter;

/**
 * Bridge Adapter Factory
 *
 * Manages adapter registration, retrieval, and lifecycle
 */
export class AdapterFactory {
  // Registry of adapter constructors
  private adapters: Map<BridgeProvider, AdapterConstructor> = new Map();

  // Cache of instantiated adapters
  private instances: Map<BridgeProvider, BridgeAdapter> = new Map();

  // Adapter configurations
  private configs: Map<BridgeProvider, BridgeAdapterConfig> = new Map();

  /**
   * Register an adapter implementation
   *
   * @param provider Bridge provider identifier
   * @param adapter Adapter constructor
   * @param config Adapter configuration
   */
  registerAdapter(
    provider: BridgeProvider,
    adapter: AdapterConstructor,
    config: BridgeAdapterConfig,
  ): void {
    if (this.adapters.has(provider)) {
      throw ADAPTER_ERRORS.invalidConfig(
        `Adapter for provider "${provider}" already registered`,
      );
    }

    this.adapters.set(provider, adapter);
    this.configs.set(provider, config);
  }

  /**
   * Register multiple adapters at once
   *
   * @param registrations Array of registration tuples
   */
  registerAdaptersBatch(
    registrations: Array<{
      provider: BridgeProvider;
      adapter: AdapterConstructor;
      config: BridgeAdapterConfig;
    }>,
  ): void {
    for (const registration of registrations) {
      this.registerAdapter(
        registration.provider,
        registration.adapter,
        registration.config,
      );
    }
  }

  /**
   * Get or create an adapter instance
   *
   * @param provider Bridge provider identifier
   * @param createNew Create fresh instance instead of using cache
   * @returns Adapter instance
   * @throws AdapterError if adapter not registered
   */
  getAdapter(
    provider: BridgeProvider,
    createNew: boolean = false,
  ): BridgeAdapter {
    // Return cached instance if available and not creating new
    if (!createNew && this.instances.has(provider)) {
      return this.instances.get(provider)!;
    }

    // Check if adapter is registered
    const AdapterClass = this.adapters.get(provider);
    if (!AdapterClass) {
      throw ADAPTER_ERRORS.invalidConfig(
        `Adapter for provider "${provider}" not registered`,
      );
    }

    const config = this.configs.get(provider)!;

    // Create new instance
    const instance = new AdapterClass(config);

    // Cache instance if not creating new
    if (!createNew) {
      this.instances.set(provider, instance);
    }

    return instance;
  }

  /**
   * Get all registered adapters
   *
   * @returns Map of provider to adapter instance
   */
  getAllAdapters(): Map<BridgeProvider, BridgeAdapter> {
    const result = new Map<BridgeProvider, BridgeAdapter>();

    for (const provider of this.adapters.keys()) {
      result.set(provider, this.getAdapter(provider));
    }

    return result;
  }

  /**
   * Get configuration for an adapter
   *
   * @param provider Bridge provider identifier
   * @returns Adapter configuration
   * @throws AdapterError if adapter not registered
   */
  getAdapterConfig(provider: BridgeProvider): BridgeAdapterConfig {
    const config = this.configs.get(provider);
    if (!config) {
      throw ADAPTER_ERRORS.invalidConfig(
        `Configuration for provider "${provider}" not found`,
      );
    }
    return config;
  }

  /**
   * Update adapter configuration
   *
   * @param provider Bridge provider identifier
   * @param config New configuration
   */
  updateAdapterConfig(
    provider: BridgeProvider,
    config: BridgeAdapterConfig,
  ): void {
    if (!this.adapters.has(provider)) {
      throw ADAPTER_ERRORS.invalidConfig(
        `Adapter for provider "${provider}" not registered`,
      );
    }

    this.configs.set(provider, config);

    // Clear cached instance to force re-creation with new config
    this.instances.delete(provider);
  }

  /**
   * Check if an adapter is registered
   *
   * @param provider Bridge provider identifier
   * @returns True if adapter is registered
   */
  hasAdapter(provider: BridgeProvider): boolean {
    return this.adapters.has(provider);
  }

  /**
   * Get list of registered providers
   *
   * @returns Array of provider identifiers
   */
  getRegisteredProviders(): BridgeProvider[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Filter adapters by supported chains
   *
   * @param sourceChain Source chain
   * @param targetChain Target chain
   * @returns Array of adapters that support this chain pair
   */
  getAdaptersForChainPair(
    sourceChain: ChainId,
    targetChain: ChainId,
  ): BridgeAdapter[] {
    const result: BridgeAdapter[] = [];

    for (const adapter of this.getAllAdapters().values()) {
      if (adapter.supportsChainPair(sourceChain, targetChain)) {
        result.push(adapter);
      }
    }

    return result;
  }

  /**
   * Initialize a specific adapter
   *
   * @param provider Bridge provider identifier
   * @returns Promise that resolves when initialization is complete
   */
  async initializeAdapter(provider: BridgeProvider): Promise<void> {
    const adapter = this.getAdapter(provider);
    if (adapter.initialize) {
      await adapter.initialize();
    }
  }

  /**
   * Initialize all adapters
   *
   * @returns Promise that resolves when all adapters are initialized
   */
  async initializeAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const provider of this.adapters.keys()) {
      promises.push(this.initializeAdapter(provider));
    }

    await Promise.all(promises);
  }

  /**
   * Shutdown a specific adapter
   *
   * @param provider Bridge provider identifier
   * @returns Promise that resolves when shutdown is complete
   */
  async shutdownAdapter(provider: BridgeProvider): Promise<void> {
    const adapter = this.instances.get(provider);
    if (adapter && adapter.shutdown) {
      await adapter.shutdown();
    }
  }

  /**
   * Shutdown all adapters
   *
   * @returns Promise that resolves when all adapters are shutdown
   */
  async shutdownAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const provider of this.adapters.keys()) {
      promises.push(this.shutdownAdapter(provider));
    }

    await Promise.all(promises);
  }

  /**
   * Reset factory (clear all registrations)
   *
   * @async If true, will shutdown adapters before clearing
   */
  async reset(async: boolean = false): Promise<void> {
    if (async) {
      await this.shutdownAll();
    }

    this.adapters.clear();
    this.instances.clear();
    this.configs.clear();
  }

  /**
   * Get factory statistics
   */
  getStats() {
    return {
      registeredAdapters: this.adapters.size,
      cachedInstances: this.instances.size,
      registeredProviders: Array.from(this.adapters.keys()),
    };
  }
}

/**
 * Singleton instance of the adapter factory
 */
let factoryInstance: AdapterFactory | null = null;

/**
 * Get or create the global adapter factory instance
 *
 * @returns Single instance of AdapterFactory
 */
export function getAdapterFactory(): AdapterFactory {
  if (!factoryInstance) {
    factoryInstance = new AdapterFactory();
  }
  return factoryInstance;
}

/**
 * Reset the global adapter factory (useful for testing)
 *
 * @async If true, will shutdown adapters before clearing
 */
export async function resetAdapterFactory(
  async: boolean = false,
): Promise<void> {
  if (factoryInstance) {
    await factoryInstance.reset(async);
    factoryInstance = null;
  }
}
