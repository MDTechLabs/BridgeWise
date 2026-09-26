import { Injectable } from '@nestjs/common';
import { ProviderHistoryEntry, TrendReport } from './types';
import { StellarReputationCalculator } from './stellar-reputation.calculator';

@Injectable()
export class StellarReputationReporter {
  constructor(private readonly calculator: StellarReputationCalculator) {}

  generate(
    providerId: string,
    allHistory: ProviderHistoryEntry[],
    period: TrendReport['period'] = 'weekly'
  ): TrendReport {
    const buckets = this.bucketByPeriod(allHistory, period);

    const dataPoints = buckets.map(({ date, entries }) => {
      const score = this.calculator.calculate(providerId, entries);
      const successRate =
        entries.length > 0
          ? entries.filter((e) => e.success).length / entries.length
          : 0;
      const avgResponseTimeMs =
        entries.length > 0
          ? entries.reduce((s, e) => s + e.responseTimeMs, 0) / entries.length
          : 0;

      return {
        date,
        score: score.overall,
        successRate: Math.round(successRate * 100) / 100,
        avgResponseTimeMs: Math.round(avgResponseTimeMs),
      };
    });

    const trend = this.detectTrend(dataPoints.map((d) => d.score));
    const percentageChange = this.calcPercentageChange(
      dataPoints.map((d) => d.score)
    );

    return {
      providerId,
      period,
      dataPoints,
      trend,
      percentageChange,
      generatedAt: new Date(),
    };
  }

  private bucketByPeriod(
    history: ProviderHistoryEntry[],
    period: TrendReport['period']
  ): { date: Date; entries: ProviderHistoryEntry[] }[] {
    const msPerBucket =
      period === 'daily'
        ? 86_400_000
        : period === 'weekly'
        ? 7 * 86_400_000
        : 30 * 86_400_000;

    if (history.length === 0) return [];

    const sorted = [...history].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    const start = sorted[0].timestamp.getTime();
    const end = Date.now();
    const buckets: { date: Date; entries: ProviderHistoryEntry[] }[] = [];

    for (let t = start; t <= end; t += msPerBucket) {
      const bucketStart = t;
      const bucketEnd = t + msPerBucket;
      buckets.push({
        date: new Date(bucketStart),
        entries: sorted.filter(
          (e) =>
            e.timestamp.getTime() >= bucketStart &&
            e.timestamp.getTime() < bucketEnd
        ),
      });
    }

    return buckets;
  }

  private detectTrend(scores: number[]): TrendReport['trend'] {
    if (scores.length < 2) return 'stable';
    const first = scores.slice(0, Math.ceil(scores.length / 2));
    const last  = scores.slice(Math.floor(scores.length / 2));
    const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
    const avgLast  = last.reduce((a, b) => a + b, 0)  / last.length;
    const delta = avgLast - avgFirst;
    if (delta > 3)  return 'improving';
    if (delta < -3) return 'degrading';
    return 'stable';
  }

  private calcPercentageChange(scores: number[]): number {
    if (scores.length < 2) return 0;
    const first = scores[0];
    const last  = scores[scores.length - 1];
    if (first === 0) return 0;
    return Math.round(((last - first) / first) * 100 * 100) / 100;
  }
}