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
Manages automatic and manual key rotation with rotation policies and history tracking.

**Key Features:**
- Configurable rotation policies per key
- Automatic daily rotation schedule checks
- Manual rotation support
- Expiration tracking and notifications
- Rotation history and recommendations

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
VAULT_ENCRYPTION_KEY=your-32-byte-encryption-key-or-it-will-be-hashed

# API Keys (stored in vault, never exposed)
API_KEY=your-api-key
API_SECRET=your-api-secret
DB_PASSWORD=your-db-password

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
API_KEY=dev-api-key-12345
API_SECRET=dev-secret-67890
DB_PASSWORD=dev-password
VAULT_ENCRYPTION_KEY=dev-encryption-key

# Note: Keys are plain in development, but vault still encrypts them
```

### Production Setup

```bash
# Create .env.production (never commit to VCS)
NODE_ENV=production
API_KEY=your-real-production-key
API_SECRET=your-real-production-secret
DB_PASSWORD=your-real-db-password
VAULT_ENCRYPTION_KEY=your-64-char-encryption-key-generated-securely

# Security settings
FORCE_HTTPS=true
LOG_LEVEL=warn
LOG_FORMAT=json
CORS_ORIGIN=https://app.bridgewise.com,https://api.bridgewise.com
```

---

## Security Audit Checklist

### Pre-Deployment

- [ ] **No keys in source code**: Run `git log -p` to verify no secrets in history
- [ ] **Environment variables validated**: Check `.env.production` exists and is ignored
- [ ] **Encryption key generated**: `VAULT_ENCRYPTION_KEY` is 32+ bytes
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
- API keys: Every 90 days
- Database passwords: Every 180 days
- Database encryption keys: Every 365 days

### 4. **Monitor Key Access**
```typescript
// Vault logs all access attempts
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
**Solution:** Generate and set encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output to VAULT_ENCRYPTION_KEY environment variable
```

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
