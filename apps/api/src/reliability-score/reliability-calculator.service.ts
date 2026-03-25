import { Injectable } from '@nestjs/common';
import {
  RELIABILITY_BADGE_LABELS,
  RELIABILITY_CONSTANTS,
} from './reliability.constants';
import { ReliabilityTier } from './reliability.enum';
import { ReliabilityBadgeDto } from './reliability.dto';

export interface RawCounts {
  totalAttempts: number;
  successfulTransfers: number;
  failedTransfers: number;
  timeoutCount: number;
}

@Injectable()
export class ReliabilityCalculatorService {
  /**
   * Compute reliability percentage from raw counts.
   * Cancelled transactions are already excluded at query level.
   */
  computeReliabilityPercent(counts: RawCounts): number {
    if (counts.totalAttempts < RELIABILITY_CONSTANTS.MIN_ATTEMPTS_FOR_SCORE) {
      return 0;
    }
    return parseFloat(
      ((counts.successfulTransfers / counts.totalAttempts) * 100).toFixed(2),
    );
  }

  /**
   * Normalize reliability percentage to a 0-100 score.
   * Currently 1:1 since percent is already 0-100, but this layer
   * allows future weighting (e.g., heavier penalty for timeouts).
   */
  computeReliabilityScore(counts: RawCounts): number {
    const percent = this.computeReliabilityPercent(counts);

    if (counts.totalAttempts < RELIABILITY_CONSTANTS.MIN_ATTEMPTS_FOR_SCORE) {
      return 0;
    }

    // Apply extra timeout penalty: each timeout beyond a threshold reduces score
    const timeoutRatio = counts.timeoutCount / counts.totalAttempts;
    const timeoutPenalty = Math.min(timeoutRatio * 10, 5); // max 5-point penalty

    const rawScore = percent - timeoutPenalty;
    return parseFloat(
      Math.max(
        RELIABILITY_CONSTANTS.MIN_SCORE,
        Math.min(RELIABILITY_CONSTANTS.MAX_SCORE, rawScore),
      ).toFixed(2),
    );
  }

  /**
   * Determine tier based on reliability percent.
   */
  computeTier(reliabilityPercent: number): ReliabilityTier {
    if (reliabilityPercent >= RELIABILITY_CONSTANTS.HIGH_THRESHOLD) {
      return ReliabilityTier.HIGH;
    }
    if (reliabilityPercent >= RELIABILITY_CONSTANTS.MEDIUM_THRESHOLD) {
      return ReliabilityTier.MEDIUM;
    }
    return ReliabilityTier.LOW;
  }

  /**
   * Build badge DTO for UI display.
   */
  buildBadge(
    reliabilityPercent: number,
    windowSize: number,
    windowMode: string,
  ): ReliabilityBadgeDto {
    const tier = this.computeTier(reliabilityPercent);

    const colorMap: Record<ReliabilityTier, string> = {
      [ReliabilityTier.HIGH]: '#22c55e',
      [ReliabilityTier.MEDIUM]: '#f59e0b',
      [ReliabilityTier.LOW]: '#ef4444',
    };

    const windowDesc =
      windowMode === 'TIME_BASED'
        ? `last ${windowSize} days`
        : `last ${windowSize} transactions`;

    return {
      tier,
      label: RELIABILITY_BADGE_LABELS[tier],
      color: colorMap[tier],
      tooltip: `Score based on ${windowDesc}. Excludes user-cancelled events. Minimum ${RELIABILITY_CONSTANTS.MIN_ATTEMPTS_FOR_SCORE} attempts required.`,
    };
  }

  /**
   * Compute ranking penalty for bridges below threshold.
   * Used by Smart Bridge Ranking (Issue #5).
   */
  computeRankingPenalty(
    reliabilityScore: number,
    threshold: number = RELIABILITY_CONSTANTS.MEDIUM_THRESHOLD,
  ): number {
    if (reliabilityScore < threshold) {
      return RELIABILITY_CONSTANTS.PENALTY_BELOW_THRESHOLD;
    }
    return 0;
  }

  /**
   * Produce adjusted score for ranking engine.
   * Ranking engine calls this to integrate reliability.
   */
  applyReliabilityToRankingScore(
    baseRankingScore: number,
    reliabilityScore: number,
    options: {
      weight?: number; // 0-1, how much reliability influences ranking
      threshold?: number; // penalize below this %
      ignoreReliability?: boolean;
    } = {},
  ): number {
    if (options.ignoreReliability) return baseRankingScore;

    const weight = options.weight ?? 0.2; // 20% weight by default
    const penalty = this.computeRankingPenalty(
      reliabilityScore,
      options.threshold,
    );

    const reliabilityContribution = reliabilityScore * weight;
    const baseContribution = baseRankingScore * (1 - weight);

    return parseFloat(
      Math.max(0, baseContribution + reliabilityContribution - penalty).toFixed(
        2,
      ),
    );
  }
}
