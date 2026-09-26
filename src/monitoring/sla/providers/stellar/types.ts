/**
 * Stellar Provider SLA Evaluator Types
 *
 * Defines types for evaluating bridge providers against SLA targets,
 * tracking uptime metrics, response times, and generating SLA reports.
 *
 * @see Issue #469 — Implement Stellar Provider SLA Evaluator
 */

// ─── Provider Identity ────────────────────────────────────────────────────────

/** Unique identifier for a bridge provider. */
export type ProviderId = string;

// ─── SLA Targets ─────────────────────────────────────────────────────────────

/** Target SLA thresholds that a provider must meet. */
export interface SLATargets {
  /** Minimum uptime percentage (0–100). Default: 99.5 */
  minUptimePct: number;
  /** Maximum acceptable average response time in ms. Default: 2000 */
  maxAvgResponseMs: number;
  /** Maximum acceptable p99 response time in ms. Default: 8000 */
  maxP99ResponseMs: number;
  /** Minimum success rate (0–1). Default: 0.97 */
  minSuccessRate: number;
}

/** Default SLA targets applied when none are specified. */
export const DEFAULT_SLA_TARGETS: SLATargets = {
  minUptimePct: 99.5,
  maxAvgResponseMs: 2_000,
  maxP99ResponseMs: 8_000,
  minSuccessRate: 0.97,
};

// ─── Uptime Tracking ──────────────────────────────────────────────────────────

/** A single uptime check result for a provider. */
export interface UptimeCheck {
  /** When the check was performed. */
  timestamp: Date;
  /** Whether the provider responded successfully. */
  available: boolean;
  /** Round-trip response time in ms (undefined if unavailable). */
  responseMs?: number;
  /** Error message if the check failed. */
  error?: string;
}

/** Rolling uptime window metrics. */
export interface UptimeWindow {
  /** Window label (e.g. "1h", "24h", "7d"). */
  label: string;
  /** Duration of the window in milliseconds. */
  durationMs: number;
  /** Number of checks in this window. */
  totalChecks: number;
  /** Number of successful checks. */
  successfulChecks: number;
  /** Uptime percentage for this window. */
  uptimePct: number;
}

// ─── Response Time Metrics ────────────────────────────────────────────────────

/** Computed response-time statistics for a measurement window. */
export interface ResponseTimeStats {
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
}

// ─── SLA Evaluation Result ────────────────────────────────────────────────────

/** SLA compliance verdict for a single metric. */
export type ComplianceVerdict = 'pass' | 'warn' | 'fail';

/** Breakdown of compliance for each SLA metric. */
export interface SLABreakdown {
  uptime: { verdict: ComplianceVerdict; actual: number; target: number };
  avgResponse: { verdict: ComplianceVerdict; actual: number; target: number };
  p99Response: { verdict: ComplianceVerdict; actual: number; target: number };
  successRate: { verdict: ComplianceVerdict; actual: number; target: number };
}

/** Full SLA evaluation result for a provider. */
export interface SLAEvaluation {
  providerId: ProviderId;
  evaluatedAt: Date;
  windowMs: number;
  targets: SLATargets;
  uptime: UptimeWindow;
  responseTime: ResponseTimeStats;
  successRate: number;
  breakdown: SLABreakdown;
  /** Overall SLA status derived from breakdown verdicts. */
  overall: ComplianceVerdict;
}

// ─── SLA Report ───────────────────────────────────────────────────────────────

/** A generated SLA report for a provider over a specified period. */
export interface SLAProviderReport {
  reportId: string;
  providerId: ProviderId;
  generatedAt: Date;
  periodMs: number;
  evaluation: SLAEvaluation;
  windows: UptimeWindow[];
  recommendations: string[];
  summary: string;
}

// ─── Evaluator Config ─────────────────────────────────────────────────────────

/** Configuration for the StellarProviderSlaEvaluator. */
export interface SLAEvaluatorConfig {
  /** Evaluation window in ms. Default: 86_400_000 (24 h). */
  windowMs?: number;
  /** Custom SLA targets (merged with defaults). */
  targets?: Partial<SLATargets>;
  /** Callback invoked when a provider breaches an SLA target. */
  onBreach?: (evaluation: SLAEvaluation) => void;
  /** Callback invoked when a provider recovers (was failing, now passing). */
  onRecovery?: (providerId: ProviderId) => void;
}
