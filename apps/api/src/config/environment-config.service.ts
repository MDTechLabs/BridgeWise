import { Injectable } from '@nestjs/common';
import { AppConfig, ConfigFactory } from './config-factory';

/**
 * Application Configuration Service
 * Provides access to application configuration loaded from environment variables
 * Supports environment-based configuration (development, staging, production)
 */
@Injectable()
export class EnvironmentConfigService {
  private readonly appConfig: AppConfig;

  constructor() {
    this.appConfig = ConfigFactory.create();
  }

  /**
   * Get entire application configuration
   */
  getConfig(): AppConfig {
    return this.appConfig;
  }

  /**
   * Get configuration for a specific section
   */
  getSection<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.appConfig[key];
  }

  /**
   * Get database configuration
   */
  getDatabaseConfig() {
    return this.appConfig.database;
  }

  /**
   * Get RPC configuration
   */
  getRpcConfig() {
    return this.appConfig.rpc;
  }

  /**
   * Get server configuration
   */
  getServerConfig() {
    return this.appConfig.server;
  }

  /**
   * Get API configuration
   */
  getApiConfig() {
    return this.appConfig.api;
  }

  /**
   * Get logging configuration
   */
  getLoggingConfig() {
    return this.appConfig.logging;
  }

  /**
   * Get feature flags configuration
   */
  getFeatures() {
    return this.appConfig.features;
  }

  /**
   * Check if specific feature is enabled
   */
  isFeatureEnabled(featureName: keyof typeof this.appConfig.features): boolean {
    return this.appConfig.features[featureName];
  }

  /**
   * Get RPC URL for a specific network
   */
  getRpcUrl(
    network: 'ethereum' | 'polygon' | 'bsc' | 'arbitrum' | 'optimism',
  ): string {
    return this.appConfig.rpc[network];
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return this.appConfig.nodeEnv === 'production';
  }

  /**
   * Check if running in staging
   */
  isStaging(): boolean {
    return this.appConfig.nodeEnv === 'staging';
  }

  /**
   * Check if running in development
   */
  isDevelopment(): boolean {
    return this.appConfig.nodeEnv === 'development';
  }

  /**
   * Get current environment
   */
  getEnvironment() {
    return this.appConfig.nodeEnv;
  }
}
