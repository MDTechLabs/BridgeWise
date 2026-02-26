import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { BridgeAdapter, BridgeAdapterConstructor } from '../interfaces/bridge-adapter.interface';
import { BridgeModuleConfig } from '../interfaces/bridge-config.interface';
import { BridgeInitializationException, BridgeLoadException } from '../exceptions/bridge.exceptions';
import { BridgeRegistry } from '../registry/bridge.registry';
import { BRIDGE_ADAPTER_METADATA } from '../decorators/bridge.decorators';

@Injectable()
export class BridgeLoader implements OnModuleInit {
  private readonly logger = new Logger(BridgeLoader.name);

  constructor(
    private readonly registry: BridgeRegistry,
    private readonly config: BridgeModuleConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registry.setOverwriteMode(this.config.allowOverwrite ?? false);

    if (this.config.autoDiscover && this.config.bridgesDirectory) {
      await this.loadFromDirectory(this.config.bridgesDirectory);
    }

    if (this.config.bridges) {
      await this.loadFromConfig(this.config.bridges);
    }
  }

  /**
   * Scan a directory for bridge adapter modules and auto-register them.
   */
  async loadFromDirectory(directory: string): Promise<void> {
    const resolvedDir = path.isAbsolute(directory)
      ? directory
      : path.join(process.cwd(), directory);

    if (!fs.existsSync(resolvedDir)) {
      this.logger.warn(`Bridge directory not found: "${resolvedDir}". Skipping auto-discovery.`);
      return;
    }

    const files = fs
      .readdirSync(resolvedDir)
      .filter((f) => (f.endsWith('.adapter.ts') || f.endsWith('.adapter.js')) && !f.endsWith('.spec.ts'));

    this.logger.log(`Discovered ${files.length} bridge file(s) in "${resolvedDir}"`);

    for (const file of files) {
      const filePath = path.join(resolvedDir, file);
      await this.loadAdapterFromFile(filePath);
    }
  }

  /**
   * Load a single bridge adapter from a file path.
   */
  async loadAdapterFromFile(filePath: string): Promise<BridgeAdapter | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(filePath);
      const AdapterClass = this.extractAdapterClass(mod);

      if (!AdapterClass) {
        this.logger.warn(`No valid BridgeAdapter export found in "${filePath}". Skipping.`);
        return null;
      }

      const adapterConfig = this.config.globalConfig ?? {};
      const instance: BridgeAdapter = new AdapterClass(adapterConfig);

      await this.initializeAdapter(instance);
      this.registry.register(instance, { source: filePath });

      return instance;
    } catch (err) {
      throw new BridgeLoadException(filePath, err as Error);
    }
  }

  /**
   * Load bridges defined in the configuration object.
   */
  async loadFromConfig(bridgesConfig: BridgeModuleConfig['bridges']): Promise<void> {
    if (!bridgesConfig) return;

    for (const [name, adapterConfig] of Object.entries(bridgesConfig)) {
      if (adapterConfig.enabled === false) {
        this.logger.log(`Bridge "${name}" is disabled via config. Skipping.`);
        continue;
      }

      if (!adapterConfig.modulePath) {
        this.logger.warn(`Bridge "${name}" has no modulePath. Skipping.`);
        continue;
      }

      const resolvedPath = path.isAbsolute(adapterConfig.modulePath)
        ? adapterConfig.modulePath
        : path.join(process.cwd(), adapterConfig.modulePath);

      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(resolvedPath);
        const AdapterClass = this.extractAdapterClass(mod);

        if (!AdapterClass) {
          this.logger.warn(`No valid BridgeAdapter export found for "${name}". Skipping.`);
          continue;
        }

        const mergedConfig = { ...(this.config.globalConfig ?? {}), ...(adapterConfig.options ?? {}) };
        const instance: BridgeAdapter = new AdapterClass(mergedConfig);

        await this.initializeAdapter(instance);
        this.registry.register(instance, { source: resolvedPath, configKey: name });
      } catch (err) {
        throw new BridgeLoadException(resolvedPath, err as Error);
      }
    }
  }

  /**
   * Programmatically register a pre-instantiated adapter at runtime.
   */
  async registerAdapter(adapter: BridgeAdapter, options?: Record<string, unknown>): Promise<void> {
    await this.initializeAdapter(adapter);
    this.registry.register(adapter, { ...options, source: 'runtime-injection' });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private extractAdapterClass(mod: Record<string, unknown>): BridgeAdapterConstructor | null {
    // Check default export
    if (mod.default && this.isAdapterClass(mod.default)) {
      return mod.default as BridgeAdapterConstructor;
    }

    // Check named exports
    for (const key of Object.keys(mod)) {
      if (this.isAdapterClass(mod[key])) {
        return mod[key] as BridgeAdapterConstructor;
      }
    }

    return null;
  }

  private isAdapterClass(value: unknown): boolean {
    if (typeof value !== 'function') return false;

    // Check for @BridgePlugin decorator metadata
    if (Reflect.hasMetadata(BRIDGE_ADAPTER_METADATA, value)) return true;

    // Duck-type check: prototype must have required BridgeAdapter methods
    const proto = (value as { prototype?: Record<string, unknown> }).prototype;
    if (!proto) return false;

    return (
      typeof proto['initialize'] === 'function' &&
      typeof proto['execute'] === 'function' &&
      typeof proto['isHealthy'] === 'function' &&
      typeof proto['shutdown'] === 'function'
    );
  }

  private async initializeAdapter(adapter: BridgeAdapter): Promise<void> {
    try {
      await adapter.initialize(this.config.globalConfig);
      this.logger.log(`Initialized bridge adapter: "${adapter.name}"`);
    } catch (err) {
      throw new BridgeInitializationException(adapter.name, err as Error);
    }
  }
}
