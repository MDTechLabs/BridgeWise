export interface ReliabilityRecord {
  provider: string;
  timestamp: Date;
  success: boolean;
  latencyMs: number;
}

export interface ReliabilityForecast {
  provider: string;
  predictedReliability: number;
  confidenceInterval: [number, number];
  trend: 'improving' | 'stable' | 'declining';
  sampleSize: number;
}

const records: ReliabilityRecord[] = [];

export function recordReliability(record: ReliabilityRecord): void {
  records.push(record);
}

export function forecastReliability(provider: string): ReliabilityForecast | null {
  const matching = records.filter(r => r.provider === provider);
  if (matching.length < 5) return null;

  const recentCount = Math.min(20, matching.length);
  const recent = matching.slice(-recentCount);
  const successes = recent.filter(r => r.success).length;
  const rate = successes / recent.length;

  const earlier = matching.slice(0, -recentCount);
  const earlierRate = earlier.length > 0 ? earlier.filter(r => r.success).length / earlier.length : rate;

  const trend = rate > earlierRate + 0.02 ? 'improving' : rate < earlierRate - 0.02 ? 'declining' : 'stable';
  const margin = 1.96 * Math.sqrt((rate * (1 - rate)) / recentCount);

  return {
    provider,
    predictedReliability: rate,
    confidenceInterval: [Math.max(0, rate - margin), Math.min(1, rate + margin)],
    trend,
    sampleSize: matching.length,
  };
}

export function clearRecords(): void {
  records.length = 0;
}
