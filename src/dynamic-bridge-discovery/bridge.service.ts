import { Injectable } from '@nestjs/common';
import { BridgeAdapter } from '../interfaces/bridge-adapter.interface';
import { BridgeRegistry } from '../registry/bridge.registry';
import { BridgeLoader } from '../loaders/bridge.loader';

@Injectable()
export class BridgeService {
  constructor(
    private readonly registry: BridgeRegistry,
    private readonly loader: BridgeLoader,
  ) {}

  /**
   * Execute an operation on a named bridge.
   */
  async execute<T = unknown, R = unknown>(
    bridgeName: string,
    operation: string,
    payload: T,
  ): Promise<R> {
    const adapter = this.registry.get(bridgeName);
    return adapter.execute<T, R>(operation, payload);
  }

  /**
   * Execute an operation on all bridges with a given capability.
   */
  async executeByCapability<T = unknown, R = unknown>(
    capability: string,
    operation: string,
    payload: T,
  ): Promise<R[]> {
    const adapters = this.registry.getByCapability(capability);
    return Promise.all(adapters.map((a) => a.execute<T, R>(operation, payload)));
  }

  /**
   * Register a bridge adapter at runtime (plugin injection).
   */
  async registerBridge(adapter: BridgeAdapter, options?: Record<string, unknown>): Promise<void> {
    await this.loader.registerAdapter(adapter, options);
  }

  /**
   * Load a bridge from a file path at runtime.
   */
  async loadBridgeFromFile(filePath: string): Promise<BridgeAdapter | null> {
    return this.loader.loadAdapterFromFile(filePath);
  }

  /**
   * Check if a bridge is available.
   */
  hasBridge(name: string): boolean {
    return this.registry.has(name);
  }

  /**
   * List all registered bridge names.
   */
  listBridges(): string[] {
    return this.registry.list();
  }

  /**
   * Get a bridge adapter directly.
   */
  getBridge(name: string): BridgeAdapter {
    return this.registry.get(name);
  }

  /**
   * Attempt to get a bridge without throwing.
   */
  tryGetBridge(name: string): BridgeAdapter | undefined {
    return this.registry.tryGet(name);
  }

  /**
   * Health check for all registered bridges.
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const name of this.registry.list()) {
      try {
        results[name] = await this.registry.get(name).isHealthy();
      } catch {
        results[name] = false;
      }
    }
    return results;
  }

  /**
   * Gracefully shutdown all bridge adapters.
   */
  async shutdownAll(): Promise<void> {
    for (const name of this.registry.list()) {
      try {
        await this.registry.get(name).shutdown();
      } catch {
        // best-effort shutdown
      }
    }
  }
}
