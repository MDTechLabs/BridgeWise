import { createHash } from 'crypto';

export type ExecutionPath = 'stable' | 'canary';
export type CanaryRollbackReason =
  | 'operator'
  | 'automatic_failure_rate_threshold'
  | 'monitoring_alarm'
  | 'safety_incident';
export type ExecutionHandler<TMessage, TResult> = (
  message: TMessage,
) => Promise<TResult>;

export interface CanaryExecutionResult<TResult> {
  path: ExecutionPath;
  result: TResult;
}

export interface CanaryOutcomeMetric {
  path: ExecutionPath;
  success: boolean;
  durationMs: number;
}

export interface CanaryRollbackMetric {
  reason: CanaryRollbackReason;
}

export interface CanaryRolloutOptions {
  enabled?: boolean;
  trafficPercent?: number;
  autoRollback?: {
    failureRateThreshold?: number;
    minimumSamples?: number;
    sampleWindow?: number;
  };
  onOutcome?: (metric: CanaryOutcomeMetric) => void;
  onRollback?: (metric: CanaryRollbackMetric) => void;
}

export interface ExecutionPathMetrics {
  attempts: number;
  successes: number;
  failures: number;
  totalDurationMs: number;
}

export interface CanaryRolloutSnapshot {
  enabled: boolean;
  trafficPercent: number;
  rollbackReason?: CanaryRollbackReason;
  stable: ExecutionPathMetrics;
  canary: ExecutionPathMetrics;
  canaryFailureRate: number;
  canarySamplesInWindow: number;
}

const DEFAULT_FAILURE_RATE_THRESHOLD = 0.1;
const DEFAULT_MINIMUM_SAMPLES = 20;
const DEFAULT_SAMPLE_WINDOW = 100;

/**
 * Assigns each message consistently to the stable or candidate execution path,
 * tracks low-cardinality outcome metrics, and disables the canary on threshold.
 * A failed canary execution is never replayed on the stable path because its
 * chain-side effects may already have been submitted.
 */
export class CanaryRolloutRouter<
  TMessage extends { id: string },
  TResult extends { success: boolean },
> {
  private enabled: boolean;
  private trafficPercent: number;
  private rollbackReason?: CanaryRollbackReason;
  private readonly stableMetrics = this.emptyMetrics();
  private readonly canaryMetrics = this.emptyMetrics();
  private readonly canaryFailures: boolean[] = [];
  private readonly failureRateThreshold: number;
  private readonly minimumSamples: number;
  private readonly sampleWindow: number;

  constructor(
    private readonly stableHandler: ExecutionHandler<TMessage, TResult>,
    private readonly canaryHandler: ExecutionHandler<TMessage, TResult>,
    private readonly options: CanaryRolloutOptions = {},
  ) {
    this.enabled = options.enabled ?? false;
    this.trafficPercent = options.trafficPercent ?? 0;
    this.failureRateThreshold =
      options.autoRollback?.failureRateThreshold ??
      DEFAULT_FAILURE_RATE_THRESHOLD;
    this.minimumSamples =
      options.autoRollback?.minimumSamples ?? DEFAULT_MINIMUM_SAMPLES;
    this.sampleWindow =
      options.autoRollback?.sampleWindow ?? DEFAULT_SAMPLE_WINDOW;

    this.validateTrafficPercent(this.trafficPercent);
    if (
      !Number.isFinite(this.failureRateThreshold) ||
      this.failureRateThreshold <= 0 ||
      this.failureRateThreshold > 1
    ) {
      throw new RangeError('failureRateThreshold must be greater than 0 and at most 1');
    }
    if (
      !Number.isInteger(this.minimumSamples) ||
      this.minimumSamples < 1 ||
      !Number.isInteger(this.sampleWindow) ||
      this.sampleWindow < this.minimumSamples
    ) {
      throw new RangeError('sampleWindow must be an integer at least minimumSamples');
    }
  }

  /** Explicitly enables or adjusts canary traffic. Set to zero to disable. */
  setTrafficPercent(trafficPercent: number): void {
    this.validateTrafficPercent(trafficPercent);
    this.trafficPercent = trafficPercent;
    this.enabled = trafficPercent > 0;
    if (this.enabled) this.rollbackReason = undefined;
  }

  /** Immediately disables canary assignment in this router instance. */
  rollback(reason: CanaryRollbackReason = 'operator'): void {
    this.enabled = false;
    this.trafficPercent = 0;
    this.rollbackReason = reason;
    this.emitRollback(reason);
  }

  /** Stable deterministic assignment; the same message ID keeps its cohort. */
  isCanary(messageId: string): boolean {
    if (!this.enabled || this.trafficPercent <= 0) return false;
    if (this.trafficPercent >= 100) return true;

    const digest = createHash('sha256').update(messageId).digest();
    const bucket = digest.readUInt32BE(0) / 0x1_0000_0000;
    return bucket * 100 < this.trafficPercent;
  }

  async execute(message: TMessage): Promise<CanaryExecutionResult<TResult>> {
    const path: ExecutionPath = this.isCanary(message.id) ? 'canary' : 'stable';
    const handler = path === 'canary' ? this.canaryHandler : this.stableHandler;
    const startedAt = Date.now();

    try {
      const result = await handler(message);
      this.recordOutcome(path, result.success, Date.now() - startedAt);
      return { path, result };
    } catch (error) {
      this.recordOutcome(path, false, Date.now() - startedAt);
      throw error;
    }
  }

  getSnapshot(): CanaryRolloutSnapshot {
    const failures = this.canaryFailures.filter(Boolean).length;
    return {
      enabled: this.enabled,
      trafficPercent: this.trafficPercent,
      rollbackReason: this.rollbackReason,
      stable: { ...this.stableMetrics },
      canary: { ...this.canaryMetrics },
      canaryFailureRate:
        this.canaryFailures.length === 0 ? 0 : failures / this.canaryFailures.length,
      canarySamplesInWindow: this.canaryFailures.length,
    };
  }

  private recordOutcome(
    path: ExecutionPath,
    success: boolean,
    durationMs: number,
  ): void {
    const metrics = path === 'canary' ? this.canaryMetrics : this.stableMetrics;
    metrics.attempts++;
    metrics.totalDurationMs += durationMs;
    if (success) metrics.successes++;
    else metrics.failures++;

    this.emitOutcome({ path, success, durationMs });

    if (path !== 'canary') return;
    this.canaryFailures.push(!success);
    if (this.canaryFailures.length > this.sampleWindow) this.canaryFailures.shift();

    if (
      this.canaryFailures.length >= this.minimumSamples &&
      this.getSnapshot().canaryFailureRate >= this.failureRateThreshold
    ) {
      this.rollback('automatic_failure_rate_threshold');
    }
  }

  private validateTrafficPercent(trafficPercent: number): void {
    if (
      !Number.isFinite(trafficPercent) ||
      trafficPercent < 0 ||
      trafficPercent > 100
    ) {
      throw new RangeError('trafficPercent must be between 0 and 100');
    }
  }

  private emitOutcome(metric: CanaryOutcomeMetric): void {
    try {
      this.options.onOutcome?.(metric);
    } catch {
      // Monitoring failures must not change transaction execution behavior.
    }
  }

  private emitRollback(reason: CanaryRollbackReason): void {
    try {
      this.options.onRollback?.({ reason });
    } catch {
      // The local kill switch must remain effective if monitoring is unavailable.
    }
  }

  private emptyMetrics(): ExecutionPathMetrics {
    return { attempts: 0, successes: 0, failures: 0, totalDurationMs: 0 };
  }
}
