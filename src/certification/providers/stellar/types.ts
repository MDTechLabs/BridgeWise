/**
 * Certification level representing the tier of trust and quality
 * a bridge provider has achieved.
 *
 * - `platinum`: Exceeds all criteria (score ≥ 95)
 * - `gold`:     Meets all required criteria (score ≥ 85)
 * - `silver`:   Meets most criteria (score ≥ 70)
 * - `bronze`:   Meets basic criteria (score ≥ 50)
 * - `uncertified`: Does not meet minimum criteria (score < 50)
 */
export type CertificationLevel =
  | 'platinum'
  | 'gold'
  | 'silver'
  | 'bronze'
  | 'uncertified';

/**
 * The current lifecycle status of a provider's certification.
 */
export type CertificationStatus = 'active' | 'expired' | 'revoked' | 'pending';

// ─── Criteria ────────────────────────────────────────────────────────────────

/**
 * Weights that control how much each criterion contributes to the
 * overall certification score.  All values should sum to 1.
 */
export interface CertificationWeights {
  /** Security posture (HTTPS, valid metadata, etc.). Default 0.30. */
  security: number;
  /** Reliability (uptime, success rate). Default 0.25. */
  reliability: number;
  /** Performance (latency). Default 0.15. */
  performance: number;
  /** Compliance (version format, network, assets). Default 0.15. */
  compliance: number;
  /** Trust (registration age, history). Default 0.15. */
  trust: number;
}

/**
 * Thresholds that define the minimum score required for each
 * certification level (0–100 scale).
 */
export interface CertificationThresholds {
  /** Minimum total score for platinum tier. Default 95. */
  platinum: number;
  /** Minimum total score for gold tier. Default 85. */
  gold: number;
  /** Minimum total score for silver tier. Default 70. */
  silver: number;
  /** Minimum total score for bronze tier. Default 50. */
  bronze: number;
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

/**
 * The raw metrics that the certification engine uses to compute
 * criterion scores and the overall certification level.
 *
 * All fields default to 0 when not provided — the engine treats
 * missing data as the worst possible value for that dimension.
 */
export interface ProviderCertificationInput {
  /** Unique provider identifier (e.g. "allbridge"). */
  providerId: string;

  // Security
  /** Whether the provider endpoint uses HTTPS. */
  usesHttps: boolean;
  /** Whether the provider has passed metadata validation. */
  hasValidMetadata: boolean;

  // Reliability
  /** Uptime percentage (0–100). */
  uptime: number;
  /** Success rate for bridge operations (0–1). */
  successRate: number;

  // Performance
  /** Average latency in milliseconds. */
  avgLatencyMs: number;

  // Compliance
  /** Whether the version string follows semver. */
  versionIsSemver: boolean;
  /** Whether the network is explicitly supported (mainnet/testnet). */
  networkIsSupported: boolean;
  /** Number of supported assets (more is better, capped internally). */
  supportedAssetCount: number;

  // Trust
  /** How long the provider has been registered (epoch ms). */
  registeredAt: number;
  /** Number of successful operations in the provider's history. */
  historicalOperationCount: number;
}

// ─── Outputs ─────────────────────────────────────────────────────────────────

/**
 * Individual criterion score (0–100) with contributing sub-scores.
 */
export interface CriterionScore {
  /** The criterion name. */
  criterion: keyof CertificationWeights;
  /** Weighted score after the weight multiplier (0–100). */
  score: number;
  /** Optional human-readable rationale. */
  rationale: string;
}

/**
 * Full certification result produced after evaluating a provider.
 */
export interface CertificationResult {
  /** Provider identifier. */
  providerId: string;
  /** The awarded certification level. */
  level: CertificationLevel;
  /** Overall score (0–100). */
  score: number;
  /** Individual criterion breakdown. */
  criteria: CriterionScore[];
  /** Lifecycle status of this certification. */
  status: CertificationStatus;
  /** When the certification was issued (epoch ms). */
  issuedAt: number;
  /** When the certification expires (epoch ms, 0 = no expiry). */
  expiresAt: number;
  /** Free-text notes added by the system or an operator. */
  notes?: string;
}

/**
 * A stored certification record that lives in the registry.
 */
export interface CertificationRecord extends CertificationResult {
  /** When the record was last updated (epoch ms). */
  updatedAt: number;
  /** Reason for the last status change (e.g. "expired", "revoked"). */
  statusReason?: string;
}

// ─── Config / Engine Options ─────────────────────────────────────────────────

/**
 * Configuration for the certification engine.
 */
export interface CertificationEngineConfig {
  /** Custom scoring weights. */
  weights?: Partial<CertificationWeights>;
  /** Custom certification thresholds. */
  thresholds?: Partial<CertificationThresholds>;
  /** Clock override for deterministic testing. */
  now?: () => number;
  /** Certification validity duration in milliseconds. 0 = never expires. */
  validityDurationMs?: number;
  /** Called whenever a certification is issued. */
  onCertify?: (result: CertificationResult) => void;
}

/**
 * Configuration for the certification registry.
 */
export interface CertificationRegistryConfig {
  /** Maximum number of certifications to store. Default 500. */
  maxEntries?: number;
  /** Clock override for deterministic testing. */
  now?: () => number;
  /** Default engine configuration passed to created engines. */
  engineConfig?: CertificationEngineConfig;
  /** Called whenever a certification status changes (revoke, expire, re-certify). */
  onStatusChange?: (
    providerId: string,
    from: CertificationStatus,
    to: CertificationStatus,
  ) => void;
}

/**
 * Query filter for listing certifications.
 */
export interface CertificationQuery {
  /** Filter by certification level. */
  level?: CertificationLevel;
  /** Filter by lifecycle status. */
  status?: CertificationStatus;
  /** Only return certifications that are currently valid
   * (active and not expired). */
  validOnly?: boolean;
}
