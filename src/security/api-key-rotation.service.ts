import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApiKeyVaultService } from './api-key-vault.service';

interface KeyRotationLog {
  keyId: string;
  rotatedAt: Date;
  oldKeyExpired: boolean;
  newKeyExpires: Date;
}

interface RotationPolicy {
  keyId: string;
  rotationIntervalDays: number;
  autoRotate: boolean;
  notificationEmail?: string;
}

/**
 * API Key Rotation Service
 * Handles automatic and manual key rotation
 * Maintains rotation logs and notifies about expiring keys
 */
@Injectable()
export class ApiKeyRotationService {
  private readonly logger = new Logger(ApiKeyRotationService.name);
  private readonly rotationPolicies: Map<string, RotationPolicy> = new Map();
  private readonly rotationLogs: KeyRotationLog[] = [];

  constructor(private readonly apiKeyVault: ApiKeyVaultService) {
    this.initializeDefaultPolicies();
  }

  /**
   * Initialize default rotation policies
   */
  private initializeDefaultPolicies(): void {
    // Default 90-day rotation for all keys
    this.setRotationPolicy('api-key-main', {
      keyId: 'api-key-main',
      rotationIntervalDays: 90,
      autoRotate: true,
    });

    this.setRotationPolicy('api-secret-main', {
      keyId: 'api-secret-main',
      rotationIntervalDays: 90,
      autoRotate: true,
    });

    this.setRotationPolicy('db-password', {
      keyId: 'db-password',
      rotationIntervalDays: 180,
      autoRotate: true,
    });
  }

  /**
   * Set rotation policy for a key
   */
  setRotationPolicy(
    keyId: string,
    policy: Omit<RotationPolicy, 'keyId'>,
  ): void {
    this.rotationPolicies.set(keyId, { keyId, ...policy });
    this.logger.info(
      `Rotation policy set for ${keyId}: ${policy.rotationIntervalDays} days`,
    );
  }

  /**
   * Get rotation policy for a key
   */
  getRotationPolicy(keyId: string): RotationPolicy | undefined {
    return this.rotationPolicies.get(keyId);
  }

  /**
   * Check if a key needs rotation
   */
  needsRotation(keyId: string): boolean {
    const metadata = this.apiKeyVault.getKeyMetadata(keyId);
    if (!metadata) {
      return false;
    }

    const policy = this.getRotationPolicy(keyId);
    if (!policy) {
      return false;
    }

    const createdDate = new Date(metadata.createdAt);
    const rotationDue = new Date(createdDate);
    rotationDue.setDate(rotationDue.getDate() + policy.rotationIntervalDays);

    return new Date() > rotationDue;
  }

  /**
   * Get days until key rotation is due
   */
  getDaysUntilRotation(keyId: string): number {
    const metadata = this.apiKeyVault.getKeyMetadata(keyId);
    if (!metadata) {
      return -1;
    }

    const policy = this.getRotationPolicy(keyId);
    if (!policy) {
      return -1;
    }

    const createdDate = new Date(metadata.createdAt);
    const rotationDue = new Date(createdDate);
    rotationDue.setDate(rotationDue.getDate() + policy.rotationIntervalDays);

    const daysLeft = Math.ceil(
      (rotationDue.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
    );
    return daysLeft;
  }

  /**
   * Manually rotate a key
   */
  async rotateKeyManually(
    keyId: string,
    newSecretValue: string,
  ): Promise<void> {
    try {
      this.apiKeyVault.rotateKey(keyId, newSecretValue);

      const metadata = this.apiKeyVault.getKeyMetadata(keyId);
      const log: KeyRotationLog = {
        keyId,
        rotatedAt: new Date(),
        oldKeyExpired: false,
        newKeyExpires: metadata?.expiresAt || new Date(),
      };

      this.rotationLogs.push(log);
      this.logger.info(`Key rotated manually: ${keyId}`);
    } catch (error) {
      this.logger.error(
        `Failed to rotate key ${keyId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Check all keys for rotation needs (scheduled task)
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkKeysForRotation(): Promise<void> {
    this.logger.debug('Running scheduled key rotation check');

    const allKeys = this.apiKeyVault.listKeys();
    const keysNeedingRotation: string[] = [];

    for (const keyMetadata of allKeys) {
      if (this.needsRotation(keyMetadata.id)) {
        keysNeedingRotation.push(keyMetadata.id);
        this.logger.warn(`Key requiring rotation: ${keyMetadata.id}`);
        this.apiKeyVault.markForRotation(keyMetadata.id);
      }
    }

    // Check for keys expiring soon (within 14 days)
    const expiringKeys = allKeys.filter((meta) => {
      if (!meta.expiresAt) return false;
      const daysUntilExpiry = Math.ceil(
        (new Date(meta.expiresAt).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24),
      );
      return daysUntilExpiry > 0 && daysUntilExpiry <= 14;
    });

    if (expiringKeys.length > 0) {
      this.logger.warn(
        `${expiringKeys.length} keys expiring within 14 days`,
      );
      // TODO: Send notification emails
    }

    return;
  }

  /**
   * Get rotation status for all keys
   */
  getRotationStatus(): Array<{
    keyId: string;
    needsRotation: boolean;
    daysUntilRotation: number;
    isActive: boolean;
    expiresAt?: Date;
  }> {
    const allKeys = this.apiKeyVault.listKeys();

    return allKeys.map((meta) => ({
      keyId: meta.id,
      needsRotation: this.needsRotation(meta.id),
      daysUntilRotation: this.getDaysUntilRotation(meta.id),
      isActive: meta.isActive,
      expiresAt: meta.expiresAt,
    }));
  }

  /**
   * Get rotation history
   */
  getRotationHistory(limit: number = 100): KeyRotationLog[] {
    return this.rotationLogs.slice(-limit);
  }

  /**
   * Get keys requiring rotation
   */
  getKeysRequiringRotation(): string[] {
    return this.apiKeyVault.getKeysRequiringRotation();
  }

  /**
   * Get rotation recommendations
   */
  getRotationRecommendations(): Array<{
    keyId: string;
    recommendation: string;
    urgent: boolean;
  }> {
    const allKeys = this.apiKeyVault.listKeys();
    const recommendations: Array<{
      keyId: string;
      recommendation: string;
      urgent: boolean;
    }> = [];

    for (const meta of allKeys) {
      const daysUntilRotation = this.getDaysUntilRotation(meta.id);

      if (daysUntilRotation < 0) {
        recommendations.push({
          keyId: meta.id,
          recommendation: 'Key rotation is OVERDUE',
          urgent: true,
        });
      } else if (daysUntilRotation < 7) {
        recommendations.push({
          keyId: meta.id,
          recommendation: `Rotate within ${daysUntilRotation} days`,
          urgent: true,
        });
      } else if (daysUntilRotation < 30) {
        recommendations.push({
          keyId: meta.id,
          recommendation: `Rotate within ${daysUntilRotation} days`,
          urgent: false,
        });
      }
    }

    return recommendations;
  }
}
