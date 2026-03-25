import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

interface KeyMetadata {
  id: string;
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  rotationRequired: boolean;
}

interface EncryptedKey {
  ciphered: string;
  iv: string;
  authTag: string;
  metadata: KeyMetadata;
}

/**
 * Secure API Key Vault Service
 * Handles encryption, storage, and rotation of sensitive API keys
 * Prevents key exposure to clients and logs all access
 */
@Injectable()
export class ApiKeyVaultService {
  private readonly logger = new Logger(ApiKeyVaultService.name);
  private readonly encryptionKey: Buffer;
  private readonly keyStore: Map<string, EncryptedKey> = new Map();

  constructor() {
    // Initialize encryption key from environment
    const keyFromEnv = process.env.VAULT_ENCRYPTION_KEY;
    if (!keyFromEnv) {
      this.logger.error(
        'VAULT_ENCRYPTION_KEY not set. Using generated key (NOT FOR PRODUCTION)',
      );
      this.encryptionKey = crypto.randomBytes(32);
    } else {
      // Ensure key is proper length (32 bytes for AES-256)
      this.encryptionKey = crypto
        .createHash('sha256')
        .update(keyFromEnv)
        .digest();
    }
  }

  /**
   * Store a sensitive API key securely
   * @param keyId Unique identifier for this key
   * @param secretValue The actual API key value
   * @param expiresAt Optional expiration date
   * @returns Encrypted key data
   */
  storeKey(
    keyId: string,
    secretValue: string,
    expiresAt?: Date,
  ): EncryptedKey {
    if (!secretValue || secretValue.trim() === '') {
      this.logger.warn(`Attempted to store empty key with ID: ${keyId}`);
      throw new Error('Cannot store empty API key');
    }

    // Generate random IV for each encryption
    const iv = crypto.randomBytes(16);

    // Create cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    // Encrypt the secret
    let ciphered = cipher.update(secretValue, 'utf-8', 'hex');
    ciphered += cipher.final('hex');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    const metadata: KeyMetadata = {
      id: keyId,
      createdAt: new Date(),
      expiresAt,
      isActive: true,
      rotationRequired: false,
    };

    const encryptedKey: EncryptedKey = {
      ciphered,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      metadata,
    };

    this.keyStore.set(keyId, encryptedKey);
    this.logger.debug(`Key stored: ${keyId}`);

    return encryptedKey;
  }

  /**
   * Retrieve and decrypt an API key
   * @param keyId Unique identifier for the key
   * @returns Decrypted API key value
   */
  retrieveKey(keyId: string): string {
    const encryptedKey = this.keyStore.get(keyId);

    if (!encryptedKey) {
      this.logger.warn(`Attempted to retrieve non-existent key: ${keyId}`);
      throw new Error(`Key not found: ${keyId}`);
    }

    // Check expiration
    if (
      encryptedKey.metadata.expiresAt &&
      new Date() > encryptedKey.metadata.expiresAt
    ) {
      this.logger.warn(`Attempted to access expired key: ${keyId}`);
      throw new Error(`Key has expired: ${keyId}`);
    }

    if (!encryptedKey.metadata.isActive) {
      this.logger.warn(`Attempted to access inactive key: ${keyId}`);
      throw new Error(`Key is inactive: ${keyId}`);
    }

    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey,
        Buffer.from(encryptedKey.iv, 'hex'),
      );

      decipher.setAuthTag(
        Buffer.from(encryptedKey.authTag, 'hex'),
      );

      let decrypted = decipher.update(encryptedKey.ciphered, 'hex', 'utf-8');
      decrypted += decipher.final('utf-8');

      this.logger.debug(`Key accessed: ${keyId}`);

      return decrypted;
    } catch (error) {
      this.logger.error(
        `Failed to decrypt key ${keyId}: ${error.message}`,
      );
      throw new Error('Failed to decrypt key - possible tampering detected');
    }
  }

  /**
   * Check if a key has expired
   * @param keyId Unique identifier for the key
   * @returns True if key has expired
   */
  isKeyExpired(keyId: string): boolean {
    const encryptedKey = this.keyStore.get(keyId);

    if (!encryptedKey) {
      return false;
    }

    if (!encryptedKey.metadata.expiresAt) {
      return false;
    }

    return new Date() > encryptedKey.metadata.expiresAt;
  }

  /**
   * Mark a key as requiring rotation
   * @param keyId Unique identifier for the key
   */
  markForRotation(keyId: string): void {
    const encryptedKey = this.keyStore.get(keyId);

    if (!encryptedKey) {
      this.logger.warn(`Attempted to mark non-existent key for rotation: ${keyId}`);
      throw new Error(`Key not found: ${keyId}`);
    }

    encryptedKey.metadata.rotationRequired = true;
    this.logger.info(`Key marked for rotation: ${keyId}`);
  }

  /**
   * Rotate an API key - deactivate old, store new
   * @param keyId Unique identifier for the key
   * @param newSecretValue The new API key value
   * @returns Encrypted new key data
   */
  rotateKey(keyId: string, newSecretValue: string): EncryptedKey {
    const oldKey = this.keyStore.get(keyId);

    if (oldKey) {
      oldKey.metadata.isActive = false;
      this.logger.info(`Key rotated, old key deactivated: ${keyId}`);
    }

    // Store new key with expiration 90 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    return this.storeKey(keyId, newSecretValue, expiresAt);
  }

  /**
   * Revoke a key immediately
   * @param keyId Unique identifier for the key
   */
  revokeKey(keyId: string): void {
    const encryptedKey = this.keyStore.get(keyId);

    if (!encryptedKey) {
      this.logger.warn(`Attempted to revoke non-existent key: ${keyId}`);
      throw new Error(`Key not found: ${keyId}`);
    }

    encryptedKey.metadata.isActive = false;
    this.logger.warn(`Key revoked: ${keyId}`);
  }

  /**
   * Get key metadata (without exposing the actual key)
   * @param keyId Unique identifier for the key
   * @returns Key metadata only
   */
  getKeyMetadata(keyId: string): KeyMetadata | null {
    const encryptedKey = this.keyStore.get(keyId);
    return encryptedKey?.metadata || null;
  }

  /**
   * List all keys (metadata only, no secrets)
   * @returns Array of key metadata
   */
  listKeys(): KeyMetadata[] {
    return Array.from(this.keyStore.values()).map((ek) => ek.metadata);
  }

  /**
   * Check for and return keys requiring rotation
   * @returns Array of key IDs requiring rotation
   */
  getKeysRequiringRotation(): string[] {
    return Array.from(this.keyStore.entries())
      .filter(([, ek]) => ek.metadata.rotationRequired)
      .map(([id]) => id);
  }

  /**
   * Verify key integrity
   * @param keyId Unique identifier for the key
   * @returns True if key can be decrypted successfully
   */
  verifyKeyIntegrity(keyId: string): boolean {
    const encryptedKey = this.keyStore.get(keyId);

    if (!encryptedKey) {
      return false;
    }

    try {
      this.retrieveKey(keyId);
      return true;
    } catch {
      return false;
    }
  }
}
