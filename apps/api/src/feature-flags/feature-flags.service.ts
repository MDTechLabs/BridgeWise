import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/config-factory';
import { EnvironmentConfigService } from '../config/environment-config.service';

export type FeatureFlags = AppConfig['features'];
export type FeatureFlagName = keyof FeatureFlags;

/**
 * Feature Flags Service
 *
 * Central service for reading feature-flag state at runtime.
 * Flags are sourced from environment variables and are therefore
 * configurable per deployment without a code change or redeploy
 * (a process restart is required to pick up env-var changes).
 */
@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly environmentConfigService: EnvironmentConfigService,
  ) {}

  /**
   * Returns all feature flags and their current enabled/disabled state.
   */
  getAll(): FeatureFlags {
    return this.environmentConfigService.getFeatures();
  }

  /**
   * Returns true when the given flag is enabled, false otherwise.
   */
  isEnabled(flag: FeatureFlagName): boolean {
    return this.environmentConfigService.isFeatureEnabled(flag);
  }

  /**
   * Returns true when the given flag is disabled.
   */
  isDisabled(flag: FeatureFlagName): boolean {
    return !this.isEnabled(flag);
  }
}
