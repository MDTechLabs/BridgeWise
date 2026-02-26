import { Injectable, Logger } from '@nestjs/common';
import { BridgeAdapter, BridgeCapability } from '../interfaces/bridge-adapter.interface';
import {
  BridgeCapabilityNotFoundException,
  BridgeDuplicateException,
  BridgeNotFoundException,
} from '../exceptions/bridge.exceptions';

export interface BridgeRegistryEntry {
  adapter: BridgeAdapter;
  registeredAt: Date;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class BridgeRegistry {
  private readonly logger = new Logger(BridgeRegistry.name);
  private readonly adapters = new Map<string, BridgeRegistryEntry>();
  private allowOverwrite: boolean = false;

  setOverwriteMode(allow: boolean): void {
    this.allowOverwrite = allow;
  }

  /**
   * Register a bridge adapter.
   * Throws BridgeDuplicateException if already registered and allowOverwrite=false.
   */
  register(adapter: BridgeAdapter, metadata?: Record<string, unknown>): void {
    if (this.adapters.has(adapter.name) && !this.allowOverwrite) {
      throw new BridgeDuplicateException(adapter.name);
    }

    if (this.adapters.has(adapter.name)) {
      this.logger.warn(`Overwriting bridge adapter: "${adapter.name}"`);
    }

    this.adapters.set(adapter.name, {
      adapter,
      registeredAt: new Date(),
      metadata,
    });

    this.logger.log(`Registered bridge adapter: "${adapter.name}" v${adapter.version}`);
  }

  /**
   * Resolve a bridge by name.
   * Throws BridgeNotFoundException if not found.
   */
  get(name: string): BridgeAdapter {
    const entry = this.adapters.get(name);
    if (!entry) {
      throw new BridgeNotFoundException(name);
    }
    return entry.adapter;
  }

  /**
   * Try to resolve a bridge by name without throwing.
   */
  tryGet(name: string): BridgeAdapter | undefined {
    return this.adapters.get(name)?.adapter;
  }

  /**
   * Resolve all bridges that have a given capability.
   */
  getByCapability(capabilityName: string): BridgeAdapter[] {
    const matches = Array.from(this.adapters.values())
      .map((entry) => entry.adapter)
      .filter((adapter) =>
        adapter.capabilities.some((cap: BridgeCapability) => cap.name === capabilityName),
      );

    if (matches.length === 0) {
      throw new BridgeCapabilityNotFoundException(capabilityName);
    }

    return matches;
  }

  /**
   * List all registered bridge names.
   */
  list(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * List full registry entries with metadata.
   */
  listEntries(): BridgeRegistryEntry[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Check whether a bridge is registered.
   */
  has(name: string): boolean {
    return this.adapters.has(name);
  }

  /**
   * Unregister a bridge by name.
   */
  unregister(name: string): boolean {
    const removed = this.adapters.delete(name);
    if (removed) {
      this.logger.log(`Unregistered bridge adapter: "${name}"`);
    }
    return removed;
  }

  /**
   * Clear all registered adapters.
   */
  clear(): void {
    this.adapters.clear();
    this.logger.log('Cleared all bridge adapters from registry');
  }

  /**
   * Return count of registered bridges.
   */
  get size(): number {
    return this.adapters.size;
  }
}
