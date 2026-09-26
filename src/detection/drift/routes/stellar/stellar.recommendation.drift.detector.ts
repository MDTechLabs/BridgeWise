import { DriftAlert, DriftDetectorConfig, DriftMetrics, DriftSnapshot, RecommendationOutput, ScoreDistribution } from "./types";

  
  const DEFAULT_CONFIG: Omit<DriftDetectorConfig, 'routeId'> = {
    minSampleSize: 50,
    topK: 10,
    evaluationIntervalMs: 5 * 60 * 1000,   // 5 minutes
    windowMs: 60 * 60 * 1000,              // 1 hour rolling window
    thresholds: {
      minTopItemOverlap: 0.6,
      minRankCorrelation: 0.7,
      maxScoreDistributionShift: 0.3,
    },
  };
  
  export class StellarRecommendationDriftDetector {
    private readonly config: DriftDetectorConfig;
    private outputBuffer: RecommendationOutput[] = [];
    private baselineSnapshot: DriftSnapshot | null = null;
    private latestSnapshot: DriftSnapshot | null = null;
    private alerts: DriftAlert[] = [];
    private evaluationTimer: ReturnType<typeof setInterval> | null = null;
  
    constructor(config: Partial<DriftDetectorConfig> & { routeId: string }) {
      this.config = { ...DEFAULT_CONFIG, ...config, thresholds: { ...DEFAULT_CONFIG.thresholds, ...config.thresholds } };
    }
  
    // ─── Public API ────────────────────────────────────────────────────────────
  
    /**
     * Record a single recommendation output. Call this from your route handler
     * after every inference response.
     */
    record(output: RecommendationOutput): void {
      const now = Date.now();
      this.outputBuffer.push(output);
      // Evict outputs outside the rolling window
      this.outputBuffer = this.outputBuffer.filter(o => now - o.timestamp <= this.config.windowMs);
    }
  
    /**
     * Start periodic drift evaluation. Returns `this` for chaining.
     */
    start(): this {
      if (this.evaluationTimer !== null) return this;
      this.evaluationTimer = setInterval(() => this.evaluate(), this.config.evaluationIntervalMs);
      return this;
    }
  
    stop(): void {
      if (this.evaluationTimer !== null) {
        clearInterval(this.evaluationTimer);
        this.evaluationTimer = null;
      }
    }
  
    /**
     * Manually trigger an evaluation cycle. Useful in tests or on-demand checks.
     * Returns any new alerts generated, or an empty array.
     */
    evaluate(): DriftAlert[] {
      if (this.outputBuffer.length < this.config.minSampleSize) return [];
  
      const snapshot = this.buildSnapshot(this.outputBuffer);
  
      if (!this.baselineSnapshot) {
        // First evaluation — establish the baseline
        this.baselineSnapshot = snapshot;
        this.latestSnapshot = snapshot;
        return [];
      }
  
      this.latestSnapshot = snapshot;
      const metrics = this.computeMetrics(this.baselineSnapshot, snapshot);
      const newAlerts = this.checkThresholds(metrics, this.baselineSnapshot, snapshot);
  
      if (newAlerts.length > 0) {
        this.alerts.push(...newAlerts);
      }
  
      return newAlerts;
    }
  
    /**
     * Promote the current snapshot to the new baseline (e.g. after a deliberate
     * model upgrade has been validated).
     */
    resetBaseline(): void {
      if (this.latestSnapshot) {
        this.baselineSnapshot = this.latestSnapshot;
      }
    }
  
    getBaselineSnapshot(): DriftSnapshot | null {
      return this.baselineSnapshot;
    }
  
    getLatestSnapshot(): DriftSnapshot | null {
      return this.latestSnapshot;
    }
  
    getAlerts(): DriftAlert[] {
      return [...this.alerts];
    }
  
    getBufferSize(): number {
      return this.outputBuffer.length;
    }
  
    // ─── Internal helpers ──────────────────────────────────────────────────────
  
    private buildSnapshot(outputs: RecommendationOutput[]): DriftSnapshot {
      const topItemCounts: Record<string, number> = {};
  
      // Collect top-K items per output
      for (const output of outputs) {
        const topK = output.rankedItems
          .slice()
          .sort((a, b) => a.rank - b.rank)
          .slice(0, this.config.topK);
        for (const item of topK) {
          topItemCounts[item.id] = (topItemCounts[item.id] ?? 0) + 1;
        }
      }
  
      // Normalise frequencies
      const topItemFrequency: Record<string, number> = {};
      for (const [id, count] of Object.entries(topItemCounts)) {
        topItemFrequency[id] = count / outputs.length;
      }
  
      // Average score by rank position
      const scoresByRank: number[][] = [];
      for (const output of outputs) {
        for (const item of output.rankedItems) {
          if (!scoresByRank[item.rank]) scoresByRank[item.rank] = [];
          scoresByRank[item.rank].push(item.score);
        }
      }
      const averageScoreByRank = scoresByRank.map(scores =>
        scores.reduce((s, v) => s + v, 0) / scores.length
      );
  
      // Score distribution across all ranked items
      const allScores = outputs.flatMap(o => o.rankedItems.map(i => i.score)).sort((a, b) => a - b);
      const scoreDistribution = this.computeDistribution(allScores);
  
      // Dominant model version
      const versionCounts: Record<string, number> = {};
      for (const o of outputs) {
        versionCounts[o.modelVersion] = (versionCounts[o.modelVersion] ?? 0) + 1;
      }
      const modelVersion = Object.entries(versionCounts).sort((a, b) => b[1] - a[1])[0][0];
  
      return {
        snapshotId: this.generateId(),
        capturedAt: Date.now(),
        routeId: this.config.routeId,
        sampleSize: outputs.length,
        topItemFrequency,
        averageScoreByRank,
        scoreDistribution,
        modelVersion,
      };
    }
  
    private computeMetrics(baseline: DriftSnapshot, current: DriftSnapshot): DriftMetrics {
      const topItemOverlapRate = this.jaccardTopK(baseline.topItemFrequency, current.topItemFrequency);
      const rankCorrelation = this.spearmanCorrelation(
        baseline.averageScoreByRank,
        current.averageScoreByRank
      );
      const scoreDistributionShift = this.klDivergenceProxy(
        baseline.scoreDistribution,
        current.scoreDistribution
      );
      const modelVersionChanged = baseline.modelVersion !== current.modelVersion;
  
      return {
        topItemOverlapRate,
        rankCorrelation,
        scoreDistributionShift,
        modelVersionChanged,
        sampleSize: current.sampleSize,
      };
    }
  
    private checkThresholds(
      metrics: DriftMetrics,
      baseline: DriftSnapshot,
      current: DriftSnapshot
    ): DriftAlert[] {
      const violated: string[] = [];
  
      if (metrics.topItemOverlapRate < this.config.thresholds.minTopItemOverlap) {
        violated.push(
          `topItemOverlap=${metrics.topItemOverlapRate.toFixed(3)} < threshold=${this.config.thresholds.minTopItemOverlap}`
        );
      }
      if (metrics.rankCorrelation < this.config.thresholds.minRankCorrelation) {
        violated.push(
          `rankCorrelation=${metrics.rankCorrelation.toFixed(3)} < threshold=${this.config.thresholds.minRankCorrelation}`
        );
      }
      if (metrics.scoreDistributionShift > this.config.thresholds.maxScoreDistributionShift) {
        violated.push(
          `scoreDistributionShift=${metrics.scoreDistributionShift.toFixed(3)} > threshold=${this.config.thresholds.maxScoreDistributionShift}`
        );
      }
  
      if (violated.length === 0 && !metrics.modelVersionChanged) return [];
  
      const severity = this.deriveSeverity(metrics, violated.length);
  
      const parts: string[] = [];
      if (violated.length > 0) {
        parts.push(`Ranking drift detected on route "${this.config.routeId}": ${violated.join(', ')}.`);
      }
      if (metrics.modelVersionChanged) {
        parts.push(
          `Model version changed from "${baseline.modelVersion}" to "${current.modelVersion}".`
        );
      }
  
      const alert: DriftAlert = {
        alertId: this.generateId(),
        severity,
        detectedAt: Date.now(),
        routeId: this.config.routeId,
        metrics,
        baselineSnapshotId: baseline.snapshotId,
        currentSnapshotId: current.snapshotId,
        message: parts.join(' '),
        thresholdsViolated: violated,
      };
  
      return [alert];
    }
  
    private deriveSeverity(
      metrics: DriftMetrics,
      violationCount: number
    ): DriftAlert['severity'] {
      if (metrics.topItemOverlapRate < 0.3 || metrics.rankCorrelation < 0.4) return 'critical';
      if (violationCount >= 2) return 'high';
      if (violationCount === 1) return 'medium';
      return 'low'; // model version change only
    }
  
    // ─── Statistical helpers ───────────────────────────────────────────────────
  
    private jaccardTopK(
      aFreq: Record<string, number>,
      bFreq: Record<string, number>
    ): number {
      const threshold = 0.1; // items appearing in ≥10% of responses count as "top"
      const aSet = new Set(Object.entries(aFreq).filter(([, f]) => f >= threshold).map(([id]) => id));
      const bSet = new Set(Object.entries(bFreq).filter(([, f]) => f >= threshold).map(([id]) => id));
      if (aSet.size === 0 && bSet.size === 0) return 1;
      let intersection = 0;
      for (const id of aSet) {
        if (bSet.has(id)) intersection++;
      }
      return intersection / (aSet.size + bSet.size - intersection);
    }
  
    private spearmanCorrelation(a: number[], b: number[]): number {
      const n = Math.min(a.length, b.length);
      if (n < 2) return 1; // not enough data to say otherwise
      const aSlice = a.slice(0, n);
      const bSlice = b.slice(0, n);
      const rankA = this.rankArray(aSlice);
      const rankB = this.rankArray(bSlice);
      let dSquaredSum = 0;
      for (let i = 0; i < n; i++) {
        const d = rankA[i] - rankB[i];
        dSquaredSum += d * d;
      }
      return 1 - (6 * dSquaredSum) / (n * (n * n - 1));
    }
  
    private rankArray(arr: number[]): number[] {
      const sorted = [...arr].map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
      const ranks = new Array<number>(arr.length);
      sorted.forEach(({ i }, rank) => { ranks[i] = rank + 1; });
      return ranks;
    }
  
    /**
     * Approximate KL divergence by comparing quantiles. Returns a value in [0, ∞).
     * Values > 0.3 indicate meaningful distribution shift.
     */
    private klDivergenceProxy(a: ScoreDistribution, b: ScoreDistribution): number {
      const quantiles: Array<keyof ScoreDistribution> = ['p10', 'p25', 'p50', 'p75', 'p90'];
      let totalShift = 0;
      for (const q of quantiles) {
        const aVal = a[q] as number;
        const bVal = b[q] as number;
        if (aVal === 0 && bVal === 0) continue;
        const diff = Math.abs(aVal - bVal) / (Math.abs(aVal) + 1e-9);
        totalShift += diff;
      }
      return totalShift / quantiles.length;
    }
  
    private computeDistribution(sorted: number[]): ScoreDistribution {
      const n = sorted.length;
      if (n === 0) return { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, mean: 0, stdDev: 0 };
      const percentile = (p: number) => sorted[Math.floor(p * (n - 1))];
      const mean = sorted.reduce((s, v) => s + v, 0) / n;
      const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
      return {
        p10: percentile(0.1),
        p25: percentile(0.25),
        p50: percentile(0.5),
        p75: percentile(0.75),
        p90: percentile(0.9),
        mean,
        stdDev: Math.sqrt(variance),
      };
    }
  
    private generateId(): string {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
  }