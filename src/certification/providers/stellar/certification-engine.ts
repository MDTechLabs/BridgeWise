import {
  ProviderCertificationInput,
  CertificationResult,
  CertificationWeights,
  CertificationThresholds,
  CertificationLevel,
  CertificationStatus,
  CriterionScore,
  CertificationEngineConfig,
} from './types';

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS: CertificationWeights = {
  security: 0.3,
  reliability: 0.25,
  performance: 0.15,
  compliance: 0.15,
  trust: 0.15,
};

const DEFAULT_THRESHOLDS: CertificationThresholds = {
  platinum: 95,
  gold: 85,
  silver: 70,
  bronze: 50,
};

/** Cap for supported asset count so a single metric cannot dominate. */
const MAX_ASSET_SCORE_CAP = 20;

/** Cap for historical operation count so it doesn't dominate trust. */
const MAX_OPS_SCORE_CAP = 10_000;

/** Minimum registration age in ms considered "fully trusted". */
const MAX_REGISTRATION_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// ─── Engine ──────────────────────────────────────────────────────────────────

/**
 * Evaluates a Soroban bridge provider against a set of certification criteria
 * and produces a {@link CertificationResult} with a level, score, and
 * per-criterion breakdown.
 *
 * The engine is stateless — all state management lives in
 * {@link CertificationRegistry}.
 *
 * @example
 * const engine = new CertificationEngine();
 * const result = engine.evaluate({
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
export class CertificationEngine {
  private readonly weights: CertificationWeights;
  private readonly thresholds: CertificationThresholds;
  private readonly now: () => number;
  private readonly validityDurationMs: number;
  private readonly onCertify?: (result: CertificationResult) => void;

  constructor(config: CertificationEngineConfig = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...config.weights };
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...config.thresholds };
    this.now = config.now ?? (() => Date.now());
    this.validityDurationMs = config.validityDurationMs ?? 0;
    this.onCertify = config.onCertify;

    this.validateWeights();
    this.validateThresholds();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Evaluate a single provider and return a certification result.
   */
  evaluate(input: ProviderCertificationInput): CertificationResult {
    const criteria = this.computeCriteria(input);
    const score = criteria.reduce((sum, c) => sum + c.score, 0);
    const level = this.determineLevel(score);
    const issuedAt = this.now();

    const result: CertificationResult = {
      providerId: input.providerId,
      level,
      score: Math.round(score * 100) / 100,
      criteria,
      status: 'active',
      issuedAt,
      expiresAt:
        this.validityDurationMs > 0 ? issuedAt + this.validityDurationMs : 0,
    };

    this.onCertify?.(result);
    return result;
  }

  // ─── Criterion Scoring ────────────────────────────────────────────────────

  private computeCriteria(input: ProviderCertificationInput): CriterionScore[] {
    return [
      this.securityCriterion(input),
      this.reliabilityCriterion(input),
      this.performanceCriterion(input),
      this.complianceCriterion(input),
      this.trustCriterion(input),
    ];
  }

  private securityCriterion(input: ProviderCertificationInput): CriterionScore {
    let raw = 0;
    const reasons: string[] = [];

    if (input.usesHttps) {
      raw += 50;
    } else {
      reasons.push('no HTTPS');
    }

    if (input.hasValidMetadata) {
      raw += 50;
    } else {
      reasons.push('invalid metadata');
    }

    return {
      criterion: 'security',
      score: raw * this.weights.security,
      rationale: reasons.length
        ? `Security score ${raw}/100: ${reasons.join(', ')}`
        : `Security score ${raw}/100: fully compliant`,
    };
  }

  private reliabilityCriterion(
    input: ProviderCertificationInput,
  ): CriterionScore {
    const uptimeScore = Math.min(100, input.uptime);
    const successScore = Math.min(100, input.successRate * 100);
    const raw = uptimeScore * 0.5 + successScore * 0.5;

    let rationale = `Uptime ${input.uptime.toFixed(1)}%, success rate ${(input.successRate * 100).toFixed(1)}%`;
    if (raw < 50) {
      rationale += ' — critically low';
    } else if (raw < 85) {
      rationale += ' — below targets';
    }

    return {
      criterion: 'reliability',
      score: raw * this.weights.reliability,
      rationale,
    };
  }

  private performanceCriterion(
    input: ProviderCertificationInput,
  ): CriterionScore {
    if (input.avgLatencyMs <= 0) {
      return {
        criterion: 'performance',
        score: 0,
        rationale: 'No latency data available',
      };
    }

    // Linear decay: 100 at 0ms, 0 at 2000ms
    const raw = Math.max(0, 100 - (input.avgLatencyMs / 2000) * 100);

    return {
      criterion: 'performance',
      score: raw * this.weights.performance,
      rationale: `Latency ${input.avgLatencyMs.toFixed(0)}ms`,
    };
  }

  private complianceCriterion(
    input: ProviderCertificationInput,
  ): CriterionScore {
    let raw = 0;
    const checks: string[] = [];

    if (input.versionIsSemver) {
      raw += 34;
    } else {
      checks.push('version not semver');
    }

    if (input.networkIsSupported) {
      raw += 33;
    } else {
      checks.push('unsupported network');
    }

    const assetRatio = Math.min(
      1,
      input.supportedAssetCount / MAX_ASSET_SCORE_CAP,
    );
    raw += Math.round(assetRatio * 33);

    return {
      criterion: 'compliance',
      score: raw * this.weights.compliance,
      rationale: checks.length
        ? `Compliance ${raw}/100: ${checks.join(', ')}`
        : `Compliance ${raw}/100: fully compliant`,
    };
  }

  private trustCriterion(input: ProviderCertificationInput): CriterionScore {
    // Registration age contributes 50%
    const ageMs = Math.max(0, this.now() - input.registeredAt);
    const ageRatio = Math.min(1, ageMs / MAX_REGISTRATION_AGE_MS);
    const ageScore = ageRatio * 50;

    // Historical operations contribute 50%
    const opsRatio = Math.min(
      1,
      input.historicalOperationCount / MAX_OPS_SCORE_CAP,
    );
    const opsScore = opsRatio * 50;

    const raw = ageScore + opsScore;

    const days = Math.round(ageMs / (24 * 60 * 60 * 1000));
    return {
      criterion: 'trust',
      score: raw * this.weights.trust,
      rationale: `Registered ${days}d ago, ${input.historicalOperationCount} historical ops`,
    };
  }

  // ─── Level Determination ──────────────────────────────────────────────────

  private determineLevel(score: number): CertificationLevel {
    if (score >= this.thresholds.platinum) return 'platinum';
    if (score >= this.thresholds.gold) return 'gold';
    if (score >= this.thresholds.silver) return 'silver';
    if (score >= this.thresholds.bronze) return 'bronze';
    return 'uncertified';
  }

  // ─── Status Helpers ───────────────────────────────────────────────────────

  /**
   * Determine whether a certification has expired based on its `expiresAt`.
   */
  isExpired(result: CertificationResult): boolean {
    if (result.expiresAt <= 0) return false;
    return this.now() >= result.expiresAt;
  }

  /**
   * Get the effective status for a certification, accounting for expiry.
   */
  effectiveStatus(result: CertificationResult): CertificationStatus {
    if (result.status === 'revoked') return 'revoked';
    if (result.status === 'pending') return 'pending';
    if (this.isExpired(result)) return 'expired';
    return 'active';
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  private validateWeights(): void {
    const sum =
      this.weights.security +
      this.weights.reliability +
      this.weights.performance +
      this.weights.compliance +
      this.weights.trust;

    if (Math.abs(sum - 1) > 0.001) {
      throw new RangeError(`Certification weights must sum to 1, got ${sum}`);
    }
  }

  private validateThresholds(): void {
    const { platinum, gold, silver, bronze } = this.thresholds;
    if (platinum <= gold || gold <= silver || silver <= bronze) {
      throw new RangeError(
        'Certification thresholds must be strictly decreasing: platinum > gold > silver > bronze',
      );
    }
    if (bronze < 0 || platinum > 100) {
      throw new RangeError(
        'Certification thresholds must be in range [0, 100]',
      );
    }
  }
}
