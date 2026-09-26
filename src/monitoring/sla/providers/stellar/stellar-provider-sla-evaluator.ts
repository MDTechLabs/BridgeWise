/**
 * Stellar Provider SLA Evaluator
 *
 * Evaluates bridge providers against configurable SLA targets by tracking
 * uptime checks, measuring response times, and generating structured reports.
 *
 * @see Issue #469 — Implement Stellar Provider SLA Evaluator
 */

import type {
  ComplianceVerdict,
  ProviderId,
  SLABreakdown,
  SLAEvaluation,
  SLAEvaluatorConfig,
  SLAProviderReport,
  SLATargets,
  UptimeCheck,
  UptimeWindow,
  ResponseTimeStats,
} from './types';

import { DEFAULT_SLA_TARGETS } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function verdict(actual: number, target: number, higherIsBetter: boolean): ComplianceVerdict {
  const ratio = actual / target;
  if (higherIsBetter) {
    if (actual >= target) return 'pass';
    if (ratio >= 0.97) return 'warn';
    return 'fail';
  } else {
    if (actual <= target) return 'pass';
    if (ratio <= 1.1) return 'warn';
    return 'fail';
  }
}

function worstVerdict(verdicts: ComplianceVerdict[]): ComplianceVerdict {
  if (verdicts.includes('fail')) return 'fail';
  if (verdicts.includes('warn')) return 'warn';
  return 'pass';
}

function computeResponseStats(checks: UptimeCheck[]): ResponseTimeStats {
  const times = checks
    .map((c) => c.responseMs)
    .filter((ms): ms is number => ms !== undefined)
    .sort((a, b) => a - b);

  if (times.length === 0) {
    return { avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, minMs: 0, maxMs: 0 };
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    avgMs: Math.round(avg),
    p50Ms: percentile(times, 50),
    p95Ms: percentile(times, 95),
    p99Ms: percentile(times, 99),
    minMs: times[0],
    maxMs: times[times.length - 1],
  };
}

function computeUptimeWindow(checks: UptimeCheck[], label: string, durationMs: number): UptimeWindow {
  const total = checks.length;
  const successful = checks.filter((c) => c.available).length;
  return {
    label,
    durationMs,
    totalChecks: total,
    successfulChecks: successful,
    uptimePct: total === 0 ? 100 : (successful / total) * 100,
  };
}

function buildRecommendations(breakdown: SLABreakdown): string[] {
  const recs: string[] = [];
  if (breakdown.uptime.verdict !== 'pass') {
    recs.push(
      `Uptime is ${breakdown.uptime.actual.toFixed(2)}% — below target of ${breakdown.uptime.target}%. Investigate provider availability and add redundant endpoints.`,
    );
  }
  if (breakdown.avgResponse.verdict !== 'pass') {
    recs.push(
      `Average response time is ${breakdown.avgResponse.actual}ms — exceeds target of ${breakdown.avgResponse.target}ms. Review provider network latency and consider geographically closer nodes.`,
    );
  }
  if (breakdown.p99Response.verdict !== 'pass') {
    recs.push(
      `P99 response time is ${breakdown.p99Response.actual}ms — exceeds target of ${breakdown.p99Response.target}ms. Investigate tail-latency causes such as GC pauses or contention.`,
    );
  }
  if (breakdown.successRate.verdict !== 'pass') {
    recs.push(
      `Success rate is ${(breakdown.successRate.actual * 100).toFixed(1)}% — below target of ${(breakdown.successRate.target * 100).toFixed(1)}%. Review error logs for common failure patterns.`,
    );
  }
  if (recs.length === 0) {
    recs.push('All SLA targets are currently met. Continue monitoring.');
  }
  return recs;
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

export class StellarProviderSlaEvaluator {
  private readonly checks = new Map<ProviderId, UptimeCheck[]>();
  private readonly targets: SLATargets;
  private readonly windowMs: number;
  private readonly prevOverall = new Map<ProviderId, ComplianceVerdict>();

  private readonly onBreach?: SLAEvaluatorConfig['onBreach'];
  private readonly onRecovery?: SLAEvaluatorConfig['onRecovery'];

  constructor(config: SLAEvaluatorConfig = {}) {
    this.windowMs = config.windowMs ?? 86_400_000;
    this.targets = { ...DEFAULT_SLA_TARGETS, ...config.targets };
    this.onBreach = config.onBreach;
    this.onRecovery = config.onRecovery;
  }

  // ─── Uptime Recording ──────────────────────────────────────────────────────

  /**
   * Record the result of a single probe call for a provider.
   */
  recordCheck(providerId: ProviderId, check: UptimeCheck): void {
    if (!this.checks.has(providerId)) {
      this.checks.set(providerId, []);
    }
    this.checks.get(providerId)!.push(check);
    this.pruneOld(providerId);
  }

  /**
   * Convenience method to record an available probe.
   */
  recordSuccess(providerId: ProviderId, responseMs: number): void {
    this.recordCheck(providerId, { timestamp: new Date(), available: true, responseMs });
  }

  /**
   * Convenience method to record a failed probe.
   */
  recordFailure(providerId: ProviderId, error: string): void {
    this.recordCheck(providerId, { timestamp: new Date(), available: false, error });
  }

  // ─── Evaluation ────────────────────────────────────────────────────────────

  /**
   * Evaluate a provider's SLA compliance over the configured window.
   */
  evaluate(providerId: ProviderId): SLAEvaluation {
    const checks = this.getWindowChecks(providerId);
    const uptime = computeUptimeWindow(checks, `${this.windowMs / 3_600_000}h`, this.windowMs);
    const responseTime = computeResponseStats(checks);
    const total = checks.length;
    const successes = checks.filter((c) => c.available).length;
    const successRate = total === 0 ? 1 : successes / total;

    const breakdown: SLABreakdown = {
      uptime: {
        verdict: verdict(uptime.uptimePct, this.targets.minUptimePct, true),
        actual: uptime.uptimePct,
        target: this.targets.minUptimePct,
      },
      avgResponse: {
        verdict: verdict(responseTime.avgMs, this.targets.maxAvgResponseMs, false),
        actual: responseTime.avgMs,
        target: this.targets.maxAvgResponseMs,
      },
      p99Response: {
        verdict: verdict(responseTime.p99Ms, this.targets.maxP99ResponseMs, false),
        actual: responseTime.p99Ms,
        target: this.targets.maxP99ResponseMs,
      },
      successRate: {
        verdict: verdict(successRate, this.targets.minSuccessRate, true),
        actual: successRate,
        target: this.targets.minSuccessRate,
      },
    };

    const overall = worstVerdict(
      Object.values(breakdown).map((b) => b.verdict),
    );

    const evaluation: SLAEvaluation = {
      providerId,
      evaluatedAt: new Date(),
      windowMs: this.windowMs,
      targets: this.targets,
      uptime,
      responseTime,
      successRate,
      breakdown,
      overall,
    };

    this.handleTransitions(providerId, overall, evaluation);
    return evaluation;
  }

  /**
   * Evaluate all tracked providers and return sorted results (worst first).
   */
  evaluateAll(): SLAEvaluation[] {
    return Array.from(this.checks.keys())
      .map((id) => this.evaluate(id))
      .sort((a, b) => {
        const order: Record<ComplianceVerdict, number> = { fail: 0, warn: 1, pass: 2 };
        return order[a.overall] - order[b.overall];
      });
  }

  // ─── Reporting ─────────────────────────────────────────────────────────────

  /**
   * Generate a structured SLA report for a provider.
   */
  generateReport(providerId: ProviderId): SLAProviderReport {
    const evaluation = this.evaluate(providerId);
    const checks = this.getWindowChecks(providerId);

    const windows: UptimeWindow[] = [
      computeUptimeWindow(
        checks.filter((c) => c.timestamp >= new Date(Date.now() - 3_600_000)),
        '1h',
        3_600_000,
      ),
      computeUptimeWindow(
        checks.filter((c) => c.timestamp >= new Date(Date.now() - 86_400_000)),
        '24h',
        86_400_000,
      ),
      computeUptimeWindow(checks, `${this.windowMs / 3_600_000}h`, this.windowMs),
    ];

    const recommendations = buildRecommendations(evaluation.breakdown);

    const overall = evaluation.overall.toUpperCase();
    const summary = `Provider ${providerId} SLA evaluation: ${overall}. Uptime ${evaluation.uptime.uptimePct.toFixed(2)}%, avg response ${evaluation.responseTime.avgMs}ms, success rate ${(evaluation.successRate * 100).toFixed(1)}%.`;

    return {
      reportId: `sla-${providerId}-${Date.now()}`,
      providerId,
      generatedAt: new Date(),
      periodMs: this.windowMs,
      evaluation,
      windows,
      recommendations,
      summary,
    };
  }

  /**
   * Generate reports for all tracked providers.
   */
  generateAllReports(): SLAProviderReport[] {
    return Array.from(this.checks.keys()).map((id) => this.generateReport(id));
  }

  // ─── Introspection ─────────────────────────────────────────────────────────

  /** Return IDs of all tracked providers. */
  getProviderIds(): ProviderId[] {
    return Array.from(this.checks.keys());
  }

  /** Return the raw checks stored for a provider (within the window). */
  getChecks(providerId: ProviderId): UptimeCheck[] {
    return this.getWindowChecks(providerId);
  }

  /** Clear all recorded checks for a provider. */
  clearProvider(providerId: ProviderId): void {
    this.checks.delete(providerId);
    this.prevOverall.delete(providerId);
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private getWindowChecks(providerId: ProviderId): UptimeCheck[] {
    const cutoff = new Date(Date.now() - this.windowMs);
    return (this.checks.get(providerId) ?? []).filter((c) => c.timestamp >= cutoff);
  }

  private pruneOld(providerId: ProviderId): void {
    const cutoff = new Date(Date.now() - this.windowMs * 2);
    const current = this.checks.get(providerId) ?? [];
    this.checks.set(
      providerId,
      current.filter((c) => c.timestamp >= cutoff),
    );
  }

  private handleTransitions(
    providerId: ProviderId,
    overall: ComplianceVerdict,
    evaluation: SLAEvaluation,
  ): void {
    const prev = this.prevOverall.get(providerId);
    if (overall === 'fail' && prev !== 'fail') {
      this.onBreach?.(evaluation);
    } else if (overall === 'pass' && prev === 'fail') {
      this.onRecovery?.(providerId);
    }
    this.prevOverall.set(providerId, overall);
  }
}
