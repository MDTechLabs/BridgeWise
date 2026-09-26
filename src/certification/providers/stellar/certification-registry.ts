import {
  ProviderCertificationInput,
  CertificationResult,
  CertificationRecord,
  CertificationLevel,
  CertificationStatus,
  CertificationQuery,
  CertificationRegistryConfig,
} from './types';
import { CertificationEngine } from './certification-engine';

/**
 * Central registry that stores and manages certifications for Soroban
 * bridge providers.
 *
 * Wraps {@link CertificationEngine} and adds lifecycle management:
 * - Issue / re-evaluate certifications
 * - Revoke certifications
 * - Query certified providers by level or status
 * - Track certification expiry
 *
 * @example
 * const registry = new CertificationRegistry({ engineConfig: { validityDurationMs: 30 * 86400000 } });
 * const result = registry.certify({
 *   providerId: "allbridge",
 *   usesHttps: true,
 *   hasValidMetadata: true,
 *   uptime: 99.5,
 *   successRate: 0.98,
 *   avgLatencyMs: 200,
 *   versionIsSemver: true,
 *   networkIsSupported: true,
 *   supportedAssetCount: 15,
 *   registeredAt: Date.now() - 30 * 86400000,
 *   historicalOperationCount: 5000,
 * });
 */
export class CertificationRegistry {
  private readonly records = new Map<string, CertificationRecord>();
  private readonly engine: CertificationEngine;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly onStatusChange?: (
    providerId: string,
    from: CertificationStatus,
    to: CertificationStatus,
  ) => void;

  constructor(config: CertificationRegistryConfig = {}) {
    this.maxEntries = config.maxEntries ?? 500;
    this.now = config.now ?? (() => Date.now());
    this.onStatusChange = config.onStatusChange;
    this.engine = new CertificationEngine({
      ...config.engineConfig,
      onCertify: (result) => {
        config.engineConfig?.onCertify?.(result);
        this.persist(result);
      },
    });

    if (this.maxEntries < 1) {
      throw new RangeError('maxEntries must be ≥ 1');
    }
  }

  // ─── Certification Lifecycle ──────────────────────────────────────────────

  /**
   * Evaluate a provider and issue (or re-issue) a certification.
   *
   * Returns the certification result.  The result is automatically stored
   * in the registry via the `onCertify` hook.
   */
  certify(input: ProviderCertificationInput): CertificationResult {
    if (
      this.records.size >= this.maxEntries &&
      !this.records.has(input.providerId)
    ) {
      throw new Error(
        `Certification registry is at capacity (${this.maxEntries}). ` +
          `Remove unused certifications before adding new ones.`,
      );
    }

    return this.engine.evaluate(input);
  }

  /**
   * Revoke a provider's certification.
   *
   * Returns `false` if the provider has no certification.
   */
  revoke(providerId: string, reason?: string): boolean {
    const record = this.records.get(providerId);
    if (!record) return false;

    const previousStatus = record.status;
    record.status = 'revoked';
    record.statusReason = reason ?? 'Manually revoked';
    record.updatedAt = this.now();

    this.onStatusChange?.(providerId, previousStatus, 'revoked');
    return true;
  }

  /**
   * Re-evaluate an already-certified provider with a partial input update.
   *
   * Merges the update onto the previous input and runs evaluation again.
   * Returns `null` if the provider is not currently registered.
   */
  reevaluate(
    providerId: string,
    input: Partial<ProviderCertificationInput>,
  ): CertificationResult | null {
    const existing = this.records.get(providerId);
    if (!existing) return null;

    // Default missing fields to 0/false so partial updates don't
    // accidentally award perfect scores for un-provided dimensions.
    const merged: ProviderCertificationInput = {
      providerId,
      usesHttps: input.usesHttps ?? false,
      hasValidMetadata: input.hasValidMetadata ?? false,
      uptime: input.uptime ?? 0,
      successRate: input.successRate ?? 0,
      avgLatencyMs: input.avgLatencyMs ?? 0,
      versionIsSemver: input.versionIsSemver ?? false,
      networkIsSupported: input.networkIsSupported ?? false,
      supportedAssetCount: input.supportedAssetCount ?? 0,
      registeredAt: input.registeredAt ?? existing.issuedAt,
      historicalOperationCount: input.historicalOperationCount ?? 0,
    };

    return this.certify(merged);
  }

  // ─── Query ────────────────────────────────────────────────────────────────

  /**
   * Get a single certification record by provider id.
   */
  get(providerId: string): CertificationRecord | undefined {
    return this.records.get(providerId);
  }

  /**
   * All stored certification records, sorted by issuedAt ascending.
   */
  getAll(): CertificationRecord[] {
    return [...this.records.values()].sort((a, b) => a.issuedAt - b.issuedAt);
  }

  /**
   * Query certifications with optional filtering.
   */
  query(query: CertificationQuery = {}): CertificationRecord[] {
    let results = this.getAll();

    if (query.level) {
      results = results.filter((r) => r.level === query.level);
    }

    if (query.status) {
      results = results.filter((r) => r.status === query.status);
    }

    if (query.validOnly) {
      results = results.filter(
        (r) => this.engine.effectiveStatus(r) === 'active',
      );
    }

    return results;
  }

  /**
   * Get all providers that have achieved at least the given certification level.
   */
  certifiedAtOrAbove(minimumLevel: CertificationLevel): CertificationRecord[] {
    const levelRank: Record<CertificationLevel, number> = {
      uncertified: 0,
      bronze: 1,
      silver: 2,
      gold: 3,
      platinum: 4,
    };

    const minRank = levelRank[minimumLevel];
    return this.query({ validOnly: true }).filter(
      (r) => levelRank[r.level] >= minRank,
    );
  }

  /**
   * Check whether a provider is currently certified (active and not expired).
   */
  isCertified(providerId: string): boolean {
    const record = this.records.get(providerId);
    if (!record) return false;
    return this.engine.effectiveStatus(record) === 'active';
  }

  // ─── Management ───────────────────────────────────────────────────────────

  /**
   * Remove a certification record entirely.
   */
  remove(providerId: string): boolean {
    return this.records.delete(providerId);
  }

  /**
   * Number of certifications currently stored.
   */
  get size(): number {
    return this.records.size;
  }

  /**
   * Refresh expired certifications by marking them as `expired`.
   *
   * Returns the number of certifications that were expired.
   */
  refreshExpiry(): number {
    let count = 0;
    for (const record of this.records.values()) {
      if (record.status === 'active' && this.engine.isExpired(record)) {
        record.status = 'expired';
        record.statusReason = 'Automatically expired';
        record.updatedAt = this.now();
        count++;
      }
    }
    return count;
  }

  /**
   * Get a summary of certification counts by level.
   */
  summary(): Record<CertificationLevel, number> {
    const summary: Record<CertificationLevel, number> = {
      platinum: 0,
      gold: 0,
      silver: 0,
      bronze: 0,
      uncertified: 0,
    };

    for (const record of this.records.values()) {
      const effectiveStatus = this.engine.effectiveStatus(record);
      if (effectiveStatus === 'active') {
        summary[record.level]++;
      }
    }

    return summary;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private persist(result: CertificationResult): void {
    const existing = this.records.get(result.providerId);
    const previousStatus = existing?.status;

    const record: CertificationRecord = {
      ...result,
      updatedAt: this.now(),
      statusReason: undefined,
    };

    this.records.set(result.providerId, record);

    if (existing && previousStatus && previousStatus !== result.status) {
      this.onStatusChange?.(result.providerId, previousStatus, result.status);
    }
  }
}
