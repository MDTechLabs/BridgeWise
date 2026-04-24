# BridgeWise Setup Guide

This setup guide helps you install and run BridgeWise locally, configure environment-specific settings, and access API documentation.

## 1. Prerequisites

- Node.js 18+ or 20+
- npm or pnpm
- Git
- PostgreSQL or compatible database for the API

## 2. Install dependencies

From the repository root:

```bash
npm install
```

If you prefer pnpm:

```bash
pnpm install
```

## 3. Environment configuration

BridgeWise uses environment variables and `.env` files to configure runtime behavior. Secrets must never be committed to source control.

### Supported files

BridgeWise loads env files in this priority order:

1. `.env.${NODE_ENV}.local`
2. `.env.${NODE_ENV}`
3. `.env.local`
4. `.env`

For example, when running in `development`, it loads:

- `.env.development.local`
- `.env.development`
- `.env.local`
- `.env`

### Recommended files

- `.env.development` — development config
- `.env.production` — production config
- `.env.local` — machine-specific overrides
- `.env.production.local` — secret overrides for production on a local host

### Example `.env.development`

```env
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres_password
DB_NAME=bridgewise_dev
DB_SSL=false
API_KEY=your_api_key
API_SECRET=your_api_secret
API_BASE_URL=https://api.bridgewise.example.com
API_TIMEOUT=30000
RPC_ETHEREUM=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
RPC_POLYGON=https://polygon-rpc.com
RPC_BSC=https://bsc-dataseed.binance.org
RPC_ARBITRUM=https://arb1.arbitrum.io/rpc
RPC_OPTIMISM=https://mainnet.optimism.io
RPC_BASE=https://mainnet.base.org
CORS_ORIGIN=http://localhost:3000
CORS_CREDENTIALS=false
LOG_LEVEL=debug
LOG_FORMAT=simple
ENABLE_ANALYTICS=true
ENABLE_BENCHMARKING=false
ENABLE_BRIDGE_COMPARE=true
```

> Note: Do not commit `.env*` files with secrets. Add `.env*` to `.gitignore` if needed.

## 4. Required environment variables

The API validates configuration at startup and warns when critical values are missing.

### Required for all environments

- `DB_HOST`
- `DB_USERNAME`
- `DB_NAME`
- `API_KEY`
- `RPC_ETHEREUM`
- `RPC_POLYGON`
- `RPC_BSC`
- `RPC_ARBITRUM`
- `RPC_OPTIMISM`
- `RPC_BASE`

### Required in production

- `DB_PASSWORD`
- `API_KEY`
- `VAULT_ENCRYPTION_KEY`

### Environment-specific defaults

- `NODE_ENV` — defaults to `development`
- `PORT` — defaults to `3000`
- `HOST` — defaults to `0.0.0.0`
- `API_BASE_URL` — defaults to `https://api.bridgewise.com`
- `API_TIMEOUT` — defaults to `30000`
- `CORS_ORIGIN` — defaults to `http://localhost:3000`
- `CORS_CREDENTIALS` — defaults to `false`
- `LOG_LEVEL` — defaults to `info`
- `LOG_FORMAT` — defaults to `simple`

## 5. Running locally

### Development mode

```bash
npm run start:dev
```

### Production mode

```bash
NODE_ENV=production npm run start:prod
```

### Staging mode

```bash
NODE_ENV=staging npm run start:dev
```

## 6. Access API documentation

Once the API is running, visit:

- `http://localhost:3000/api/docs`

This serves the Swagger UI and interactive API documentation.

## 7. Testing

Run tests with:

```bash
npm run test
npm run test:e2e
npm run test:cov
```

## 8. Deployment notes

- Use environment-specific `.env` files or a secrets manager in deployment.
- Never hardcode secrets such as `DB_PASSWORD`, `API_KEY`, or `API_SECRET`.
- The API stores sensitive runtime values in an in-memory vault instead of config objects.
- Use `VAULT_ENCRYPTION_KEY` in production to protect the key vault.

## 9. Where configuration is loaded

The BridgeWise API loads environment configuration from:

- `apps/api/src/config/env-loader.ts`
- `apps/api/src/config/env-schema.ts`
- `apps/api/src/config/config.service.ts`

These files show how `.env` values are parsed, merged, and validated.
