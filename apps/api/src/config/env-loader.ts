import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';

export type Environment = 'development' | 'staging' | 'production';

/**
 * Loads environment-specific .env files
 * Priority order:
 * 1. .env.{NODE_ENV}.local
 * 2. .env.{NODE_ENV}
 * 3. .env.local
 * 4. .env
 */
export class EnvironmentLoader {
  private readonly logger = new Logger(EnvironmentLoader.name);
  private loaded = false;

  constructor(private readonly envDir: string = process.cwd()) {}

  /**
   * Load environment variables from .env files
   */
  load(): void {
    if (this.loaded) {
      return;
    }

    const nodeEnv = (process.env.NODE_ENV as Environment) || 'development';
    const envFiles = this.getEnvFilesByPriority(nodeEnv);

    for (const envFile of envFiles) {
      const envPath = path.join(this.envDir, envFile);
      if (fs.existsSync(envPath)) {
        this.loadEnvFile(envPath);
        this.logger.debug(`Loaded environment from: ${envFile}`);
      }
    }

    this.loaded = true;
  }

  /**
   * Get ordered list of .env files to load based on environment
   */
  private getEnvFilesByPriority(nodeEnv: Environment): string[] {
    return [
      `.env.${nodeEnv}.local`, // Highest priority - uncommitted overrides
      `.env.${nodeEnv}`, // Environment-specific config
      '.env.local', // Local overrides for all environments
      '.env', // Default configuration
    ];
  }

  /**
   * Parse and load env file into process.env
   */
  private loadEnvFile(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();

        // Skip empty lines and comments
        if (!trimmedLine || trimmedLine.startsWith('#')) {
          continue;
        }

        const [key, ...valueParts] = trimmedLine.split('=');
        const value = valueParts.join('=').trim();

        // Remove quotes if present
        const cleanValue = this.parseValue(value);

        // Only set if not already set (allow process.env to take precedence)
        if (!process.env[key]) {
          process.env[key] = cleanValue;
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to load env file ${filePath}: ${error.message}`,
      );
    }
  }

  /**
   * Parse environment variable value, handling quotes and escaped characters
   */
  private parseValue(value: string): string {
    // Handle quoted values
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }

    // Handle inline comments after unquoted values
    const commentIndex = value.indexOf('#');
    if (commentIndex !== -1) {
      return value.substring(0, commentIndex).trim();
    }

    return value;
  }

  /**
   * Get the current environment
   */
  static getEnvironment(): Environment {
    return (process.env.NODE_ENV as Environment) || 'development';
  }

  /**
   * Check if running in production
   */
  static isProduction(): boolean {
    return EnvironmentLoader.getEnvironment() === 'production';
  }

  /**
   * Check if running in staging
   */
  static isStaging(): boolean {
    return EnvironmentLoader.getEnvironment() === 'staging';
  }

  /**
   * Check if running in development
   */
  static isDevelopment(): boolean {
    return EnvironmentLoader.getEnvironment() === 'development';
  }
}
