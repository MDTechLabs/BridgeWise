import {
  ApplicationCompatSummary,
  BridgeProviderRecord,
  CompatibilityQuery,
  CompatibilityRecord,
  CompatibilityReport,
  CompatibilityStatus,
  ProviderCompatSummary,
  SorobanApplication,
} from './soroban-bridge-compatibility-matrix.types';

/**
 * File: src/compatibility/bridges/stellar/soroban-bridge-compatibility-matrix.ts
 *
 * Tracks compatibility between Soroban applications and bridge
 * providers so callers can answer questions like
 * "can provider X support the features required by application A?" before
 * attempting an integration.
 *
 * The matrix keeps three concerns separate:
 *   - **Applications** (`SorobanApplication`) — what we want to integrate
 *   - **Providers** (`BridgeProviderRecord`) — what we want to integrate *with*
 *   - **Records** (`CompatibilityRecord`) — the upsert-friendly compatibility verdict
 *
 * Use cases:
 *   - Validate a `(app, provider)` pair before scheduling a bridge transfer
 *   - Generate a per-application or per-provider coverage report
 *   - Surface unsupported features as warnings to the integrator
 *
 * Example:
 *   const matrix = new SorobanBridgeCompatibilityMatrix();
 *   matrix.registerApplications([
 *     { id: 'C_DEX', name: 'SorobanDEX', type: 'dex', features: ['SEP-41', 'swap'] },
 *   ]);
 *   matrix.registerProviders([
 *     { id: 'allbridge', name: 'Allbridge', features: ['SEP-41', 'transfer'], supportedChains: ['stellar'], supportedAssets: ['USDC'] },
 *   ]);
 *   matrix.upsertRecord({ applicationId: 'C_DEX', providerId: 'allbridge', compatible: false, supportedFeatures: ['SEP-41'], unsupportedFeatures: ['swap'], warnings: ['Missing swap adapter'], scannedAt: Date.now() });
 */
export class SorobanBridgeCompatibilityMatrix {
  private readonly applications = new Map<string, SorobanApplication>();
  private readonly providers = new Map<string, BridgeProviderRecord>();
  private readonly records = new Map<string, CompatibilityRecord>();
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  // ─── Registration ─────────────────────────────────────────────────────────

  /** Register a single application. Replaces any existing application with the same id. */
  registerApplication(application: SorobanApplication): void {
    this.applications.set(application.id, application);
  }

  /** Register many applications. Replaces any existing applications with matching ids. */
  registerApplications(applications: SorobanApplication[]): void {
    for (const application of applications) {
      this.registerApplication(application);
    }
  }

  /** Register a single provider. Replaces any existing provider with the same id. */
  registerProvider(provider: BridgeProviderRecord): void {
    this.providers.set(provider.id, provider);
  }

  /** Register many providers. Replaces any existing providers with matching ids. */
  registerProviders(providers: BridgeProviderRecord[]): void {
    for (const provider of providers) {
      this.registerProvider(provider);
    }
  }

  /** Remove a registered application and all of its compatibility records. */
  removeApplication(applicationId: string): boolean {
    const existed = this.applications.delete(applicationId);
    if (!existed) return false;
    for (const [key, record] of this.records) {
      if (record.applicationId === applicationId) {
        this.records.delete(key);
      }
    }
    return true;
  }

  /** Remove a registered provider and all of its compatibility records. */
  removeProvider(providerId: string): boolean {
    const existed = this.providers.delete(providerId);
    if (!existed) return false;
    for (const [key, record] of this.records) {
      if (record.providerId === providerId) {
        this.records.delete(key);
      }
    }
    return true;
  }

  // ─── Records ──────────────────────────────────────────────────────────────

  /**
   * Insert or update the compatibility record for an `(application, provider)`
   * pair. Existing entries are overwritten so background scanners can
   * refresh without manual cleanup.
   */
  upsertRecord(
    input: Omit<CompatibilityRecord, 'scannedAt'> & { scannedAt?: number },
  ): CompatibilityRecord {
    const scannedAt = input.scannedAt ?? this.now();
    const record: CompatibilityRecord = {
      applicationId: input.applicationId,
      providerId: input.providerId,
      compatible: input.compatible,
      supportedFeatures: [...input.supportedFeatures],
      unsupportedFeatures: [...input.unsupportedFeatures],
      warnings: [...input.warnings],
      notes: input.notes,
      scannedAt,
    };
    this.records.set(
      this.recordKey(record.applicationId, record.providerId),
      record,
    );
    return record;
  }

  /**
   * Convenience helper that derives `supportedFeatures` and `unsupportedFeatures`
   * from the intersection of `application.features` and `provider.features`,
   * then stores the resulting record.
   *
   * The verdict is `true` iff every feature the application requires is
   * supported by the provider. The union of missing features is also
   * surfaced as a warning.
   */
  scanAndUpsert(
    applicationId: string,
    providerId: string,
    options: { notes?: string } = {},
  ): CompatibilityRecord | null {
    const application = this.applications.get(applicationId);
    const provider = this.providers.get(providerId);
    if (!application || !provider) return null;

    const supportedFeatures: string[] = [];
    const unsupportedFeatures: string[] = [];
    const warnings: string[] = [];

    for (const feature of application.features) {
      if (provider.features.includes(feature)) {
        supportedFeatures.push(feature);
      } else {
        unsupportedFeatures.push(feature);
        warnings.push(
          `Provider "${provider.name}" does not support feature "${feature}" required by application "${application.name}".`,
        );
      }
    }

    return this.upsertRecord({
      applicationId,
      providerId,
      compatible: unsupportedFeatures.length === 0,
      supportedFeatures,
      unsupportedFeatures,
      warnings,
      notes: options.notes,
    });
  }

  /** Remove a compatibility record. Returns `true` if a record was removed. */
  removeRecord(applicationId: string, providerId: string): boolean {
    return this.records.delete(this.recordKey(applicationId, providerId));
  }

  /** Look up the raw record for an `(application, provider)` pair. */
  getRecord(
    applicationId: string,
    providerId: string,
  ): CompatibilityRecord | undefined {
    return this.records.get(this.recordKey(applicationId, providerId));
  }

  /** All compatibility records currently stored. */
  getAllRecords(): CompatibilityRecord[] {
    return [...this.records.values()];
  }

  // ─── Query ────────────────────────────────────────────────────────────────

  /**
   * Look up the compatibility verdict for an `(application, provider)` pair.
   * Returns `{ compatible: false, record: null }` when no record exists so
   * callers can distinguish "unknown" from "known incompatible".
   */
  query(q: CompatibilityQuery): CompatibilityStatus {
    const record = this.getRecord(q.applicationId, q.providerId);
    if (!record) return { compatible: false, record: null };
    return { compatible: record.compatible, record };
  }

  /** Convenience boolean wrapper around `query`. */
  isCompatible(applicationId: string, providerId: string): boolean {
    return this.query({ applicationId, providerId }).compatible;
  }

  /**
   * All records where `providerId` is the provider.
   * When `compatibleOnly` is set, only `compatible: true` records are returned.
   */
  getProvidersForApplication(
    applicationId: string,
    compatibleOnly: boolean = false,
  ): CompatibilityRecord[] {
    return this.getAllRecords().filter(
      (r) =>
        r.applicationId === applicationId && (!compatibleOnly || r.compatible),
    );
  }

  /**
   * All records where `applicationId` is the application.
   * When `compatibleOnly` is set, only `compatible: true` records are returned.
   */
  getApplicationsForProvider(
    providerId: string,
    compatibleOnly: boolean = false,
  ): CompatibilityRecord[] {
    return this.getAllRecords().filter(
      (r) => r.providerId === providerId && (!compatibleOnly || r.compatible),
    );
  }

  /**
   * Registered applications snapshot.
   */
  getApplications(): SorobanApplication[] {
    return [...this.applications.values()];
  }

  /**
   * Registered providers snapshot.
   */
  getProviders(): BridgeProviderRecord[] {
    return [...this.providers.values()];
  }

  // ─── Reports ──────────────────────────────────────────────────────────────

  /**
   * Build a structured report summarizing the matrix's overall state.
   * The report includes overall counts, per-application breakdown,
   * per-provider breakdown, and the full list of incompatible records.
   */
  generateReport(): CompatibilityReport {
    const records = this.getAllRecords();
    const applications = this.getApplications();
    const providers = this.getProviders();

    const compatibleRecords = records.filter((r) => r.compatible).length;
    const incompatibleRecords = records.length - compatibleRecords;
    const compatibilityRate =
      records.length === 0 ? 0 : compatibleRecords / records.length;

    const byApplication: ApplicationCompatSummary[] = applications.map(
      (app) => {
        const appRecords = records.filter((r) => r.applicationId === app.id);
        const compatible = appRecords.filter((r) => r.compatible).length;
        return {
          applicationId: app.id,
          applicationName: app.name,
          applicationType: app.type,
          providerCount: appRecords.length,
          compatibleProviderCount: compatible,
          compatibilityRate:
            appRecords.length === 0 ? 0 : compatible / appRecords.length,
        };
      },
    );

    const byProvider: ProviderCompatSummary[] = providers.map((provider) => {
      const providerRecords = records.filter(
        (r) => r.providerId === provider.id,
      );
      const compatible = providerRecords.filter((r) => r.compatible).length;
      return {
        providerId: provider.id,
        providerName: provider.name,
        applicationCount: providerRecords.length,
        compatibleApplicationCount: compatible,
        compatibilityRate:
          providerRecords.length === 0
            ? 0
            : compatible / providerRecords.length,
      };
    });

    const incompatibilities = records.filter((r) => !r.compatible);

    return {
      summary: {
        totalApplications: applications.length,
        totalProviders: providers.length,
        totalRecords: records.length,
        compatibleRecords,
        incompatibleRecords,
        compatibilityRate,
        generatedAt: this.now(),
      },
      byApplication,
      byProvider,
      incompatibilities,
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private recordKey(applicationId: string, providerId: string): string {
    return `${applicationId}<>${providerId}`;
  }
}
