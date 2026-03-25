import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfig, Environment } from './config.interface';
import { ApiKeyVaultService } from '../security/api-key-vault.service';

@Injectable()
export class ConfigService implements OnModuleInit {
  private readonly logger = new Logger(ConfigService.name);
  private readonly config: AppConfig;
  private vaultInitialized = false;

  constructor(private readonly apiKeyVault: ApiKeyVaultService) {
    this.config = this.createConfig();
    this.validateConfig();
  }

  async onModuleInit() {
    // Initialize vault with keys from environment
    this.initializeVault();
    this.vaultInitialized = true;
  }

  private initializeVault(): void {
    try {
      // Store API key in vault
      const apiKey = process.env.API_KEY;
      if (apiKey) {
        this.apiKeyVault.storeKey('api-key-main', apiKey);
        this.logger.debug('API key stored in vault');
      }

      // Store API secret in vault if present
      const apiSecret = process.env.API_SECRET;
      if (apiSecret) {
        this.apiKeyVault.storeKey('api-secret-main', apiSecret);
        this.logger.debug('API secret stored in vault');
      }

      // Store database password in vault
      const dbPassword = process.env.DB_PASSWORD;
      if (dbPassword) {
        this.apiKeyVault.storeKey('db-password', dbPassword);
        this.logger.debug('Database password stored in vault');
      }
    } catch (error) {
      this.logger.error(`Failed to initialize vault: ${error.message}`);
      // Continue anyway - vault is optional for development
    }
  }

  private createConfig(): AppConfig {
    const nodeEnv = (process.env.NODE_ENV || 'development') as Environment;

    const baseConfig = {
      nodeEnv,
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME || 'postgres',
        password: '', // NEVER store password in config - use vault
        database: process.env.DB_NAME || 'bridgewise',
        ssl: nodeEnv === 'production' ? process.env.DB_SSL === 'true' : false,
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
      api: {
        apiKey: '', // NEVER store in config - use vault
        apiSecret: '', // NEVER store in config - use vault
        baseUrl: process.env.API_BASE_URL || 'https://api.bridgewise.com',
        timeout: parseInt(process.env.API_TIMEOUT || '30000', 10),
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
      },
      logging: {
        level: (process.env.LOG_LEVEL || 'info') as
          | 'error'
          | 'warn'
          | 'info'
          | 'debug'
          | 'verbose',
        format: (process.env.LOG_FORMAT || 'simple') as 'json' | 'simple',
      },
    };

    return this.applyEnvironmentOverrides(baseConfig, nodeEnv);
  }

  private applyEnvironmentOverrides(
    baseConfig: AppConfig,
    env: Environment,
  ): AppConfig {
    const overrides = this.getEnvironmentOverrides(env);
    return this.mergeConfigs(baseConfig, overrides);
  }

  private getEnvironmentOverrides(env: Environment): Partial<AppConfig> {
    switch (env) {
      case 'development':
        return {
          logging: {
            level: 'debug',
            format: 'simple',
          },
        };
      case 'staging':
        return {
          logging: {
            level: 'info',
            format: 'json',
          },
        };
      case 'production':
        return {
          logging: {
            level: 'warn',
            format: 'json',
          },
        };
      default:
        return {};
    }
  }

  private mergeConfigs(
    base: AppConfig,
    overrides: Partial<AppConfig>,
  ): AppConfig {
    return {
      ...base,
      ...overrides,
      database: { ...base.database, ...overrides.database },
      rpc: { ...base.rpc, ...overrides.rpc },
      api: { ...base.api, ...overrides.api },
      server: {
        ...base.server,
        ...overrides.server,
        cors: { ...base.server.cors, ...overrides.server?.cors },
      },
      logging: { ...base.logging, ...overrides.logging },
    };
  }

  private parseCorsOrigins(origins: string): string | string[] {
    if (origins === '*') return '*';
    return origins.split(',').map((origin) => origin.trim());
  }

  private validateConfig(): void {
    // Check that environment variables are set, but don't store their values
    const requiredEnvVars = [
      { key: 'API_KEY', value: process.env.API_KEY },
      { key: 'DB_PASSWORD', value: process.env.DB_PASSWORD },
    ];

    const missing = requiredEnvVars.filter((field) => !field.value);

    if (missing.length > 0) {
      this.logger.warn(
        `Missing recommended environment variables: ${missing.map((f) => f.key).join(', ')}`,
      );
    }

    if (this.config.nodeEnv === 'production') {
      const productionRequired = [
        { key: 'API_KEY', value: process.env.API_KEY },
        { key: 'DB_PASSWORD', value: process.env.DB_PASSWORD },
        { key: 'VAULT_ENCRYPTION_KEY', value: process.env.VAULT_ENCRYPTION_KEY },
      ];

      const missingProduction = productionRequired.filter(
        (field) => !field.value,
      );

      if (missingProduction.length > 0) {
        throw new Error(
          `Missing required environment variables for production: ${missingProduction.map((f) => f.key).join(', ')}`,
        );
      }
    }
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  get all(): AppConfig {
    return { ...this.config };
  }

  get isDevelopment(): boolean {
    return this.config.nodeEnv === 'development';
  }

  get isStaging(): boolean {
    return this.config.nodeEnv === 'staging';
  }

  get isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }

  /**
   * Retrieve API key from vault
   * Should only be used server-side
   */
  getApiKey(): string {
    try {
      return this.apiKeyVault.retrieveKey('api-key-main');
    } catch (error) {
      this.logger.warn('Failed to retrieve API key from vault');
      return '';
    }
  }

  /**
   * Retrieve API secret from vault
   * Should only be used server-side
   */
  getApiSecret(): string {
    try {
      return this.apiKeyVault.retrieveKey('api-secret-main');
    } catch (error) {
      this.logger.warn('Failed to retrieve API secret from vault');
      return '';
    }
  }

  /**
   * Retrieve database password from vault
   * Should only be used server-side
   */
  getDatabasePassword(): string {
    try {
      return this.apiKeyVault.retrieveKey('db-password');
    } catch (error) {
      this.logger.warn('Failed to retrieve database password from vault');
      return this.config.database.password;
    }
  }
}
