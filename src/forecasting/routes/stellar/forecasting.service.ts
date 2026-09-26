import { Injectable, Logger } from '@nestjs/common';

/**
 * A single historical metric sample for a Stellar route.
 *
 * Captured once per executed transfer so that downstream trend analysis
 * can reason about both latency (durationMs) and reliability (success)
 * behavior on the same timeline.
 */
export interface RouteMetricSample {
  routeId: string;
  /** When the transfer was executed. */
  timestamp: Date;
  /** Total transfer duration in milliseconds. */
  durationMs: number;
  /** Whether the transfer ultimately succeeded. */
  success: boolean;
}

/**
 * Aggregate description of the historical samples currently stored for a
 * route. Useful as a quick summary alongside the forward-looking forecast.
 */
export interface RouteHistoricalAnalysis {
  routeId: string;
  sampleSize: number;
  averageLatencyMs: number;
  /** Success rate in [0, 1]. */
  successRate: number;
  p95LatencyMs: number;
  standardDeviationMs: number;
  oldestSampleAt?: Date;
  newestSampleAt?: Date;
}

/**
 * Direction of a trend. Higher semantic values (lower latency, higher
 * reliability) correspond to `improving`.
 */
export type TrendDirection = 'improving' | 'stable' | 'declining';

export interface TrendForecastBase {
  routeId: string;
  trend: TrendDirection;
  /**
   * Signed relative delta driving the trend classification.
   * Positive values correspond to `improving` for both latency
   * (latency decreased) and reliability (success rate increased).
   */
  trendDelta: number;
  sampleSize: number;
  generatedAt: Date;
}

export interface LatencyTrendForecast extends TrendForecastBase {
  /** Point forecast (ms) computed via exponential moving average. */
  predictedLatencyMs: number;
  /** Raw EMA value, before rounding. */
  emaLatencyMs: number;
  recentAverageLatencyMs: number;
  historicalAverageLatencyMs: number;
  /** 95% confidence interval around the point forecast (ms). */
  confidenceIntervalMs: [number, number];
}

export interface ReliabilityTrendForecast extends TrendForecastBase {
  /** Point forecast in [0, 1]. */
  predictedReliability: number;
  recentSuccessRate: number;
  historicalSuccessRate: number;
  /** 95% binomial confidence interval around the point forecast. */
  confidenceInterval: [number, number];
}

/**
 * Composite forecast for a route. Backwards-compatible fields are kept on
 * the top level for easy consumption; richer structures are available in
 * `latency`, `reliability`, and `historical`.
 *
 * When no data has been recorded for the route, `latency` and
 * `reliability` will be `null`, legacy fields will be zero, and
 * `confidenceScore` will be `0`.
 */
export interface RouteForecast {
  routeId: string;
  /** Legacy field: predicted latency in ms. */
  predictedLatency: number;
  /** Legacy field: predicted reliability in [0, 1]. */
  predictedReliability: number;
  /** Overall confidence in the forecast in [0, 100]. */
  confidenceScore: number;
  latency: LatencyTrendForecast | null;
  reliability: ReliabilityTrendForecast | null;
  historical: RouteHistoricalAnalysis | null;
  generatedAt: Date;
}

export interface StellarRouteForecastingOptions {
  /** Maximum samples retained per route. Default 10_000. */
  maxSamples?: number;
  /**
   * EMA smoothing factor in (0, 1]. Higher values weight recent samples
   * more heavily. Default 0.3.
   */
  emaAlpha?: number;
  /**
   * Minimum absolute `trendDelta` required to classify a trend as
   * `improving` or `declining`. Smaller deltas are `stable`. Default 0.05.
   */
  trendThreshold?: number;
  /**
   * Fraction of the most recent samples treated as the "recent" window
   * for trend comparison. Default 0.25.
   */
  recentWindowRatio?: number;
}

const DEFAULT_OPTIONS: Required<StellarRouteForecastingOptions> = {
  maxSamples: 10_000,
  emaAlpha: 0.3,
  trendThreshold: 0.05,
  recentWindowRatio: 0.25,
};

/**
 * Forecasting engine for Stellar route performance.
 *
 * Takes a stream of historical `RouteMetricSample`s, summarizes them, and
 * projects forward-looking latency and reliability forecasts. The engine
 * uses exponential moving averages on durations and windowed success
 * proportions on outcomes to classify trends as improving, stable, or
 * declining with 95% confidence intervals.
 */
@Injectable()
export class StellarRouteForecastingService {
  private readonly logger = new Logger(StellarRouteForecastingService.name);
  private readonly options: Required<StellarRouteForecastingOptions>;
  private readonly samples = new Map<string, RouteMetricSample[]>();

  constructor(options: StellarRouteForecastingOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    if (this.options.emaAlpha <= 0 || this.options.emaAlpha > 1) {
      throw new Error('emaAlpha must be in the open interval (0, 1]');
    }
    if (this.options.trendThreshold < 0) {
      throw new Error('trendThreshold must be non-negative');
    }
    if (this.options.recentWindowRatio <= 0 || this.options.recentWindowRatio >= 1) {
      throw new Error('recentWindowRatio must be in the open interval (0, 1)');
    }
  }

  /**
   * Ingest a batch of historical samples for a route. Invalid entries
   * (non-finite duration, negative duration, invalid timestamp, null
   * values) are silently dropped. Samples are sorted chronologically
   * and capped at `maxSamples`.
   *
   * Returns `null` when every supplied sample fails validation, so
   * callers can distinguish "no analyzable data" from "analyzed but
   * trending at zero".
   */
  analyzeHistoricalMetrics(
    routeId: string,
    metrics: RouteMetricSample[],
  ): RouteHistoricalAnalysis | null {
    if (!routeId || !routeId.trim()) {
      throw new Error('routeId must be a non-empty string');
    }
    if (!Array.isArray(metrics)) {
      throw new Error('metrics must be an array of RouteMetricSample');
    }

    const cleaned = this.sanitize(metrics);
    cleaned.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const trimmed =
      cleaned.length > this.options.maxSamples
        ? cleaned.slice(cleaned.length - this.options.maxSamples)
        : cleaned;

    this.samples.set(routeId, trimmed);
    this.logger.log(
      `Analyzed ${trimmed.length} historical metrics for route ${routeId}` +
        ` (dropped ${metrics.length - cleaned.length} invalid)`,
    );

    if (trimmed.length === 0) {
      return null;
    }

    return this.computeHistoricalAnalysis(routeId);
  }

  /**
   * Project latency forward for a route using an exponential moving
   * average over the historical samples, comparing recent vs.
   * historical windows to classify a trend. Returns `null` when no
   * samples have been recorded for the route or `routeId` is empty.
   */
  predictLatencyTrends(routeId: string): LatencyTrendForecast | null {
    if (!routeId || !routeId.trim()) {
      throw new Error('routeId must be a non-empty string');
    }
    const series = this.samples.get(routeId);
    if (!series || series.length === 0) {
      this.logger.warn(`No metrics available to predict latency for route ${routeId}`);
      return null;
    }

    const recentWindowSize = this.recentWindowSize(series.length);
    const recent = series.slice(series.length - recentWindowSize);
    const historical = series.slice(0, series.length - recent.length);

    const recentAvg = mean(recent.map((s) => s.durationMs));
    const historicalAvg =
      historical.length > 0 ? mean(historical.map((s) => s.durationMs)) : recentAvg;

    const emaLatencyMs = this.computeEmaLatency(series);
    const stdDev = stdDeviation(recent.map((s) => s.durationMs));
    const margin = 1.96 * (series.length > 1 ? stdDev / Math.sqrt(series.length) : 0);

    // Positive delta means latency decreased (improving).
    const trendDelta =
      historicalAvg > 0 ? (historicalAvg - recentAvg) / historicalAvg : 0;

    return {
      routeId,
      predictedLatencyMs: round(emaLatencyMs),
      emaLatencyMs: round(emaLatencyMs),
      recentAverageLatencyMs: round(recentAvg),
      historicalAverageLatencyMs: round(historicalAvg),
      confidenceIntervalMs: [
        round(Math.max(0, emaLatencyMs - margin)),
        round(emaLatencyMs + margin),
      ],
      trend: classifyTrend(trendDelta, this.options.trendThreshold),
      trendDelta: round(trendDelta, 4),
      sampleSize: series.length,
      generatedAt: new Date(),
    };
  }

  /**
   * Project reliability (success rate) forward using windowed
   * proportions. Trend classification compares the recent window
   * success rate against the historical window. Returns `null` when no
   * samples have been recorded for the route or `routeId` is empty.
   *
   * The recent window size matches `predictLatencyTrends` so trend
   * deltas are computed against the same lookback for both metrics.
   */
  predictReliabilityTrends(routeId: string): ReliabilityTrendForecast | null {
    if (!routeId || !routeId.trim()) {
      throw new Error('routeId must be a non-empty string');
    }
    const series = this.samples.get(routeId);
    if (!series || series.length === 0) {
      this.logger.warn(`No metrics available to predict reliability for route ${routeId}`);
      return null;
    }

    const recentWindowSize = this.recentWindowSize(series.length);
    const recent = series.slice(series.length - recentWindowSize);
    const historical = series.slice(0, series.length - recent.length);

    const recentSuccessRate = sum(recent.map((s) => (s.success ? 1 : 0))) / recent.length;
    const historicalSuccessRate =
      historical.length > 0
        ? sum(historical.map((s) => (s.success ? 1 : 0))) / historical.length
        : recentSuccessRate;

    const trendDelta = recentSuccessRate - historicalSuccessRate;

    // 95% normal-approximation binomial interval.
    const margin =
      1.96 *
      Math.sqrt(
        (recentSuccessRate * (1 - recentSuccessRate)) / recent.length,
      );

    return {
      routeId,
      predictedReliability: round(recentSuccessRate, 4),
      recentSuccessRate: round(recentSuccessRate, 4),
      historicalSuccessRate: round(historicalSuccessRate, 4),
      confidenceInterval: [
        clampUnit(round(recentSuccessRate - margin, 4)),
        clampUnit(round(recentSuccessRate + margin, 4)),
      ],
      trend: classifyTrend(trendDelta, this.options.trendThreshold),
      trendDelta: round(trendDelta, 4),
      sampleSize: series.length,
      generatedAt: new Date(),
    };
  }

  /**
   * Build a composite forecast for the given route, including both
   * detailed latency/reliability trend forecasts and a summary
   * confidence score.
   *
   * The summary `confidenceScore` rewards larger sample sizes and
   * tighter prediction intervals. With no recorded data, all predictive
   * fields are zero/null and `confidenceScore` is `0`.
   */
  generateForecast(routeId: string): RouteForecast {
    if (!routeId || !routeId.trim()) {
      throw new Error('routeId must be a non-empty string');
    }

    const latency = this.predictLatencyTrends(routeId);
    const reliability = this.predictReliabilityTrends(routeId);
    const sampleSize = this.samples.get(routeId)?.length ?? 0;
    const historical =
      sampleSize > 0 ? this.computeHistoricalAnalysis(routeId) : null;

    return {
      routeId,
      predictedLatency: latency?.predictedLatencyMs ?? 0,
      predictedReliability: reliability?.predictedReliability ?? 0,
      confidenceScore: this.computeConfidenceScore(sampleSize, latency, reliability),
      latency,
      reliability,
      historical,
      generatedAt: new Date(),
    };
  }

  /**
   * Forget all stored metrics. Useful for tests and long-running
   * instances that want to reset internal state.
   */
  reset(): void {
    this.samples.clear();
  }

  /**
   * Snapshot the currently-stored samples for a route. Returns a copy
   * so callers cannot mutate internal state.
   */
  getStoredSamples(routeId: string): RouteMetricSample[] {
    const series = this.samples.get(routeId);
    return series ? series.map((s) => ({ ...s, timestamp: new Date(s.timestamp) })) : [];
  }

  private computeHistoricalAnalysis(routeId: string): RouteHistoricalAnalysis {
    const series = this.samples.get(routeId) ?? [];
    const durations = series.map((s) => s.durationMs);
    const avg = mean(durations);
    const stdDev = stdDeviation(durations);
    const sortedDurations = [...durations].sort((a, b) => a - b);
    const p95Index = Math.min(
      sortedDurations.length - 1,
      Math.floor(sortedDurations.length * 0.95),
    );
    const successCount = series.reduce((acc, s) => acc + (s.success ? 1 : 0), 0);

    return {
      routeId,
      sampleSize: series.length,
      averageLatencyMs: round(avg),
      successRate: round(successCount / Math.max(1, series.length), 4),
      p95LatencyMs: round(sortedDurations[p95Index]),
      standardDeviationMs: round(stdDev, 2),
      oldestSampleAt: series[0]?.timestamp,
      newestSampleAt: series[series.length - 1]?.timestamp,
    };
  }

  private computeConfidenceScore(
    sampleSize: number,
    latency: LatencyTrendForecast | null,
    reliability: ReliabilityTrendForecast | null,
  ): number {
    if (sampleSize === 0 || (!latency && !reliability)) {
      return 0;
    }

    // Log-shaped sample contribution so a small number of samples isn't
    // meaningless but we cap the bonus to avoid runaway confidence.
    const sampleScore = Math.min(50, Math.round(Math.log10(sampleSize + 1) * 25));

    let stabilityBonus = 0;
    if (latency) {
      const intervalWidth =
        latency.confidenceIntervalMs[1] - latency.confidenceIntervalMs[0];
      const normalizedMean =
        latency.predictedLatencyMs === 0
          ? 0
          : Math.min(1, intervalWidth / latency.predictedLatencyMs);
      // Tighter interval (lower normalized width) earns more confidence.
      stabilityBonus += Math.round(25 * Math.max(0, 1 - normalizedMean));
    }
    if (reliability) {
      const intervalWidth =
        reliability.confidenceInterval[1] - reliability.confidenceInterval[0];
      // Tighter interval (lower width) earns more confidence.
      stabilityBonus += Math.round(25 * Math.max(0, 1 - intervalWidth * 5));
    }

    return clampValue(sampleScore + stabilityBonus, 0, 100);
  }

  private computeEmaLatency(series: RouteMetricSample[]): number {
    const alpha = this.options.emaAlpha;
    let ema = series[0].durationMs;
    for (let i = 1; i < series.length; i += 1) {
      ema = alpha * series[i].durationMs + (1 - alpha) * ema;
    }
    return ema;
  }

  private sanitize(metrics: RouteMetricSample[]): RouteMetricSample[] {
    const result: RouteMetricSample[] = [];
    for (const m of metrics) {
      if (!m) continue;
      if (typeof m.durationMs !== 'number' || !Number.isFinite(m.durationMs)) continue;
      if (m.durationMs < 0) continue;
      if (!(m.timestamp instanceof Date) || Number.isNaN(m.timestamp.getTime())) continue;
      result.push({
        routeId: m.routeId,
        timestamp: new Date(m.timestamp.getTime()),
        durationMs: m.durationMs,
        success: Boolean(m.success),
      });
    }
    return result;
  }

  /**
   * Derives a consistent recent-window size for both predictors so
   * trend deltas are computed against the same lookback regardless
   * of which metric is being projected.
   */
  private recentWindowSize(seriesLength: number): number {
    const minWindow = Math.min(2, seriesLength);
    const computed = Math.floor(seriesLength * this.options.recentWindowRatio);
    return Math.max(minWindow, computed);
  }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function stdDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const varianceSum = values.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return Math.sqrt(varianceSum / values.length);
}

function round(value: number, places = 0): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function clampUnit(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clampValue(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function classifyTrend(delta: number, threshold: number): TrendDirection {
  if (!Number.isFinite(delta) || Math.abs(delta) < threshold) return 'stable';
  return delta > 0 ? 'improving' : 'declining';
}
