# 🔐 Security Module - API Key Management

## Overview

The Security Module provides comprehensive, production-ready API key management with encryption, rotation, and audit capabilities. It prevents key exposure to clients and ensures keys are properly stored, encrypted, and managed throughout their lifecycle.

## Quick Start

### 1. Initialize Security Module in App

```typescript
import { Module } from '@nestjs/common';
import { SecurityModule } from '@src/security';
import { ConfigModule, ConfigService } from '@src/config';

@Module({
  imports: [
    ConfigModule,
    SecurityModule,
  ],
})
export class AppModule {}
```

### 2. Set Environment Variables

```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Set in .env
VAULT_ENCRYPTION_KEY=<generated-key>
API_KEY=your-actual-api-key
API_SECRET=your-actual-api-secret
DB_PASSWORD=your-db-password
```

### 3. Use in Your Services

```typescript
import { Injectable } from '@nestjs/common';
import { SecureHttpClientService, ApiKeyVaultService } from '@src/security';

@Injectable()
export class BridgeService {
  constructor(
    private readonly httpClient: SecureHttpClientService,
    private readonly vault: ApiKeyVaultService,
  ) {}

  async fetchQuotes() {
    // Make authenticated request (key injected from vault)
    return await this.httpClient.get('https://api.bridge.com/quotes', {
      apiKeyId: 'api-key-main',
    });
  }

  async getKeyStatus() {
    const metadata = this.vault.getKeyMetadata('api-key-main');
    return metadata; // No secret value exposed
  }
}
```

## Key Components

### ApiKeyVaultService
**Purpose:** Secure storage and encryption of API keys

**Methods:**
- `storeKey(keyId, secretValue, expiresAt?)` - Store encrypted key
- `retrieveKey(keyId)` - Decrypt and retrieve key (server-side only)
- `isKeyExpired(keyId)` - Check expiration
- `rotateKey(keyId, newValue)` - Rotate key
- `revokeKey(keyId)` - Revoke key immediately
- `getKeyMetadata(keyId)` - Get metadata without exposing secret
- `listKeys()` - List all key metadata
- `verifyKeyIntegrity(keyId)` - Detect tampering

### SecureHttpClientService
**Purpose:** Make authenticated HTTP requests using vaulted keys

**Methods:**
- `request(url, options)` - Make authenticated request
- `get(url, options)` - GET request
- `post(url, body, options)` - POST request
- `put(url, body, options)` - PUT request
- `delete(url, options)` - DELETE request
- `patch(url, body, options)` - PATCH request

**Features:**
- Automatic key injection from vault
- SSRF protection
- Timeout handling
- Error handling

### ApiKeyRotationService
**Purpose:** Manage key rotation policies and schedules

**Methods:**
- `setRotationPolicy(keyId, policy)` - Set rotation schedule
- `needsRotation(keyId)` - Check if rotation needed
- `getDaysUntilRotation(keyId)` - Get remaining days
- `rotateKeyManually(keyId, newValue)` - Manually rotate
- `getRotationStatus()` - Get all keys' rotation status
- `getRotationHistory(limit)` - Get rotation logs
- `getRotationRecommendations()` - Get recommendations

**Features:**
- Automatic daily rotation checks (via `@Cron`)
- Configurable policies per key
- Expiration tracking
- Rotation history
- Recommendations

### EnvironmentSecurityValidator
**Purpose:** Validate security configuration at runtime

**Methods:**
- `getChecks()` - Get all security checks
- `allCriticalChecksPassed()` - Verify no critical issues
- `getSummary()` - Get security summary

**Checks:**
- Vault encryption key configuration
- Production environment requirements
- HTTPS enforcement
- CORS security
- Logging levels
- Environment type validation

### SecureRequestMiddleware
**Purpose:** Sanitize incoming requests

**Features:**
- Removes client-supplied sensitive headers
- Logs requests safely
- Prevents key exposure in transit

### ApiSecurityGuard
**Purpose:** Protect endpoints from unauthorized access

**Features:**
- Validates authorization headers
- Enforces Bearer token scheme
- Logs security events

## Security Features

### ✅ Encryption
- **Algorithm:** AES-256-GCM
- **Unique IV:** Each key encrypted with random IV
- **Authentication Tag:** Detects tampering
- **Key Derivation:** PBKDF2 from encryption key

### ✅ Key Rotation
- **Automatic:** Daily schedule checks
- **Configurable:** Per-key policies
- **Tracked:** Complete rotation history
- **Alerts:** Expiration warnings

### ✅ Access Control
- **Server-side only:** Keys never exposed to clients
- **Audit logs:** All access logged
- **Expiration:** Automatic key expiration
- **Revocation:** Immediate key disabling

### ✅ Environment Security
- **No hardcoded secrets:** All from environment/vault
- **HTTPS enforcement:** Production requirement
- **CORS restriction:** Configurable origins
- **Vault key required:** Production safety check

## Usage Examples

### Store API Key

```typescript
constructor(private vault: ApiKeyVaultService) {
  this.vault.storeKey('stripe-key', process.env.STRIPE_API_KEY);
}
```

### Make Authenticated Request

```typescript
async fetchFromExternalAPI() {
  const response = await this.httpClient.post(
    'https://api.external.com/data',
    { param: 'value' },
    { apiKeyId: 'stripe-key' }
  );
  return response.body;
}
```

### Check Key Status

```typescript
async getKeyStatus() {
  const rotation = this.rotationService.getRotationStatus();
  
  rotation.forEach(status => {
    if (status.needsRotation) {
      console.log(`⚠️ ${status.keyId} needs rotation in ${status.daysUntilRotation} days`);
    }
  });
}
```

### Rotate Key Manually

```typescript
async rotateApiKey(newKeyValue: string) {
  try {
    await this.rotationService.rotateKeyManually('api-key-main', newKeyValue);
    console.log('✅ Key rotated successfully');
  } catch (error) {
    console.error('❌ Rotation failed:', error);
  }
}
```

### Setup Rotation Policies

```typescript
constructor(private rotationService: ApiKeyRotationService) {
  // Rotate API keys every 90 days
  this.rotationService.setRotationPolicy('api-key-main', {
    rotationIntervalDays: 90,
    autoRotate: true,
  });

  // Rotate database password every 180 days
  this.rotationService.setRotationPolicy('db-password', {
    rotationIntervalDays: 180,
    autoRotate: true,
  });
}
```

### Verify Security Configuration

```typescript
constructor(private validator: EnvironmentSecurityValidator) {
  const summary = this.validator.getSummary();
  
  if (!summary.secure) {
    throw new Error('Security configuration issues detected');
  }

  const checks = this.validator.getChecks();
  checks.forEach(check => {
    console.log(`${check.name}: ${check.message}`);
  });
}
```

## Environment Configuration

### Development (.env.development)

```bash
NODE_ENV=development
API_KEY=dev-key-12345
API_SECRET=dev-secret-67890
DB_PASSWORD=dev-password
VAULT_ENCRYPTION_KEY=dev-encryption-key
FORCE_HTTPS=false
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=debug
```

### Production (.env.production)

```bash
NODE_ENV=production
API_KEY=<real-production-key>
API_SECRET=<real-production-secret>
DB_PASSWORD=<real-db-password>
VAULT_ENCRYPTION_KEY=<secure-generated-key>
FORCE_HTTPS=true
CORS_ORIGIN=https://app.domain.com
LOG_LEVEL=warn
LOG_FORMAT=json
```

## Best Practices

### ✅ DO

```typescript
// Store secrets in vault
this.vault.storeKey('api-key', process.env.API_KEY);

// Use secure HTTP client for API calls
this.httpClient.get(url, { apiKeyId: 'api-key' });

// Check rotation status regularly
const status = this.rotationService.getRotationStatus();

// Validate environment on startup
const valid = this.validator.allCriticalChecksPassed();

// Use server-side endpoints only
app.get('/api/data', auth, handler); // Never expose key
```

### ❌ DON'T

```typescript
// Never expose keys to clients
return { apiKey: process.env.API_KEY };

// Never hardcode secrets
const apiKey = 'sk_live_1234567890';

// Never log keys
console.log(`Using key: ${apiKey}`);

// Never send keys in client code
fetch(url, { headers: { 'X-API-Key': apiKey } });

// Never use wildcard CORS in production
cors({ origin: '*' }); // NO! Use specific domains
```

## Testing

### Unit Test Example

```typescript
describe('ApiKeyVaultService', () => {
  let vault: ApiKeyVaultService;

  beforeEach(() => {
    vault = new ApiKeyVaultService();
  });

  it('should store and retrieve encrypted keys', () => {
    vault.storeKey('test', 'secret-value');
    expect(vault.retrieveKey('test')).toBe('secret-value');
  });

  it('should reject expired keys', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    vault.storeKey('expired', 'secret', yesterday);
    expect(() => vault.retrieveKey('expired')).toThrow();
  });

  it('should detect tampering', () => {
    const encrypted = vault.storeKey('test', 'secret');
    // Simulate tampering
    const metadata = vault.getKeyMetadata('test');
    expect(() => vault.retrieveKey('test')).not.toThrow();
  });
});
```

## Monitoring & Troubleshooting

### Check Vault Status

```bash
curl http://localhost:3000/api/security/keys/status \
  -H "Authorization: Bearer <token>"
```

### View Rotation Recommendations

```bash
curl http://localhost:3000/api/security/keys/recommendations \
  -H "Authorization: Bearer <token>"
```

### Run Security Audit

```bash
npx ts-node src/security/audit.script.ts
```

### Generate Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Common Issues

| Issue | Solution |
|---|---|
| "VAULT_ENCRYPTION_KEY not set" | Generate and set with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| "Failed to decrypt key" | Check encryption key matches, verify no tampering |
| "Key is inactive" | Key was revoked, rotate with new value |
| "SSRF attempt detected" | URL used internal IP, use external URL |
| "Key expired" | Rotate key with new value |

## Documentation

- [Secure API Key Usage Guide](../SECURE_API_KEY_USAGE.md) - Comprehensive guide
- [Module API Reference](./README.md) - This file
- [Security Audit Script](./audit.script.ts) - Automated checks

## Support

For security issues:
1. **Do not create public issues**
2. Email: security@bridgewise.dev
3. Include: Description, reproduction steps, impact

## License

This security module is part of BridgeWise and follows the same license.
