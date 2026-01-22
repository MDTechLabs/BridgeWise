# Configuration Module

A centralized configuration system for BridgeWise that handles environment variables, RPC URLs, and API keys with secure secret management.

## Features

- **Environment-based configuration**: Support for development, staging, and production environments
- **Secure secret handling**: No hardcoded secrets, environment-based loading
- **Dependency injection**: Injectable service available across all modules
- **Type safety**: Full TypeScript support with interfaces
- **Validation**: Environment variable validation with error reporting
- **Flexible overrides**: Environment-specific configuration overrides

## Usage

### Basic Usage

```typescript
import { ConfigService } from './config/config.service';

@Injectable()
export class MyService {
  constructor(private readonly configService: ConfigService) {}

  getApiKey(): string {
    return this.configService.get('api').apiKey;
  }

  getDatabaseConfig() {
    return this.configService.get('database');
  }
}
```

### Environment Detection

```typescript
if (this.configService.isProduction) {
  // Production-specific logic
} else if (this.configService.isDevelopment) {
  // Development-specific logic
}
```

### Accessing Configuration

```typescript
// Get specific configuration section
const dbConfig = this.configService.get('database');
const rpcUrls = this.configService.get('rpc');

// Get entire configuration
const allConfig = this.configService.all;
```

## Environment Variables

### Required Variables

- `API_KEY`: External API key
- `DB_HOST`: Database host
- `DB_USERNAME`: Database username  
- `DB_PASSWORD`: Database password
- `DB_NAME`: Database name
- `RPC_ETHEREUM`: Ethereum RPC URL
- `RPC_POLYGON`: Polygon RPC URL
- `RPC_BSC`: BSC RPC URL
- `RPC_ARBITRUM`: Arbitrum RPC URL
- `RPC_OPTIMISM`: Optimism RPC URL

### Optional Variables

- `NODE_ENV`: Environment (development, staging, production)
- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: 0.0.0.0)
- `DB_PORT`: Database port (default: 5432)
- `DB_SSL`: Database SSL (default: false)
- `API_SECRET`: API secret
- `API_BASE_URL`: API base URL
- `API_TIMEOUT`: API timeout (default: 30000ms)
- `CORS_ORIGIN`: CORS origins
- `CORS_CREDENTIALS`: CORS credentials
- `LOG_LEVEL`: Logging level
- `LOG_FORMAT`: Log format

## Environment Files

Copy the appropriate example file:

```bash
# Development
cp .env.example .env

# Staging  
cp .env.staging.example .env.staging

# Production
cp .env.production.example .env.production
```

## Security

- Environment files are gitignored (`.env*`)
- Secrets are never committed to the repository
- Production requires all required environment variables
- Validation ensures missing variables are caught early

## Environment Overrides

The configuration system applies environment-specific overrides:

- **Development**: Debug logging, no SSL
- **Staging**: Info logging, JSON format
- **Production**: Warn logging, JSON format, SSL enabled

## Validation

The system validates environment variables on startup:

- Type checking (string, number, boolean, URL, email)
- Required field validation
- Clear error messages for missing/invalid variables

## File Structure

```
src/config/
├── config.interface.ts      # TypeScript interfaces
├── config.service.ts        # Main configuration service
├── config.module.ts         # NestJS module
├── config.validation.ts     # Validation utilities
└── README.md               # This documentation
```

## Best Practices

1. Never commit `.env` files
2. Use environment-specific files for different deployments
3. Validate required variables in production
4. Use the ConfigService instead of direct `process.env` access
5. Keep secrets out of code and configuration files
