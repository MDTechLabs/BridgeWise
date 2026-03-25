import { Environment } from './env-loader';

export interface EnvironmentVarDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'url' | 'json';
  required?: boolean;
  default?: string | number | boolean;
  description?: string;
  allowedValues?: (string | number | boolean)[];
  requiredIn?: Environment[];
  example?: string;
}

export interface EnvironmentSchema {
  [key: string]: EnvironmentVarDefinition;
}

/**
 * Schema for environment variables
 * Defines requirements per environment (dev, staging, prod)
 */
export const ENV_SCHEMA: EnvironmentSchema = {
  // ========== Node Environment ==========
  NODE_ENV: {
    name: 'NODE_ENV',
    type: 'string',
    required: false,
    default: 'development',
    allowedValues: ['development', 'staging', 'production'],
    description: 'Application environment',
    example: 'production',
  },

  // ========== Server Configuration ==========
  PORT: {
    name: 'PORT',
    type: 'number',
    required: false,
    default: 3000,
    description: 'Server port',
    example: '3000',
  },
  HOST: {
    name: 'HOST',
    type: 'string',
    required: false,
    default: '0.0.0.0',
    description: 'Server host binding',
    example: '0.0.0.0',
  },

  // ========== Database Configuration ==========
  DB_HOST: {
    name: 'DB_HOST',
    type: 'string',
    required: true,
    description: 'PostgreSQL database host',
    example: 'localhost',
  },
  DB_PORT: {
    name: 'DB_PORT',
    type: 'number',
    required: false,
    default: 5432,
    description: 'PostgreSQL database port',
    example: '5432',
  },
  DB_USERNAME: {
    name: 'DB_USERNAME',
    type: 'string',
    required: true,
    description: 'Database username',
    example: 'postgres',
  },
  DB_PASSWORD: {
    name: 'DB_PASSWORD',
    type: 'string',
    required: true,
    requiredIn: ['production', 'staging'],
    description: 'Database password (use vault in production)',
    example: 'your-secure-password',
  },
  DB_NAME: {
    name: 'DB_NAME',
    type: 'string',
    required: true,
    description: 'Database name',
    example: 'bridgewise_dev',
  },
  DB_SSL: {
    name: 'DB_SSL',
    type: 'boolean',
    required: false,
    default: false,
    requiredIn: ['production'],
    description: 'Enable SSL for database connection',
    example: 'true',
  },

  // ========== Security Configuration ==========
  VAULT_ENCRYPTION_KEY: {
    name: 'VAULT_ENCRYPTION_KEY',
    type: 'string',
    required: false,
    requiredIn: ['production'],
    description:
      "Encryption key for API key vault - Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    example: 'abc123def456ghi789jkl012mno345pqr678stu901',
  },

  // ========== API Configuration ==========
  API_KEY: {
    name: 'API_KEY',
    type: 'string',
    required: true,
    description: 'External API key (stored in vault)',
    example: 'sk_live_xxxxx',
  },
  API_SECRET: {
    name: 'API_SECRET',
    type: 'string',
    required: false,
    description: 'External API secret (stored in vault)',
    example: 'secret_xxxxx',
  },
  API_BASE_URL: {
    name: 'API_BASE_URL',
    type: 'url',
    required: false,
    default: 'https://api.bridgewise.com',
    description: 'External API base URL',
    example: 'https://api.bridgewise.com',
  },
  API_TIMEOUT: {
    name: 'API_TIMEOUT',
    type: 'number',
    required: false,
    default: 30000,
    description: 'API request timeout in milliseconds',
    example: '30000',
  },

  // ========== RPC URLs ==========
  RPC_ETHEREUM: {
    name: 'RPC_ETHEREUM',
    type: 'url',
    required: true,
    description: 'Ethereum RPC endpoint URL',
    example: 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
  },
  RPC_POLYGON: {
    name: 'RPC_POLYGON',
    type: 'url',
    required: true,
    description: 'Polygon RPC endpoint URL',
    example: 'https://polygon-rpc.com',
  },
  RPC_BSC: {
    name: 'RPC_BSC',
    type: 'url',
    required: true,
    description: 'BSC RPC endpoint URL',
    example: 'https://bsc-dataseed.binance.org',
  },
  RPC_ARBITRUM: {
    name: 'RPC_ARBITRUM',
    type: 'url',
    required: true,
    description: 'Arbitrum RPC endpoint URL',
    example: 'https://arb1.arbitrum.io/rpc',
  },
  RPC_OPTIMISM: {
    name: 'RPC_OPTIMISM',
    type: 'url',
    required: true,
    description: 'Optimism RPC endpoint URL',
    example: 'https://mainnet.optimism.io',
  },

  // ========== CORS Configuration ==========
  CORS_ORIGIN: {
    name: 'CORS_ORIGIN',
    type: 'string',
    required: false,
    default: 'http://localhost:3000',
    description:
      'Comma-separated list of allowed CORS origins (use specific domains in production, never use * in production)',
    example: 'https://app.bridgewise.com,https://admin.bridgewise.com',
  },
  CORS_CREDENTIALS: {
    name: 'CORS_CREDENTIALS',
    type: 'boolean',
    required: false,
    default: false,
    description: 'Allow credentials in CORS requests',
    example: 'true',
  },

  // ========== HTTPS Configuration ==========
  FORCE_HTTPS: {
    name: 'FORCE_HTTPS',
    type: 'boolean',
    required: false,
    default: false,
    requiredIn: ['production'],
    description: 'Force HTTPS for all requests',
    example: 'true',
  },

  // ========== Logging Configuration ==========
  LOG_LEVEL: {
    name: 'LOG_LEVEL',
    type: 'string',
    required: false,
    default: 'info',
    allowedValues: ['error', 'warn', 'info', 'debug', 'verbose'],
    description: 'Logging level',
    example: 'debug',
  },
  LOG_FORMAT: {
    name: 'LOG_FORMAT',
    type: 'string',
    required: false,
    default: 'simple',
    allowedValues: ['simple', 'json'],
    description: 'Logging format',
    example: 'json',
  },

  // ========== Feature Flags ==========
  ENABLE_ANALYTICS: {
    name: 'ENABLE_ANALYTICS',
    type: 'boolean',
    required: false,
    default: true,
    description: 'Enable analytics collection',
    example: 'true',
  },
  ENABLE_BENCHMARKING: {
    name: 'ENABLE_BENCHMARKING',
    type: 'boolean',
    required: false,
    default: false,
    description: 'Enable benchmarking features',
    example: 'false',
  },
};

/**
 * Validates environment variables against the schema
 */
export class EnvironmentValidator {
  /**
   * Validate a specific environment configuration
   */
  static validate(env: Environment): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    Object.entries(ENV_SCHEMA).forEach(([envKey, definition]) => {
      const value = process.env[envKey];
      const isRequired =
        definition.required || definition.requiredIn?.includes(env);

      // Check if required variable is missing
      if (isRequired && !value) {
        errors.push({
          key: envKey,
          error: `Required environment variable "${envKey}" is not set`,
          severity: 'error',
          environment: env,
        });
        return;
      }

      // Skip validation if not provided and not required
      if (!value) {
        return;
      }

      // Validate type
      const typeValidation = this.validateType(value, definition.type, envKey);
      if (!typeValidation.valid) {
        errors.push({
          key: envKey,
          error: typeValidation.error || `Invalid type for "${envKey}"`,
          severity: 'error',
          environment: env,
        });
      }

      // Validate allowed values
      if (
        definition.allowedValues &&
        !definition.allowedValues.includes(value)
      ) {
        errors.push({
          key: envKey,
          error: `"${envKey}" must be one of: ${definition.allowedValues.join(', ')}. Got: ${value}`,
          severity: 'error',
          environment: env,
        });
      }
    });

    // Production-specific warnings
    if (env === 'production') {
      const productionWarnings = this.validateProduction();
      warnings.push(...productionWarnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate type of environment variable value
   */
  private static validateType(
    value: string,
    type: EnvironmentVarDefinition['type'],
    key: string,
  ): { valid: boolean; error?: string } {
    switch (type) {
      case 'number':
        if (isNaN(Number(value))) {
          return { valid: false, error: `"${key}" must be a number` };
        }
        break;
      case 'boolean':
        if (!['true', 'false'].includes(value.toLowerCase())) {
          return { valid: false, error: `"${key}" must be 'true' or 'false'` };
        }
        break;
      case 'url':
        try {
          new URL(value);
        } catch {
          return { valid: false, error: `"${key}" must be a valid URL` };
        }
        break;
      case 'json':
        try {
          JSON.parse(value);
        } catch {
          return { valid: false, error: `"${key}" must be valid JSON` };
        }
        break;
    }
    return { valid: true };
  }

  /**
   * Validate production-specific requirements
   */
  private static validateProduction(): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Check FORCE_HTTPS
    if (process.env.FORCE_HTTPS !== 'true') {
      warnings.push({
        key: 'FORCE_HTTPS',
        warning: 'FORCE_HTTPS should be set to true in production',
        severity: 'warning',
        environment: 'production',
      });
    }

    // Check CORS_ORIGIN
    const corsOrigin = process.env.CORS_ORIGIN || '';
    if (corsOrigin === '*') {
      warnings.push({
        key: 'CORS_ORIGIN',
        warning:
          'CORS_ORIGIN is set to * (wildcard) - restrict to specific domains in production',
        severity: 'warning',
        environment: 'production',
      });
    }

    // Check DB_SSL
    if (process.env.DB_SSL !== 'true') {
      warnings.push({
        key: 'DB_SSL',
        warning: 'DB_SSL should be true in production',
        severity: 'warning',
        environment: 'production',
      });
    }

    // Check LOG_LEVEL
    if (
      process.env.LOG_LEVEL === 'debug' ||
      process.env.LOG_LEVEL === 'verbose'
    ) {
      warnings.push({
        key: 'LOG_LEVEL',
        warning:
          'LOG_LEVEL is set to debug/verbose - should be info/warn in production',
        severity: 'warning',
        environment: 'production',
      });
    }

    return warnings;
  }

  /**
   * Generate a report of all environment variables
   */
  static generateReport(): EnvironmentReport {
    const schemaVars = Object.entries(ENV_SCHEMA).map(([key, def]) => ({
      name: key,
      ...def,
      currentValue: process.env[key] ? '***REDACTED***' : undefined,
    }));

    return {
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      variables: schemaVars,
      total: schemaVars.length,
      configured: schemaVars.filter((v) => process.env[v.name]).length,
    };
  }
}

export interface ValidationError {
  key: string;
  error: string;
  severity: 'error' | 'warning';
  environment: Environment;
}

export interface ValidationWarning {
  key: string;
  warning: string;
  severity: 'warning';
  environment: Environment;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface EnvironmentReport {
  environment: string;
  timestamp: string;
  variables: Array<EnvironmentVarDefinition & { currentValue?: string }>;
  total: number;
  configured: number;
}
