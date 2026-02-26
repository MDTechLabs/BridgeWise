import {
  DynamicModule,
  FactoryProvider,
  Module,
  ModuleMetadata,
  Provider,
  Type,
} from '@nestjs/common';
import { BridgeModuleConfig } from '../interfaces/bridge-config.interface';
import { BRIDGE_MODULE_CONFIG } from '../interfaces/bridge.tokens';
import { BridgeRegistry } from '../registry/bridge.registry';
import { BridgeLoader } from '../loaders/bridge.loader';
import { BridgeService } from '../bridge.service';

export interface BridgeModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: unknown[]) => Promise<BridgeModuleConfig> | BridgeModuleConfig;
  inject?: FactoryProvider['inject'];
  extraProviders?: Provider[];
}

@Module({})
export class BridgeModule {
  /**
   * Register the BridgeModule synchronously with a static config.
   */
  static forRoot(config: BridgeModuleConfig = {}): DynamicModule {
    return {
      module: BridgeModule,
      global: true,
      providers: [
        {
          provide: BRIDGE_MODULE_CONFIG,
          useValue: config,
        },
        BridgeRegistry,
        {
          provide: BridgeLoader,
          useFactory: (registry: BridgeRegistry) => new BridgeLoader(registry, config),
          inject: [BridgeRegistry],
        },
        BridgeService,
      ],
      exports: [BridgeRegistry, BridgeService, BridgeLoader],
    };
  }

  /**
   * Register the BridgeModule asynchronously (e.g., reading config from ConfigService).
   */
  static forRootAsync(options: BridgeModuleAsyncOptions): DynamicModule {
    const configProvider: Provider = {
      provide: BRIDGE_MODULE_CONFIG,
      useFactory: options.useFactory,
      inject: options.inject ?? [],
    };

    const loaderProvider: Provider = {
      provide: BridgeLoader,
      useFactory: (registry: BridgeRegistry, config: BridgeModuleConfig) =>
        new BridgeLoader(registry, config),
      inject: [BridgeRegistry, BRIDGE_MODULE_CONFIG],
    };

    return {
      module: BridgeModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        configProvider,
        BridgeRegistry,
        loaderProvider,
        BridgeService,
        ...(options.extraProviders ?? []),
      ],
      exports: [BridgeRegistry, BridgeService, BridgeLoader],
    };
  }

  /**
   * Register a feature module that injects additional bridge adapters.
   * Use this inside feature modules to register bridges without modifying core.
   */
  static forFeature(adapters: Type<unknown>[]): DynamicModule {
    return {
      module: BridgeModule,
      providers: adapters,
      exports: adapters,
    };
  }
}
