export interface RecommendationOutput {
    requestId: string;
    timestamp: number;
    userId?: string;
    context: string;
    rankedItems: RankedItem[];
    modelVersion: string;
    routeId: string;
  }
  
  export interface RankedItem {
    id: string;
    score: number;
    rank: number;
    metadata?: Record<string, unknown>;
  }
  
  export interface DriftSnapshot {
    snapshotId: string;
    capturedAt: number;
    routeId: string;
    sampleSize: number;
    topItemFrequency: Record<string, number>;   // itemId -> frequency (0-1)
    averageScoreByRank: number[];               // index = rank position
    scoreDistribution: ScoreDistribution;
    modelVersion: string;
  }
  
  export interface ScoreDistribution {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    mean: number;
    stdDev: number;
  }
  
  export interface DriftMetrics {
    topItemOverlapRate: number;          // Jaccard similarity vs baseline top-K
    rankCorrelation: number;             // Spearman rank correlation vs baseline
    scoreDistributionShift: number;      // KL divergence proxy vs baseline
    modelVersionChanged: boolean;
    sampleSize: number;
  }
  
  export interface DriftAlert {
    alertId: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    detectedAt: number;
    routeId: string;
    metrics: DriftMetrics;
    baselineSnapshotId: string;
    currentSnapshotId: string;
    message: string;
    thresholdsViolated: string[];
  }
  
  export interface DriftDetectorConfig {
    routeId: string;
    /** Minimum outputs to collect before computing a snapshot */
    minSampleSize: number;
    /** How many top items to track for overlap analysis */
    topK: number;
    /** How often (ms) to compute a new snapshot and compare */
    evaluationIntervalMs: number;
    /** Sliding window of outputs to retain (ms) */
    windowMs: number;
    thresholds: DriftThresholds;
  }
  
  export interface DriftThresholds {
    /** Minimum Jaccard overlap with baseline top-K before alerting */
    minTopItemOverlap: number;           // e.g. 0.6 → alert if < 60% overlap
    /** Minimum Spearman correlation before alerting */
    minRankCorrelation: number;          // e.g. 0.7
    /** Maximum KL-divergence proxy before alerting */
    maxScoreDistributionShift: number;   // e.g. 0.3
  }