# 🔐 Secure API Key Usage Implementation Guide

## Overview

This document outlines the comprehensive security implementation for API key management in BridgeWise. The system ensures API keys are never exposed to clients, properly encrypted, and regularly rotated.

## Architecture

### Core Components

#### 1. **API Key Vault Service** (`api-key-vault.service.ts`)
Handles secure encryption and storage of API keys using AES-256-GCM encryption.

**Key Features:**
- Encrypts each key with a unique IV (initialization vector)
- Uses authentication tags to detect tampering
- Supports key expiration
- Tracks key metadata (creation date, status, rotation requirements)
- No keys stored in plaintext

**Usage:**
```typescript
import { ApiKeyVaultService } from '@src/security/api-key-vault.service';

@Injectable()
export class MyService {
  constructor(private readonly vault: ApiKeyVaultService) {}

  async useApiKey() {
    // Store a key
    const encrypted = this.vault.storeKey('my-key-id', process.env.API_KEY);
    
    // Retrieve and decrypt (server-side only)
    const decrypted = this.vault.retrieveKey('my-key-id');
    
    // Check if key is expired
    if (this.vault.isKeyExpired('my-key-id')) {
      // Handle expired key
    }
  }
}
```

#### 2. **Secure HTTP Client Service** (`secure-http-client.service.ts`)
Makes authenticated HTTP requests using keys from the vault without exposing them.

**Key Features:**
- Automatically injects API keys from vault
- SSRF (Server-Side Request Forgery) protection
- Blocks internal IP addresses
- Timeout handling
- Comprehensive error handling

**Usage:**
```typescript
import { SecureHttpClientService } from '@src/security/secure-http-client.service';

@Injectable()
export class BridgeService {
  constructor(
    private readonly httpClient: SecureHttpClientService
  ) {}

  async fetchBridgeQuote() {
    return await this.httpClient.get('https://api.bridge.com/quote', {
      apiKeyId: 'api-key-main'
    });
  }
}
```

#### 3. **API Key Rotation Service** (`api-key-rotation.service.ts`)
Tracks rotation age and status; manual rotation updates the process-local vault only.

**Key Features:**
- Configurable rotation policies per key
- Daily age checks mark keys for rotation; they do not create new provider credentials
- Manual process-local replacement; provider credentials and secret-manager versions must be rotated separately
- Expiration tracking; the current service logs warnings but does not send notifications
- In-memory rotation history and recommendations

**Usage:**
```typescript
import { ApiKeyRotationService } from '@src/security/api-key-rotation.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly rotationService: ApiKeyRotationService
  ) {}

  async setupKeyRotation() {
    // Set custom rotation policy (90 days for API key)
    this.rotationService.setRotationPolicy('api-key-main', {
      rotationIntervalDays: 90,
      autoRotate: true,
    });

    // Check rotation status
    const status = this.rotationService.getRotationStatus();
    
    // Manually rotate a key
    await this.rotationService.rotateKeyManually(
      'api-key-main',
      'new-secret-value'
    );

    // Get recommendations
    const recommendations = this.rotationService.getRotationRecommendations();
  }
}
```

#### 4. **Environment Security Validator** (`environment-security.validator.ts`)
Validates environment configuration for security compliance.

**Security Checks:**
- ✅ Vault encryption key configuration (production)
- ✅ HTTPS enforcement
- ✅ CORS configuration
- ✅ Logging levels
- ✅ Environment type validation
- ✅ Key exposure in development

**Usage:**
```typescript
import { EnvironmentSecurityValidator } from '@src/security/environment-security.validator';

@Injectable()
export class BootstrapService {
  constructor(
    private readonly validator: EnvironmentSecurityValidator
  ) {
    const summary = this.validator.getSummary();
    console.log(`Security Status: ${summary.secure}`);
  }
}
```

#### 5. **Secure Request Middleware** (`secure-request.middleware.ts`)
Intercepts all requests to sanitize sensitive headers before processing.

**Features:**
- Removes client-sent authorization headers
- Sanitizes API key headers
- Logs all requests safely (without secrets)

---

## Configuration

### Environment Variables

**Required Environment Variables:**

```bash
# Vault Configuration
VAULT_ENCRYPTION_KEY=<32-random-bytes-encoded-as-64-hex-characters>

# API Keys (stored in vault, never exposed)
API_KEY=<provider-key>
API_SECRET=<provider-secret>
DB_PASSWORD=<database-password>

# Security Settings
NODE_ENV=production|staging|development
FORCE_HTTPS=true  # Required in production
CORS_ORIGIN=https://yourdomain.com  # Never use * in production

# Logging
LOG_LEVEL=warn  # Use warn/error in production
LOG_FORMAT=json  # Use json in production
```

### Development Setup

```bash
# Create .env.development
NODE_ENV=development
API_KEY=<development-only-provider-key>
API_SECRET=<development-only-provider-secret>
DB_PASSWORD=<development-only-database-password>
VAULT_ENCRYPTION_KEY=<development-only-random-value>

# Note: Keys are plain in development, but vault still encrypts them
```

### Production Setup

Do not create or deploy a production dotenv file. Set nonsecret configuration in the deployment configuration and inject credentials at runtime from the approved secret manager. Follow the [Production key management runbook](./KEY_MANAGEMENT_RUNBOOK.md) for generation, backup, approval, rotation, and emergency revocation.

---

## Security Audit Checklist

### Pre-Deployment

- [ ] **No keys in source code**: Run `git log -p` to verify no secrets in history
- [ ] **Environment variables validated**: Required production values are injected by the runtime secret manager; no production dotenv file is used
- [ ] **Encryption key generated**: `VAULT_ENCRYPTION_KEY` is 32 random bytes encoded as 64 hexadecimal characters and backed up separately
- [ ] **HTTPS enabled**: `FORCE_HTTPS=true` in production
- [ ] **CORS restricted**: Not using wildcard origins
- [ ] **Logging secured**: Not in debug mode
- [ ] **Database password vaulted**: Using vault service
- [ ] **All security checks pass**: `EnvironmentSecurityValidator` returns no critical errors

### Operational

- [ ] **Key rotation scheduled**: Cron jobs configured
- [ ] **Rotation logs monitored**: Check daily for overdue rotations
- [ ] **Access logs maintained**: Track who accesses keys
- [ ] **Vault integrity checked**: Verify encryption/decryption works
- [ ] **Incident response ready**: Plan for key compromise

---

## API Endpoints for Key Management

### Get Key Status

```http
GET /api/security/keys/status
Authorization: Bearer <admin-token>

Response:
{
  "keys": [
    {
      "keyId": "api-key-main",
      "isActive": true,
      "needsRotation": false,
      "daysUntilRotation": 45,
      "expiresAt": "2026-06-25T00:00:00Z"
    }
  ]
}
```

### Get Rotation Recommendations

```http
GET /api/security/keys/recommendations
Authorization: Bearer <admin-token>

Response:
{
  "recommendations": [
    {
      "keyId": "api-key-main",
      "recommendation": "Rotate within 7 days",
      "urgent": true
    }
  ]
}
```

### Manually Rotate Key

```http
POST /api/security/keys/rotate
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "keyId": "api-key-main",
  "newSecretValue": "new-api-key-value"
}
```

---

## Best Practices

### 1. **Never Expose Keys to Client**
✅ **DO:** Use server-side endpoints for API calls
```typescript
// Server-side only - uses vault internally
const response = await this.httpClient.get(url, { apiKeyId: 'api-key-main' });
```

❌ **DON'T:** Send keys to browser
```typescript
// Never do this!
return { apiKey: this.configService.getApiKey() };
```

### 2. **Always Use HTTPS**
- Production: `FORCE_HTTPS=true`
- TLS 1.2 or higher
- Certificate pinning for critical APIs

### 3. **Regular Key Rotation**
- Use issuer-specific rotation windows approved for each credential; the in-app daily job only flags overdue keys.
- Follow the [key management runbook](./KEY_MANAGEMENT_RUNBOOK.md) to update the secret manager and roll out replacements before revoking old credentials.

### 4. **Monitor Key Access**
```typescript
// Current vault logs key IDs for access attempts; it does not provide approver identity or a durable audit ledger.
private readonly logger = new Logger(ApiKeyVaultService.name);
this.logger.debug(`Key accessed: ${keyId}`);
```

### 5. **Handle Key Expiration**
```typescript
try {
  const key = this.vault.retrieveKey('api-key-main');
} catch (error) {
  if (error.message.includes('expired')) {
    // Trigger key rotation
    await this.rotationService.rotateKeyManually(
      'api-key-main',
      newKeyValue
    );
  }
}
```

### 6. **Secure Vault Initialization**
```typescript
// Vault encrypts with a strong key
constructor(private readonly apiKeyVault: ApiKeyVaultService) {
  // Keys automatically stored encrypted on module init
  this.config.onModuleInit();
}
```

---

## Incident Response

Follow the [emergency revocation procedure](./KEY_MANAGEMENT_RUNBOOK.md#emergency-revocation). The local `revokeKey` method is supplementary; revoke the credential at its issuer and update the runtime secret store.

### If a Key is Compromised

1. **Immediate Actions:**
   ```typescript
   // Revoke compromised key immediately
   this.vault.revokeKey('api-key-main');
   ```

2. **Investigate:**
   - Check rotation logs
   - Review access logs
   - Determine exposure scope

3. **Remediate:**
   - Generate new key
   - Update all systems using the key
   - Notify affected services

4. **Post-mortem:**
   - Document timeline
   - Identify root cause
   - Update security procedures

---

## Testing

### Unit Tests for Vault

```typescript
describe('ApiKeyVaultService', () => {
  let vault: ApiKeyVaultService;

  beforeEach(() => {
    vault = new ApiKeyVaultService();
  });

  it('should encrypt and decrypt keys', () => {
    vault.storeKey('test-key', 'secret-value');
    const stored = vault.retrieveKey('test-key');
    expect(stored).toBe('secret-value');
  });

  it('should reject expired keys', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    vault.storeKey('expired-key', 'secret', yesterday);
    expect(() => vault.retrieveKey('expired-key')).toThrow();
  });

  it('should detect tampering', () => {
    const encrypted = vault.storeKey('test', 'secret');
    encrypted.ciphered = 'tampered';
    
    expect(() => vault.retrieveKey('test')).toThrow(
      'possible tampering'
    );
  });
});
```

### Integration Tests

```typescript
describe('Secure API Key Flow', () => {
  it('should make authenticated requests without exposing keys', async () => {
    const response = await this.httpClient.get(
      'https://api.bridge.com/quotes',
      { apiKeyId: 'api-key-main' }
    );
    expect(response.statusCode).toBe(200);
    // Key was never exposed to test/logs
  });
});
```

---

## Monitoring & Alerts

The metric and alert examples below are recommendations for external monitoring. The current rotation service logs status but does not publish metrics or send notifications.

### Key Metrics to Monitor

1. **Key Rotation Status**
   - Alert if rotation overdue
   - Alert if > 3 keys need rotation

2. **Access Logs**
   - Failed decryption attempts
   - Expired key access attempts
   - Key revocation attempts

3. **Vault Health**
   - Encryption/decryption performance
   - Key storage integrity
   - Backup status

### Recommended Alerts

```
ALERT KeyRotationOverdue
  IF DaysUntilRotation < 0
  FOR 1h

ALERT MultipleFailedDecrypts
  IF FailedDecryptCount > 5
  IN 5m
  SEVERITY: CRITICAL

ALERT VaultIntegrityFailed
  IF VerifyKeyIntegrity(keyId) == false
  SEVERITY: CRITICAL
```

---

## Troubleshooting

### Issue: "VAULT_ENCRYPTION_KEY not set"
**Solution:** Create the key using the approved secret manager or secure generation procedure in the [key management runbook](./KEY_MANAGEMENT_RUNBOOK.md), then inject it at runtime. Do not print it in CI or a recorded terminal.

### Issue: "Failed to decrypt key - possible tampering detected"
**Solution:** Verify vault initialization:
- Check encryption key matches
- Verify key storage mechanism
- Review access logs for tampering

### Issue: Keys expiring frequently
**Solution:** Adjust rotation policy:
```typescript
this.rotationService.setRotationPolicy('api-key-main', {
  rotationIntervalDays: 180,  // Increase from 90
  autoRotate: true
});
```

---

## References

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)
- [NestJS Security Best Practices](https://docs.nestjs.com/security)
- [NIST Key Management Guidelines](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-57pt1r5.pdf)

---

## Support

For security issues or questions:
1. Create a private security issue (not public)
2. Email: security@bridgewise.dev
3. Details: Description, reproduction steps, impact assessment

**Do NOT publicly disclose security vulnerabilities.**

## Key lifecycle operations

See the [Production key management runbook](./KEY_MANAGEMENT_RUNBOOK.md). The current vault stores values only in process memory, and rotation policy checks do not rotate credentials at external issuers.
