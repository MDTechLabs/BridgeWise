import { Injectable, Logger } from '@nestjs/common';
import { ReliabilityMetrics } from '../interfaces';

@Injectable()
export class ReliabilityService {
  private readonly logger = new Logger(ReliabilityService.name);

  // Weights for composite reliability score
  private readonly WEIGHTS = {
    uptime: 0.35,
    successRate: 0.40,
    delayPenalty: 0.15,
    incidentPenalty: 0.10,
  } as const;

  // Simulated historical metrics — in production, fetched from monitoring DB
  private readonly MOCK_METRICS: Record<string, ReliabilityMetrics> = {
    stargate: {
      uptime24h: 99.8,
      successRate7d: 98.5,
      avgDelayPercent: 5,
      incidentCount30d: 1,
      reliabilityScore: 0,
    },
    squid: {
      uptime24h: 99.5,
      successRate7d: 97.2,
      avgDelayPercent: 12,
      incidentCount30d: 2,
      reliabilityScore: 0,
    },
    hop: {
      uptime24h: 98.9,
      successRate7d: 96.8,
      avgDelayPercent: 8,
      incidentCount30d: 3,
      reliabilityScore: 0,
    },
    cbridge: {
      uptime24h: 99.1,
      successRate7d: 97.5,
      avgDelayPercent: 10,
      incidentCount30d: 2,
      reliabilityScore: 0,
    },
    soroswap: {
      uptime24h: 97.5,
      successRate7d: 95.0,
      avgDelayPercent: 15,
      incidentCount30d: 5,
      reliabilityScore: 0,
    },
  };

  /**
   * Calculate a 0-100 reliability score for a bridge provider.
   */
  calculateReliabilityScore(bridgeId: string): number {
    const metrics = this.MOCK_METRICS[bridgeId.toLowerCase()];

    if (!metrics) {
      this.logger.warn(`No reliability metrics for bridge: ${bridgeId}, using default score`);
      return 70; // conservative default
    }

    const score = this.computeScore(metrics);
    this.logger.debug(`Reliability score for ${bridgeId}: ${score}`);
    return score;
  }

  /**
   * Get full reliability metrics for a bridge.
   */
  getMetrics(bridgeId: string): ReliabilityMetrics {
    const metrics = this.MOCK_METRICS[bridgeId.toLowerCase()];
    if (!metrics) {
      return {
        uptime24h: 0,
        successRate7d: 0,
        avgDelayPercent: 100,
        incidentCount30d: 99,
        reliabilityScore: 50,
      };
    }
    return { ...metrics, reliabilityScore: this.computeScore(metrics) };
  }

  /**
   * Batch compute scores for multiple bridges.
   */
  batchCalculateScores(bridgeIds: string[]): Map<string, number> {
    const results = new Map<string, number>();
    for (const id of bridgeIds) {
      results.set(id, this.calculateReliabilityScore(id));
    }
    return results;
  }

  private computeScore(metrics: ReliabilityMetrics): number {
    const uptimeScore = metrics.uptime24h; // 0-100
    const successScore = metrics.successRate7d; // 0-100
    const delayScore = Math.max(0, 100 - metrics.avgDelayPercent * 2); // penalize delays
    const incidentScore = Math.max(0, 100 - metrics.incidentCount30d * 5); // penalize incidents

    const composite =
      uptimeScore * this.WEIGHTS.uptime +
      successScore * this.WEIGHTS.successRate +
      delayScore * this.WEIGHTS.delayPenalty +
      incidentScore * this.WEIGHTS.incidentPenalty;

    return parseFloat(Math.min(100, Math.max(0, composite)).toFixed(2));
  }
}
