import { Injectable, Logger } from '@nestjs/common';
import { NormalizedQuote, RankingWeights } from '../interfaces';
import { RankingMode } from '../enums';

@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  private readonly RANKING_WEIGHTS: Record<RankingMode, RankingWeights> = {
    [RankingMode.BALANCED]: { cost: 0.30, speed: 0.25, reliability: 0.30, slippage: 0.15 },
    [RankingMode.LOWEST_COST]: { cost: 0.55, speed: 0.15, reliability: 0.20, slippage: 0.10 },
    [RankingMode.FASTEST]: { cost: 0.15, speed: 0.55, reliability: 0.20, slippage: 0.10 },
  };

  /**
   * Apply ranking to a list of normalized quotes and assign composite scores + positions.
   */
  rankQuotes(quotes: NormalizedQuote[], mode: RankingMode): NormalizedQuote[] {
    if (!quotes.length) return [];

    const weights = this.RANKING_WEIGHTS[mode];
    const maxFee = Math.max(...quotes.map((q) => q.totalFeeUsd));
    const maxTime = Math.max(...quotes.map((q) => q.estimatedTimeSeconds));
    const maxSlippage = Math.max(...quotes.map((q) => q.slippagePercent));

    this.logger.debug(`Ranking ${quotes.length} quotes with mode: ${mode}`);

    const scored = quotes.map((quote) => {
      const costScore = maxFee > 0 ? (1 - quote.totalFeeUsd / maxFee) * 100 : 100;
      const speedScore = maxTime > 0 ? (1 - quote.estimatedTimeSeconds / maxTime) * 100 : 100;
      const reliabilityScore = quote.reliabilityScore;
      const slippageScore = maxSlippage > 0 ? (1 - quote.slippagePercent / maxSlippage) * 100 : 100;

      const compositeScore =
        costScore * weights.cost +
        speedScore * weights.speed +
        reliabilityScore * weights.reliability +
        slippageScore * weights.slippage;

      return {
        ...quote,
        compositeScore: parseFloat(compositeScore.toFixed(2)),
      };
    });

    // Sort descending — higher composite score = better route
    const sorted = scored.sort((a, b) => b.compositeScore - a.compositeScore);

    return sorted.map((quote, index) => ({
      ...quote,
      rankingPosition: index + 1,
    }));
  }

  /**
   * Get the best quote for a given ranking mode.
   */
  getBestQuote(quotes: NormalizedQuote[], mode: RankingMode): NormalizedQuote | null {
    const ranked = this.rankQuotes(quotes, mode);
    return ranked[0] ?? null;
  }

  /**
   * Get ranking weights for a given mode.
   */
  getWeights(mode: RankingMode): RankingWeights {
    return this.RANKING_WEIGHTS[mode];
  }
}
