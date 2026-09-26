/**
 * Stellar Provider Capability Discovery Service
 *
 * Automatically detects, records, and validates bridge provider capabilities.
 * Supports pluggable detectors and validators for extensible capability
 * discovery across Stellar/Soroban providers.
 *
 * @see Issue #600 — Implement Stellar Provider Capability Discovery
 */

import type {
  CapabilityDiscoveryConfig,
  CapabilityDiscoveryResult,
  CapabilityRecord,
  CapabilitySummary,
  CapabilityValidationResult,
  CapabilityValidator,
  CapabilityDetector,
  CapabilityCategory,
  ProviderCapability,
  ProviderCapabilityProfile,
} from './types';
import { STELLAR_PROVIDER_CAPABILITIES } from './types';

// ─── Service ──────────────────────────────────────────────────────────────────

export class StellarProviderCapabilityDiscoveryService {
  private readonly trackedCapabilities: ProviderCapability[];
  private readonly profiles = new Map<string, ProviderCapabilityProfile>();
  private readonly maxProviders: number;
  private readonly now: () => number;
  private readonly capabilityDetectors: CapabilityDetector[] = [];
  private readonly capabilityValidators: CapabilityValidator[] = [];

  constructor(config: CapabilityDiscoveryConfig = {}) {
    this.trackedCapabilities =
      config.trackedCapabilities ??
      [...STELLAR_PROVIDER_CAPABILITIES];
    this.maxProviders = config.maxProviders ?? 100;
    this.now = config.now ?? (() => Date.now());

    if (this.maxProviders < 1) {
      throw new RangeError('maxProviders must be ≥ 1');
    }
  }

  // ─── Provider Registration ─────────────────────────────────────────────────

  /**
   * Initialize a capability profile for a provider.
   * Does nothing if the provider is already registered or at capacity.
   */
  registerProvider(
    providerId: string,
    providerName: string,
    endpoint: string,
  ): boolean {
    if (this.profiles.has(providerId)) return false;
    if (this.profiles.size >= this.maxProviders) return false;

    const now = this.now();
    const capabilities: CapabilityRecord[] = this.trackedCapabilities.map(
      (cap) => ({
        capability: { ...cap },
        supported: false,
        lastChecked: 0,
        firstDetected: 0,
        validated: false,
      }),
    );

    this.profiles.set(providerId, {
      providerId,
      providerName,
      endpoint,
      capabilities,
      lastUpdated: now,
      summary: this.buildSummary(capabilities),
    });

    return true;
  }

  /**
   * Remove a provider and all its capability records.
   */
  deregisterProvider(providerId: string): boolean {
    return this.profiles.delete(providerId);
  }

  /**
   * Get a provider's capability profile.
   */
  getProfile(providerId: string): ProviderCapabilityProfile | undefined {
    return this.profiles.get(providerId);
  }

  /**
   * Get all registered provider profiles.
   */
  getAllProfiles(): ProviderCapabilityProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Get the number of registered providers.
   */
  get providerCount(): number {
    return this.profiles.size;
  }

  // ─── Detector Registration ─────────────────────────────────────────────────

  /**
   * Register a capability detector.
   * Detectors are called in order during discovery.
   */
  registerDetector(detector: CapabilityDetector): void {
    this.capabilityDetectors.push(detector);
  }

  /**
   * Remove a capability detector by reference.
   */
  unregisterDetector(detector: CapabilityDetector): boolean {
    const idx = this.capabilityDetectors.indexOf(detector);
    if (idx === -1) return false;
    this.capabilityDetectors.splice(idx, 1);
    return true;
  }

  // ─── Validator Registration ────────────────────────────────────────────────

  /**
   * Register a capability validator.
   * Validators are called in order during validation.
   */
  registerValidator(validator: CapabilityValidator): void {
    this.capabilityValidators.push(validator);
  }

  /**
   * Remove a capability validator by reference.
   */
  unregisterValidator(validator: CapabilityValidator): boolean {
    const idx = this.capabilityValidators.indexOf(validator);
    if (idx === -1) return false;
    this.capabilityValidators.splice(idx, 1);
    return true;
  }

  // ─── Capability Discovery ──────────────────────────────────────────────────

  /**
   * Discover capabilities for a specific provider using registered detectors.
   *
   * Runs all registered detectors in sequence, collects their detected
   * capabilities, and updates the provider's capability records.
   */
  async discover(providerId: string): Promise<CapabilityDiscoveryResult> {
    const profile = this.profiles.get(providerId);
    if (!profile) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    const now = this.now();
    const newlyDetected: ProviderCapability[] = [];
    const newlyUnsupported: ProviderCapability[] = [];
    const versionChanges: CapabilityDiscoveryResult['versionChanges'] = [];

    // Run all detectors
    const detectedSet = new Set<string>();
    const detectedCaps: ProviderCapability[] = [];

    for (const detector of this.capabilityDetectors) {
      try {
        const caps = await detector(providerId, profile.endpoint);
        for (const cap of caps) {
          if (!detectedSet.has(cap.id)) {
            detectedSet.add(cap.id);
            detectedCaps.push(cap);
          }
        }
      } catch {
        // Skip failing detectors
      }
    }

    // Update capability records
    for (const record of profile.capabilities) {
      const detected = detectedCaps.find(
        (dc) => dc.id === record.capability.id,
      );

      if (detected) {
        // Capability is now supported
        if (!record.supported) {
          // Newly detected
          record.supported = true;
          record.firstDetected = now;
          newlyDetected.push(record.capability);
        }

        // Check version changes
        if (detected.version && detected.version !== record.capability.version) {
          versionChanges.push({
            capability: record.capability,
            oldVersion: record.capability.version,
            newVersion: detected.version,
          });
          record.capability.version = detected.version;
        }

        record.lastChecked = now;
      } else {
        // Capability no longer supported
        if (record.supported) {
          record.supported = false;
          newlyUnsupported.push(record.capability);
        }
        record.lastChecked = now;
      }
    }

    // Count supported
    const totalSupported = profile.capabilities.filter((c) => c.supported).length;

    profile.lastUpdated = now;
    profile.summary = this.buildSummary(profile.capabilities);

    return {
      providerId,
      newlyDetected,
      newlyUnsupported,
      versionChanges,
      totalSupported,
      timestamp: now,
    };
  }

  /**
   * Discover capabilities for all registered providers.
   */
  async discoverAll(): Promise<CapabilityDiscoveryResult[]> {
    const results: CapabilityDiscoveryResult[] = [];
    for (const providerId of this.profiles.keys()) {
      try {
        const result = await this.discover(providerId);
        results.push(result);
      } catch {
        // Skip providers where discovery fails entirely
      }
    }
    return results;
  }

  // ─── Capability Validation ─────────────────────────────────────────────────

  /**
   * Validate discovered capabilities for a provider.
   *
   * Runs all registered validators against the provider's supported capabilities.
   */
  async validate(providerId: string): Promise<CapabilityValidationResult[]> {
    const profile = this.profiles.get(providerId);
    if (!profile) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    const now = this.now();
    const results: CapabilityValidationResult[] = [];

    // Only validate supported capabilities
    const supportedCaps = profile.capabilities.filter((c) => c.supported);

    for (const record of supportedCaps) {
      let validated = false;
      let valid = false;
      let reason: string | undefined;

      for (const validator of this.capabilityValidators) {
        try {
          const result = await validator(providerId, record.capability.id);
          // Keep trying validators until one confirms the capability is valid;
          // a negative result from one validator can be overridden by another.
          if (!validated || !valid) {
            valid = result.valid;
            reason = result.reason;
            validated = true;
          }
          // Stop early once a validator confirms the capability
          if (valid) break;
        } catch {
          // Skip failing validators
        }
      }

      if (validated) {
        record.validated = true;
        record.lastValidated = now;
      }

      results.push({
        capabilityId: record.capability.id,
        valid,
        reason: valid ? undefined : reason ?? 'Could not validate capability',
        timestamp: now,
      });
    }

    profile.lastUpdated = now;
    profile.summary = this.buildSummary(profile.capabilities);

    return results;
  }

  /**
   * Validate all registered providers.
   */
  async validateAll(): Promise<Record<string, CapabilityValidationResult[]>> {
    const results: Record<string, CapabilityValidationResult[]> = {};
    for (const providerId of this.profiles.keys()) {
      try {
        results[providerId] = await this.validate(providerId);
      } catch {
        results[providerId] = [];
      }
    }
    return results;
  }

  // ─── Capability Management ─────────────────────────────────────────────────

  /**
   * Get all tracked capability definitions.
   */
  getTrackedCapabilities(): ProviderCapability[] {
    return [...this.trackedCapabilities];
  }

  /**
   * Add a new capability to track across all providers.
   */
  addTrackedCapability(capability: ProviderCapability): void {
    // Avoid duplicates
    if (this.trackedCapabilities.some((c) => c.id === capability.id)) return;

    this.trackedCapabilities.push(capability);

    // Add to all existing providers
    const now = this.now();
    for (const profile of this.profiles.values()) {
      profile.capabilities.push({
        capability: { ...capability },
        supported: false,
        lastChecked: 0,
        firstDetected: 0,
        validated: false,
      });
      profile.lastUpdated = now;
      profile.summary = this.buildSummary(profile.capabilities);
    }
  }

  /**
   * Remove a tracked capability from all providers.
   */
  removeTrackedCapability(capabilityId: string): boolean {
    const idx = this.trackedCapabilities.findIndex(
      (c) => c.id === capabilityId,
    );
    if (idx === -1) return false;

    this.trackedCapabilities.splice(idx, 1);

    // Remove from all providers
    const now = this.now();
    for (const profile of this.profiles.values()) {
      const capIdx = profile.capabilities.findIndex(
        (c) => c.capability.id === capabilityId,
      );
      if (capIdx !== -1) {
        profile.capabilities.splice(capIdx, 1);
        profile.lastUpdated = now;
        profile.summary = this.buildSummary(profile.capabilities);
      }
    }

    return true;
  }

  // ─── Query Methods ─────────────────────────────────────────────────────────

  /**
   * Find all providers that support a specific capability.
   */
  findProvidersWithCapability(capabilityId: string): ProviderCapabilityProfile[] {
    const results: ProviderCapabilityProfile[] = [];
    for (const profile of this.profiles.values()) {
      const record = profile.capabilities.find(
        (c) => c.capability.id === capabilityId,
      );
      if (record && record.supported) {
        results.push(profile);
      }
    }
    return results;
  }

  /**
   * Find all providers missing a required capability (gap analysis).
   */
  findProvidersWithGaps(): Array<{
    profile: ProviderCapabilityProfile;
    missingCapabilities: ProviderCapability[];
  }> {
    const results: Array<{
      profile: ProviderCapabilityProfile;
      missingCapabilities: ProviderCapability[];
    }> = [];

    for (const profile of this.profiles.values()) {
      const missing = profile.capabilities
        .filter(
          (c) => !c.supported && c.capability.required,
        )
        .map((c) => c.capability);

      if (missing.length > 0) {
        results.push({ profile, missingCapabilities: missing });
      }
    }

    return results;
  }

  /**
   * Get capabilities by category for a provider.
   */
  getCapabilitiesByCategory(
    providerId: string,
  ): Record<CapabilityCategory, CapabilityRecord[]> {
    const profile = this.profiles.get(providerId);
    if (!profile) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    const grouped: Record<CapabilityCategory, CapabilityRecord[]> = {
      protocol: [],
      rpc: [],
      settlement: [],
      routing: [],
      security: [],
      performance: [],
      compliance: [],
    };

    for (const record of profile.capabilities) {
      grouped[record.capability.category].push(record);
    }

    return grouped;
  }

  /**
   * Get a unified summary of capability coverage across all providers.
   */
  getOverallSummary(): {
    totalProviders: number;
    capabilities: Record<string, { total: number; supported: number; unsupported: number }>;
    averageSupportedRate: number;
  } {
    if (this.profiles.size === 0) {
      return {
        totalProviders: 0,
        capabilities: {},
        averageSupportedRate: 0,
      };
    }

    const capStats = new Map<
      string,
      { total: number; supported: number; unsupported: number }
    >();

    let totalSupportRate = 0;

    for (const profile of this.profiles.values()) {
      totalSupportRate +=
        profile.summary.total > 0
          ? profile.summary.supported / profile.summary.total
          : 0;

      for (const record of profile.capabilities) {
        const capId = record.capability.id;
        if (!capStats.has(capId)) {
          capStats.set(capId, { total: 0, supported: 0, unsupported: 0 });
        }
        const stats = capStats.get(capId)!;
        stats.total++;
        if (record.supported) {
          stats.supported++;
        } else {
          stats.unsupported++;
        }
      }
    }

    const capabilities: Record<
      string,
      { total: number; supported: number; unsupported: number }
    > = {};
    for (const [id, stats] of capStats) {
      capabilities[id] = stats;
    }

    return {
      totalProviders: this.profiles.size,
      capabilities,
      averageSupportedRate:
        parseFloat(
          (totalSupportRate / this.profiles.size).toFixed(3),
        ),
    };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private buildSummary(capabilities: CapabilityRecord[]): CapabilitySummary {
    const supported = capabilities.filter((c) => c.supported).length;
    const unsupported = capabilities.filter((c) => !c.supported).length;
    const validated = capabilities.filter((c) => c.validated).length;
    const gaps = capabilities.filter(
      (c) => !c.supported && c.capability.required,
    ).length;

    return {
      total: capabilities.length,
      supported,
      unsupported,
      validated,
      gaps,
    };
  }
}
