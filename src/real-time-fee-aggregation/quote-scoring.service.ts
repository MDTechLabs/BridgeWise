import { Injectable } from '@nestjs/common';
import { NormalizedQuote } from '../interfaces/bridge-adapter.interface';

export type RankStrategy = 'cost' | 'speed' | 'score';

interface ScoringWeights {
  costWeight: number;
  speedWeight: number;
  outputWeight: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  costWeight: 0.5,
  speedWeight: 0.3,
  outputWeight: 0.2,
};

@Injectable()
export class QuoteScoringService {
  /**
   * Assigns a composite score (0–100) to each quote using min-max normalization.
   * Higher score = better option.
   */
  scoreAndRank(quotes: NormalizedQuote[], strategy: RankStrategy = 'score'): NormalizedQuote[] {
    const supported = quotes.filter((q) => q.supported && !q.error);
    const unsupported = quotes.filter((q) => !q.supported || q.error);

    if (supported.length === 0) return [...unsupported];

    const scored = this.applyScores(supported);
    const ranked = this.sortByStrategy(scored, strategy);

    return [...ranked, ...unsupported];
  }

  private applyScores(quotes: NormalizedQuote[]): NormalizedQuote[] {
    const fees = quotes.map((q) => q.totalFeeUSD);
    const times = quotes.map((q) => q.estimatedArrivalTime);
    const outputs = quotes.map((q) => parseFloat(q.outputAmount));

    const minFee = Math.min(...fees);
    const maxFee = Math.max(...fees);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const minOutput = Math.min(...outputs);
    const maxOutput = Math.max(...outputs);

    return quotes.map((q) => {
      const costScore = this.normalizeInverted(q.totalFeeUSD, minFee, maxFee);
      const speedScore = this.normalizeInverted(q.estimatedArrivalTime, minTime, maxTime);
      const outputScore = this.normalize(parseFloat(q.outputAmount), minOutput, maxOutput);

      const score =
        DEFAULT_WEIGHTS.costWeight * costScore +
        DEFAULT_WEIGHTS.speedWeight * speedScore +
        DEFAULT_WEIGHTS.outputWeight * outputScore;

      return { ...q, score: parseFloat((score * 100).toFixed(2)) };
    });
  }

  private sortByStrategy(quotes: NormalizedQuote[], strategy: RankStrategy): NormalizedQuote[] {
    switch (strategy) {
      case 'cost':
        return [...quotes].sort((a, b) => a.totalFeeUSD - b.totalFeeUSD);
      case 'speed':
        return [...quotes].sort((a, b) => a.estimatedArrivalTime - b.estimatedArrivalTime);
      case 'score':
      default:
        return [...quotes].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }
  }

  /** Higher value = better (e.g., output amount) */
  private normalize(value: number, min: number, max: number): number {
    if (max === min) return 1;
    return (value - min) / (max - min);
  }

  /** Lower value = better (e.g., fee, time) */
  private normalizeInverted(value: number, min: number, max: number): number {
    if (max === min) return 1;
    return 1 - (value - min) / (max - min);
  }
}
