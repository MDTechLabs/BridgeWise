export interface EnvValidationSchema {
  [key: string]: {
    required?: boolean;
    type: 'string' | 'number' | 'boolean' | 'url' | 'email';
    default?: string | number | boolean;
    description?: string;
  };
}

export const ENV_VALIDATION_SCHEMA: EnvValidationSchema = {
  NODE_ENV: {
    required: false,
    type: 'string',
    default: 'development',
    description: 'Application environment (development, staging, production)',
  },
  PORT: {
    required: false,
    type: 'number',
    default: 3000,
    description: 'Server port',
  },
  HOST: {
    required: false,
    type: 'string',
    default: '0.0.0.0',
    description: 'Server host',
  },
  DB_HOST: {
    required: true,
    type: 'string',
    description: 'Database host',
  },
  DB_PORT: {
    required: false,
    type: 'number',
    default: 5432,
    description: 'Database port',
  },
  DB_USERNAME: {
    required: true,
    type: 'string',
    description: 'Database username',
  },
  DB_PASSWORD: {
    required: true,
    type: 'string',
    description: 'Database password',
  },
  DB_NAME: {
    required: true,
    type: 'string',
    description: 'Database name',
  },
  DB_SSL: {
    required: false,
    type: 'boolean',
    default: false,
    description: 'Database SSL connection',
  },
  API_KEY: {
    required: true,
    type: 'string',
    description: 'External API key',
  },
  API_SECRET: {
    required: false,
    type: 'string',
    description: 'External API secret',
  },
  API_BASE_URL: {
    required: false,
    type: 'url',
    default: 'https://api.bridgewise.com',
    description: 'API base URL',
  },
  API_TIMEOUT: {
    required: false,
    type: 'number',
    default: 30000,
    description: 'API request timeout in milliseconds',
  },
  RPC_ETHEREUM: {
    required: true,
    type: 'url',
    description: 'Ethereum RPC URL',
  },
  RPC_POLYGON: {
    required: true,
    type: 'url',
    description: 'Polygon RPC URL',
  },
  RPC_BSC: {
    required: true,
    type: 'url',
    description: 'BSC RPC URL',
  },
  RPC_ARBITRUM: {
    required: true,
    type: 'url',
    description: 'Arbitrum RPC URL',
  },
  RPC_OPTIMISM: {
    required: true,
    type: 'url',
    description: 'Optimism RPC URL',
  },
  CORS_ORIGIN: {
    required: false,
    type: 'string',
    default: 'http://localhost:3000',
    description: 'CORS allowed origins (comma-separated)',
  },
  CORS_CREDENTIALS: {
    required: false,
    type: 'boolean',
    default: false,
    description: 'CORS credentials allowed',
  },
  LOG_LEVEL: {
    required: false,
    type: 'string',
    default: 'info',
    description: 'Logging level (error, warn, info, debug, verbose)',
  },
  LOG_FORMAT: {
    required: false,
    type: 'string',
    default: 'simple',
    description: 'Log format (json, simple)',
  },
};

export function validateEnvironment(env: Record<string, string | undefined>): void {
  const errors: string[] = [];

  for (const [key, schema] of Object.entries(ENV_VALIDATION_SCHEMA)) {
    const value = env[key];

    if (schema.required && !value) {
      errors.push(`Missing required environment variable: ${key} (${schema.description})`);
      continue;
    }

    if (!value && schema.default !== undefined) {
      continue;
    }

    if (value && !validateType(value, schema.type)) {
      errors.push(`Invalid type for ${key}: expected ${schema.type}, got ${typeof value}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }
}

function validateType(value: string, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return !isNaN(Number(value));
    case 'boolean':
      return value === 'true' || value === 'false';
    case 'url':
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    default:
      return true;
  }
}
