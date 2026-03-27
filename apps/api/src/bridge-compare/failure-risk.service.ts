import { Injectable } from '@nestjs/common';
import { ReliabilityMetrics } from './interfaces';
import { BridgeStatus } from './enums';

export interface FailureRiskAssessment {
  failureRisk: 'high' | 'medium' | 'low';
  riskFactors: string[];
}

// Thresholds for risk classification
const THRESHOLDS = {
  reliability: { high: 75, medium: 85 },   // score below these → risk
  successRate: { high: 90, medium: 95 },   // % below these → risk
  slippage: { high: 2, medium: 1 },        // % above these → risk
  incidents: { high: 5, medium: 3 },       // count above these → risk
  delay: { high: 20, medium: 10 },         // avgDelayPercent above these → risk
} as const;

@Injectable()
export class FailureRiskService {
  /**
   * Compute failure risk for a single route from its metrics.
   */
  assessRisk(
    reliabilityScore: number,
    metrics: ReliabilityMetrics,
    slippagePercent: number,
    bridgeStatus: BridgeStatus,
  ): FailureRiskAssessment {
    const highFactors: string[] = [];
    const mediumFactors: string[] = [];

    // Bridge status
    if (bridgeStatus === BridgeStatus.OFFLINE) {
      highFactors.push('Bridge is currently offline');
    } else if (bridgeStatus === BridgeStatus.DEGRADED) {
      highFactors.push('Bridge is experiencing degraded performance');
    }

    // Overall reliability
    if (reliabilityScore < THRESHOLDS.reliability.high) {
      highFactors.push(
        `Low reliability score (${reliabilityScore.toFixed(0)}/100)`,
      );
    } else if (reliabilityScore < THRESHOLDS.reliability.medium) {
      mediumFactors.push(
        `Moderate reliability score (${reliabilityScore.toFixed(0)}/100)`,
      );
    }

    // 7-day success rate
    if (metrics.successRate7d < THRESHOLDS.successRate.high) {
      highFactors.push(
        `Low 7-day success rate (${metrics.successRate7d.toFixed(1)}%)`,
      );
    } else if (metrics.successRate7d < THRESHOLDS.successRate.medium) {
      mediumFactors.push(
        `Slightly reduced 7-day success rate (${metrics.successRate7d.toFixed(1)}%)`,
      );
    }

    // Liquidity / slippage
    if (slippagePercent > THRESHOLDS.slippage.high) {
      highFactors.push(
        `High slippage indicating low liquidity (${slippagePercent.toFixed(2)}%)`,
      );
    } else if (slippagePercent > THRESHOLDS.slippage.medium) {
      mediumFactors.push(
        `Elevated slippage (${slippagePercent.toFixed(2)}%)`,
      );
    }

    // Recent incidents
    if (metrics.incidentCount30d >= THRESHOLDS.incidents.high) {
      highFactors.push(
        `${metrics.incidentCount30d} incidents in the last 30 days`,
      );
    } else if (metrics.incidentCount30d >= THRESHOLDS.incidents.medium) {
      mediumFactors.push(
        `${metrics.incidentCount30d} incidents in the last 30 days`,
      );
    }

    // Average delay
    if (metrics.avgDelayPercent > THRESHOLDS.delay.high) {
      highFactors.push(
        `High average transaction delay (${metrics.avgDelayPercent}%)`,
      );
    } else if (metrics.avgDelayPercent > THRESHOLDS.delay.medium) {
      mediumFactors.push(
        `Elevated average transaction delay (${metrics.avgDelayPercent}%)`,
      );
    }

    if (highFactors.length > 0) {
      return { failureRisk: 'high', riskFactors: highFactors };
    }
    if (mediumFactors.length > 0) {
      return { failureRisk: 'medium', riskFactors: mediumFactors };
    }
    return { failureRisk: 'low', riskFactors: [] };
  }
}
