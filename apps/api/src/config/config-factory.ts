import { Logger } from '@nestjs/common';
import { Environment, EnvironmentLoader } from './env-loader';
import { EnvironmentValidator } from './env-schema';

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  logging: boolean;
  synchronize: boolean;
}

export interface RpcConfig {
  ethereum: string;
  polygon: string;
  bsc: string;
  arbitrum: string;
  optimism: string;
}

export interface CorsConfig {
  origin: string | string[];
  credentials: boolean;
}

export interface ServerConfig {
  port: number;
  host: string;
  cors: CorsConfig;
  forceHttps: boolean;
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
  format: 'json' | 'simple';
}

export interface ApiConfig {
  baseUrl: string;
  timeout: number;
}

export interface AppConfig {
  nodeEnv: Environment;
  database: DatabaseConfig;
  rpc: RpcConfig;
  server: ServerConfig;
  logging: LoggingConfig;
  api: ApiConfig;
  features: {
    enableAnalytics: boolean;
    enableBenchmarking: boolean;
    enableBridgeCompare: boolean;
    enableGasEstimation: boolean;
    enableRealTimeFees: boolean;
    enableBridgeDiscovery: boolean;
    enableReliabilityScore: boolean;
  };
}

type AppConfigOverrides = Partial<
  Omit<
    AppConfig,
    'database' | 'rpc' | 'server' | 'logging' | 'api' | 'features'
  >
> & {
  database?: Partial<DatabaseConfig>;
  rpc?: Partial<RpcConfig>;
  server?: Partial<ServerConfig>;
  logging?: Partial<LoggingConfig>;
  api?: Partial<ApiConfig>;
  features?: Partial<AppConfig['features']>;
};

/**
 * Configuration Factory
 * Creates environment-specific configurations
 */
export class ConfigFactory {
  private static readonly logger = new Logger(ConfigFactory.name);

  /**
   * Create configuration for the current environment
   */
  static create(): AppConfig {
    // Load environment variables from .env files
    const loader = new EnvironmentLoader();
    loader.load();

    const environment = EnvironmentLoader.getEnvironment();

    // Validate environment
    const validation = EnvironmentValidator.validate(environment);
    if (!validation.valid) {
      const errorMessages = validation.errors
        .map((e) => `  - ${e.key}: ${e.error}`)
        .join('\n');
      throw new Error(`Environment validation failed:\n${errorMessages}`);
    }

    if (validation.warnings.length > 0) {
      validation.warnings.forEach((w) => {
        this.logger.warn(`[${w.key}] ${w.warning}`);
      });
    }

    // Create base configuration
    const baseConfig = this.createBaseConfig(environment);

    // Apply environment-specific overrides
    const finalConfig = this.applyEnvironmentOverrides(baseConfig, environment);

    this.logger.debug(`Configuration loaded for environment: ${environment}`);

    return finalConfig;
  }

  /**
   * Create base configuration from environment variables
   */
  private static createBaseConfig(environment: Environment): AppConfig {
    return {
      nodeEnv: environment,
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'bridgewise',
        ssl: process.env.DB_SSL === 'true',
        logging: environment === 'development',
        synchronize: environment === 'development',
      },
      rpc: {
        ethereum:
          process.env.RPC_ETHEREUM ||
          'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
        polygon: process.env.RPC_POLYGON || 'https://polygon-rpc.com',
        bsc: process.env.RPC_BSC || 'https://bsc-dataseed.binance.org',
        arbitrum: process.env.RPC_ARBITRUM || 'https://arb1.arbitrum.io/rpc',
        optimism: process.env.RPC_OPTIMISM || 'https://mainnet.optimism.io',
      },
      server: {
        port: parseInt(process.env.PORT || '3000', 10),
        host: process.env.HOST || '0.0.0.0',
        cors: {
          origin: this.parseCorsOrigins(
            process.env.CORS_ORIGIN || 'http://localhost:3000',
          ),
          credentials: process.env.CORS_CREDENTIALS === 'true',
        },
        forceHttps: process.env.FORCE_HTTPS === 'true',
      },
      logging: {
        level: (process.env.LOG_LEVEL || 'info') as LoggingConfig['level'],
        format: (process.env.LOG_FORMAT || 'simple') as LoggingConfig['format'],
      },
      api: {
        baseUrl: process.env.API_BASE_URL || 'https://api.bridgewise.com',
        timeout: parseInt(process.env.API_TIMEOUT || '30000', 10),
      },
      features: {
        enableAnalytics: process.env.ENABLE_ANALYTICS !== 'false',
        enableBenchmarking: process.env.ENABLE_BENCHMARKING === 'true',
        enableBridgeCompare: process.env.ENABLE_BRIDGE_COMPARE !== 'false',
        enableGasEstimation: process.env.ENABLE_GAS_ESTIMATION !== 'false',
        enableRealTimeFees: process.env.ENABLE_REAL_TIME_FEES !== 'false',
        enableBridgeDiscovery: process.env.ENABLE_BRIDGE_DISCOVERY !== 'false',
        enableReliabilityScore: process.env.ENABLE_RELIABILITY_SCORE !== 'false',
      },
    };
  }

  /**
   * Apply environment-specific configuration overrides
   */
  private static applyEnvironmentOverrides(
    baseConfig: AppConfig,
    environment: Environment,
  ): AppConfig {
    const overrides = this.getEnvironmentOverrides(environment);
    return this.mergeConfigs(baseConfig, overrides);
  }

  /**
   * Get environment-specific overrides
   */
  private static getEnvironmentOverrides(
    environment: Environment,
  ): AppConfigOverrides {
    switch (environment) {
      case 'development':
        return {
          database: {
            logging: true,
            synchronize: true,
          } as Partial<DatabaseConfig>,
          logging: {
            level: 'debug',
            format: 'simple',
          },
        };

      case 'staging':
        return {
          database: {
            logging: false,
            synchronize: false,
            ssl: true,
          } as Partial<DatabaseConfig>,
          logging: {
            level: 'info',
            format: 'json',
          },
        };

      case 'production':
        return {
          database: {
            logging: false,
            synchronize: false,
            ssl: true,
          } as Partial<DatabaseConfig>,
          logging: {
            level: 'warn',
            format: 'json',
          },
          server: {
            forceHttps: true,
          } as Partial<ServerConfig>,
        };

      default:
        return {};
    }
  }

  /**
   * Deep merge configuration objects
   */
  private static mergeConfigs(
    base: AppConfig,
    overrides: AppConfigOverrides,
  ): AppConfig {
    const dbOverrides = overrides.database;
    const rpcOverrides = overrides.rpc;
    const apiOverrides = overrides.api;
    const serverOverrides = overrides.server;
    const loggingOverrides = overrides.logging;
    const featuresOverrides = overrides.features;

    return {
      ...base,
      ...overrides,
      database: { ...base.database, ...dbOverrides },
      rpc: { ...base.rpc, ...rpcOverrides },
      api: { ...base.api, ...apiOverrides },
      server: {
        ...base.server,
        ...serverOverrides,
        cors: { ...base.server.cors, ...serverOverrides?.cors },
      },
      logging: { ...base.logging, ...loggingOverrides },
      features: { ...base.features, ...featuresOverrides },
    };
  }

  /**
   * Parse CORS origins from comma-separated string
   */
  private static parseCorsOrigins(origins: string): string | string[] {
    if (origins === '*') {
      return '*';
    }
    return origins
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }
}
