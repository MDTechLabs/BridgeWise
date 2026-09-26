/**
 * File: src/compatibility/bridges/stellar/soroban-bridge-compatibility-matrix.types.ts
 *
 * Type definitions for the SorobanBridgeCompatibilityMatrix.
 * The matrix tracks which Soroban applications are compatible with
 * which bridge providers so callers can answer questions like
 * "can provider X support the features required by application A?" before
 * attempting an integration.
 *
 * These types intentionally live in their own file to keep the runtime
 * class small and to avoid accidental name collisions with the
 * chain-pair matrix types in `src/compatibility/matrix/stellar`.
 */

export type SorobanApplicationType =
  | 'contract'
  | 'dex'
  | 'lending'
  | 'bridge'
  | 'nft'
  | 'custom';

/**
 * A Soroban application is anything an integrator might want to bridge
 * for — a low-level contract, a high-level DEX, etc. The `type`
 * discriminator allows the matrix to handle all of them uniformly.
 */
export interface SorobanApplication {
  /** Stable identifier (contract ID, app slug, etc). */
  id: string;
  /** Display name. */
  name: string;
  /** Category used for reporting and filtering. */
  type: SorobanApplicationType;
  /** Optional contract/application version. */
  version?: string;
  /** Soroban features this application requires (e.g. `SEP-41`, `transfer`). */
  features: string[];
}

/**
 * Bridge provider metadata used by the matrix to describe what an
 * integrator needs to know about a provider before recording
 * compatibility records.
 */
export interface BridgeProviderRecord {
  /** Stable identifier (e.g. `allbridge`, `squid`). */
  id: string;
  /** Display name. */
  name: string;
  /** Chains this provider can route between. */
  supportedChains: string[];
  /** Assets this provider supports. */
  supportedAssets: string[];
  /** Soroban features this provider supports (e.g. `SEP-41`, `custom_types_v2`). */
  features: string[];
}

/**
 * A single compatibility record. One record per (application, provider)
 * pair; the matrix is upsert-friendly so background scanners can
 * refresh records without manual cleanup.
 */
export interface CompatibilityRecord {
  applicationId: string;
  providerId: string;
  compatible: boolean;
  /** Features supported by the provider for this application. */
  supportedFeatures: string[];
  /** Features required by the application that the provider lacks. */
  unsupportedFeatures: string[];
  /** Non-fatal warnings raised during the scan. */
  warnings: string[];
  /** Optional free-form notes from the operator. */
  notes?: string;
  scannedAt: number;
}

export interface CompatibilityQuery {
  applicationId: string;
  providerId: string;
}

export interface CompatibilityStatus {
  compatible: boolean;
  record: CompatibilityRecord | null;
}

export interface ApplicationCompatSummary {
  applicationId: string;
  applicationName: string;
  applicationType: SorobanApplicationType;
  providerCount: number;
  compatibleProviderCount: number;
  compatibilityRate: number;
}

export interface ProviderCompatSummary {
  providerId: string;
  providerName: string;
  applicationCount: number;
  compatibleApplicationCount: number;
  compatibilityRate: number;
}

/**
 * Aggregate report returned by `SorobanBridgeCompatibilityMatrix.generateReport`.
 */
export interface CompatibilityReport {
  summary: {
    totalApplications: number;
    totalProviders: number;
    totalRecords: number;
    compatibleRecords: number;
    incompatibleRecords: number;
    /** Between 0 and 1; `0` when there are no records. */
    compatibilityRate: number;
    generatedAt: number;
  };
  byApplication: ApplicationCompatSummary[];
  byProvider: ProviderCompatSummary[];
  /** Every incompatible record, useful for remediation. */
  incompatibilities: CompatibilityRecord[];
}
