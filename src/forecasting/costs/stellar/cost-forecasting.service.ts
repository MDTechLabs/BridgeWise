import { Injectable, Logger } from '@nestjs/common';

export interface CostSample {
  routeId: string;
  timestamp: Date;
  /** Total fee in stroops (1 XLM = 10_000_000 stroops). */
  feeStroops: number;
  success: boolean;
}

export interface CostHistoricalAnalysis {
  routeId: string;
  sampleSize: number;
  averageFeeStroops: number;
  p95FeeStroops: number;
  standardDeviationStroops: number;
  oldestSampleAt?: Date;
  newestSampleAt?: Date;
}

export type TrendDirection = 'improving' | 'stable' | 'declining';

export interface CostTrendForecast {
  routeId: string;
  predictedFeeStroops: number;
  emaFeeStroops: number;
  recentAverageFeeStroops: number;
  historicalAverageFeeStroops: number;
  confidenceIntervalStroops: [number, number];
  trend: TrendDirection;
  trendDelta: number;
  sampleSize: number;
  generatedAt: Date;
}

export interface CostForecast {
  routeId: string;
  predictedFeeStroops: number;
  confidenceScore: number;
  trend: CostTrendForecast | null;
  historical: CostHistoricalAnalysis | null;
  generatedAt: Date;
}

export interface StellarCostForecastingOptions {
  maxSamples?: number;
  emaAlpha?: number;
  trendThreshold?: number;
  recentWindowRatio?: number;
}

const DEFAULTS: Required<StellarCostForecastingOptions> = {
  maxSamples: 10_000,
  emaAlpha: 0.3,
  trendThreshold: 0.05,
  recentWindowRatio: 0.25,
};

/**
 * Forecasting engine for Soroban transfer costs.
 *
 * Ingests historical fee samples and projects forward-looking cost
 * forecasts using exponential moving averages with trend classification.
 */
@Injectable()
export class StellarCostForecastingService {
  private readonly logger = new Logger(StellarCostForecastingService.name);
  private readonly opts: Required<StellarCostForecastingOptions>;
  private readonly samples = new Map<string, CostSample[]>();

  constructor(options: StellarCostForecastingOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
    if (this.opts.emaAlpha <= 0 || this.opts.emaAlpha > 1) {
      throw new Error('emaAlpha must be in (0, 1]');
    }
    if (this.opts.trendThreshold < 0) {
      throw new Error('trendThreshold must be non-negative');
    }
    if (this.opts.recentWindowRatio <= 0 || this.opts.recentWindowRatio >= 1) {
      throw new Error('recentWindowRatio must be in (0, 1)');
    }
  }

  /**
   * Ingest fee samples for a route. Invalid entries are dropped.
   * Returns `null` when all samples fail validation.
   */
  analyzeFeeTrends(routeId: string, metrics: CostSample[]): CostHistoricalAnalysis | null {
    this.validateRouteId(routeId);
    if (!Array.isArray(metrics)) throw new Error('metrics must be an array');

    const cleaned = this.sanitize(metrics);
    cleaned.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const trimmed =
      cleaned.length > this.opts.maxSamples
        ? cleaned.slice(cleaned.length - this.opts.maxSamples)
        : cleaned;

    this.samples.set(routeId, trimmed);
    this.logger.log(
      `Analyzed ${trimmed.length} cost samples for route ${routeId}` +
        ` (dropped ${metrics.length - cleaned.length} invalid)`,
    );

    return trimmed.length === 0 ? null : this.computeHistorical(routeId);
  }

  /** Project future fees using EMA over stored samples. Returns `null` with no data. */
  predictCostTrends(routeId: string): CostTrendForecast | null {
    this.validateRouteId(routeId);
    const series = this.samples.get(routeId);
    if (!series?.length) {
      this.logger.warn(`No cost samples for route ${routeId}`);
      return null;
    }

    const recentSize = this.recentWindowSize(series.length);
    const recent = series.slice(series.length - recentSize);
    const historical = series.slice(0, series.length - recentSize);

    const recentAvg = mean(recent.map((s) => s.feeStroops));
    const historicalAvg = historical.length ? mean(historical.map((s) => s.feeStroops)) : recentAvg;

    const ema = this.computeEma(series);
    const stdDev = stdDeviation(recent.map((s) => s.feeStroops));
    const margin = 1.96 * (series.length > 1 ? stdDev / Math.sqrt(series.length) : 0);

    // Positive delta means fees decreased (improving for users).
    const trendDelta = historicalAvg > 0 ? (historicalAvg - recentAvg) / historicalAvg : 0;

    return {
      routeId,
      predictedFeeStroops: round(ema),
      emaFeeStroops: round(ema),
      recentAverageFeeStroops: round(recentAvg),
      historicalAverageFeeStroops: round(historicalAvg),
      confidenceIntervalStroops: [round(Math.max(0, ema - margin)), round(ema + margin)],
      trend: classifyTrend(trendDelta, this.opts.trendThreshold),
      trendDelta: round(trendDelta, 4),
      sampleSize: series.length,
      generatedAt: new Date(),
    };
  }

  /** Composite forecast combining trend and historical analysis. */
  generateForecast(routeId: string): CostForecast {
    this.validateRouteId(routeId);
    const trend = this.predictCostTrends(routeId);
    const sampleSize = this.samples.get(routeId)?.length ?? 0;
    const historical = sampleSize > 0 ? this.computeHistorical(routeId) : null;

    return {
      routeId,
      predictedFeeStroops: trend?.predictedFeeStroops ?? 0,
      confidenceScore: this.computeConfidence(sampleSize, trend),
      trend,
      historical,
      generatedAt: new Date(),
    };
  }

  reset(): void {
    this.samples.clear();
  }

  getStoredSamples(routeId: string): CostSample[] {
    return (this.samples.get(routeId) ?? []).map((s) => ({ ...s, timestamp: new Date(s.timestamp) }));
  }

  private computeHistorical(routeId: string): CostHistoricalAnalysis {
    const series = this.samples.get(routeId) ?? [];
    const fees = series.map((s) => s.feeStroops);
    const sorted = [...fees].sort((a, b) => a - b);
    const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    return {
      routeId,
      sampleSize: series.length,
      averageFeeStroops: round(mean(fees)),
      p95FeeStroops: round(sorted[p95Idx]),
      standardDeviationStroops: round(stdDeviation(fees), 2),
      oldestSampleAt: series[0]?.timestamp,
      newestSampleAt: series[series.length - 1]?.timestamp,
    };
  }

  private computeConfidence(sampleSize: number, trend: CostTrendForecast | null): number {
    if (sampleSize === 0 || !trend) return 0;
    const sampleScore = Math.min(50, Math.round(Math.log10(sampleSize + 1) * 25));
    const intervalWidth = trend.confidenceIntervalStroops[1] - trend.confidenceIntervalStroops[0];
    const normalized = trend.predictedFeeStroops > 0 ? Math.min(1, intervalWidth / trend.predictedFeeStroops) : 0;
    const stabilityBonus = Math.round(50 * Math.max(0, 1 - normalized));
    return Math.min(100, sampleScore + stabilityBonus);
  }

  private computeEma(series: CostSample[]): number {
    const alpha = this.opts.emaAlpha;
    let ema = series[0].feeStroops;
    for (let i = 1; i < series.length; i++) {
      ema = alpha * series[i].feeStroops + (1 - alpha) * ema;
    }
    return ema;
  }

  private sanitize(metrics: CostSample[]): CostSample[] {
    return metrics.filter((m) => {
      if (!m) return false;
      if (typeof m.feeStroops !== 'number' || !Number.isFinite(m.feeStroops)) return false;
      if (m.feeStroops < 0) return false;
      if (!(m.timestamp instanceof Date) || Number.isNaN(m.timestamp.getTime())) return false;
      return true;
    }).map((m) => ({ ...m, timestamp: new Date(m.timestamp.getTime()), success: Boolean(m.success) }));
  }

  private recentWindowSize(n: number): number {
    return Math.max(Math.min(2, n), Math.floor(n * this.opts.recentWindowRatio));
  }

  private validateRouteId(routeId: string): void {
    if (!routeId?.trim()) throw new Error('routeId must be a non-empty string');
  }
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, v) => a + v, 0) / values.length;
}

function stdDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / values.length);
}

function round(value: number, places = 0): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function classifyTrend(delta: number, threshold: number): TrendDirection {
  if (!Number.isFinite(delta) || Math.abs(delta) < threshold) return 'stable';
  return delta > 0 ? 'improving' : 'declining';
}
