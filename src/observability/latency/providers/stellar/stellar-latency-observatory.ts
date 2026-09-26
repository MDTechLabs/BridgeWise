import { EventEmitter } from 'events';
import type {
  LatencySample,
  ProviderLatencyMetrics,
  DegradationAlert,
  LatencyObservatoryConfig,
  LatencyReport,
} from './types';
import { computePercentiles, detectTrend, generateReportId } from './latency-utils';

const DEFAULTS = {
  windowSizeMs: 5 * 60 * 1000,
  degradationThresholdPercent: 25,
  criticalThresholdPercent: 75,
  minSamplesForAlert: 10,
};

export class StellarLatencyObservatory extends EventEmitter {
  private readonly cfg: typeof DEFAULTS & { onDegradation?: (alert: DegradationAlert) => void };
  private readonly samples = new Map<string, LatencySample[]>();
  private readonly baselines = new Map<string, number>();

  constructor(config: LatencyObservatoryConfig = {}) {
    super();
    this.cfg = { ...DEFAULTS, ...config };
  }

  record(sample: LatencySample): void {
    const list = this.samples.get(sample.providerId) ?? [];
    list.push(sample);
    this.samples.set(sample.providerId, list);
    this.pruneWindow(sample.providerId);
    this.checkDegradation(sample.providerId);
  }

  setBaseline(providerId: string, p95Ms: number): void {
    this.baselines.set(providerId, p95Ms);
  }

  getMetrics(providerId: string): ProviderLatencyMetrics | null {
    const all = this.windowSamples(providerId);
    if (all.length === 0) return null;

    const mid = Math.floor(all.length / 2);
    const percentiles = computePercentiles(all);
    const trend = detectTrend(all.slice(mid), all.slice(0, mid));
    const now = new Date();

    return {
      providerId,
      sampleCount: all.length,
      successCount: all.filter((s) => s.success).length,
      failureCount: all.filter((s) => !s.success).length,
      percentiles,
      trend,
      degradationAlerts: this.buildAlerts(providerId, percentiles.p95),
      windowStartTime: new Date(now.getTime() - this.cfg.windowSizeMs),
      windowEndTime: now,
    };
  }

  generateReport(): LatencyReport {
    const providers: ProviderLatencyMetrics[] = [];
    for (const id of this.samples.keys()) {
      const m = this.getMetrics(id);
      if (m) providers.push(m);
    }
    providers.sort((a, b) => a.percentiles.p95 - b.percentiles.p95);

    return {
      reportId: generateReportId(),
      generatedAt: new Date(),
      windowMs: this.cfg.windowSizeMs,
      providers,
      bestProvider: providers[0]?.providerId ?? null,
      worstProvider: providers[providers.length - 1]?.providerId ?? null,
    };
  }

  clearProvider(providerId: string): void {
    this.samples.delete(providerId);
    this.baselines.delete(providerId);
  }

  private windowSamples(providerId: string): LatencySample[] {
    const cutoff = Date.now() - this.cfg.windowSizeMs;
    return (this.samples.get(providerId) ?? []).filter(
      (s) => s.timestamp.getTime() >= cutoff,
    );
  }

  private pruneWindow(providerId: string): void {
    this.samples.set(providerId, this.windowSamples(providerId));
  }

  private checkDegradation(providerId: string): void {
    const samples = this.windowSamples(providerId);
    if (samples.length < this.cfg.minSamplesForAlert) return;
    const baseline = this.baselines.get(providerId);
    if (baseline === undefined) return;

    const { p95 } = computePercentiles(samples);
    const deviation = ((p95 - baseline) / baseline) * 100;
    if (deviation < this.cfg.degradationThresholdPercent) return;

    const alert: DegradationAlert = {
      providerId,
      detectedAt: new Date(),
      currentP95Ms: p95,
      baselineP95Ms: baseline,
      deviationPercent: deviation,
      severity: deviation >= this.cfg.criticalThresholdPercent ? 'critical' : 'warning',
    };

    this.emit('degradation', alert);
    this.cfg.onDegradation?.(alert);
  }

  private buildAlerts(providerId: string, p95: number): DegradationAlert[] {
    const baseline = this.baselines.get(providerId);
    if (!baseline) return [];
    const deviation = ((p95 - baseline) / baseline) * 100;
    if (deviation < this.cfg.degradationThresholdPercent) return [];
    return [
      {
        providerId,
        detectedAt: new Date(),
        currentP95Ms: p95,
        baselineP95Ms: baseline,
        deviationPercent: deviation,
        severity: deviation >= this.cfg.criticalThresholdPercent ? 'critical' : 'warning',
      },
    ];
  }
}
