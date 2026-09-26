import { Injectable } from '@nestjs/common';
import { ProviderHistoryEntry, ReputationScore } from './types';

@Injectable()
export class StellarReputationCalculator {
  /**
   * Weights must sum to 1.0
   */
  private readonly WEIGHTS = {
    reliability: 0.40,
    performance: 0.25,
    feeAccuracy: 0.20,
    slippageControl: 0.15,
  };

  private readonly RESPONSE_TIME_BASELINE_MS = 2000; // 2s = score of 50

  calculate(
    providerId: string,
    history: ProviderHistoryEntry[]
  ): ReputationScore {
    if (history.length === 0) {
      return this.zeroScore(providerId);
    }

    const reliability = this.calcReliability(history);
    const performance = this.calcPerformance(history);
    const feeAccuracy = this.calcFeeAccuracy(history);
    const slippageControl = this.calcSlippageControl(history);

    const overall =
      reliability  * this.WEIGHTS.reliability +
      performance  * this.WEIGHTS.performance +
      feeAccuracy  * this.WEIGHTS.feeAccuracy +
      slippageControl * this.WEIGHTS.slippageControl;

    return {
      providerId,
      overall:         Math.round(overall),
      reliability:     Math.round(reliability),
      performance:     Math.round(performance),
      feeAccuracy:     Math.round(feeAccuracy),
      slippageControl: Math.round(slippageControl),
      calculatedAt:    new Date(),
    };
  }

  private calcReliability(history: ProviderHistoryEntry[]): number {
    const successRate = history.filter((e) => e.success).length / history.length;
    return successRate * 100;
  }

  private calcPerformance(history: ProviderHistoryEntry[]): number {
    const avgMs =
      history.reduce((sum, e) => sum + e.responseTimeMs, 0) / history.length;

    // Score 100 at 0ms, 50 at baseline, approaches 0 above 4× baseline
    const score = 100 - (avgMs / this.RESPONSE_TIME_BASELINE_MS) * 50;
    return Math.max(0, Math.min(100, score));
  }

  private calcFeeAccuracy(history: ProviderHistoryEntry[]): number {
    const avg =
      history.reduce((sum, e) => sum + e.feeAccuracy, 0) / history.length;
    return avg * 100;
  }

  private calcSlippageControl(history: ProviderHistoryEntry[]): number {
    // Lower slippage = higher score; 0% slippage = 100, 5%+ slippage = 0
    const avgSlippage =
      history.reduce((sum, e) => sum + e.slippageActual, 0) / history.length;
    return Math.max(0, 100 - avgSlippage * 20);
  }

  private zeroScore(providerId: string): ReputationScore {
    return {
      providerId,
      overall: 0,
      reliability: 0,
      performance: 0,
      feeAccuracy: 0,
      slippageControl: 0,
      calculatedAt: new Date(),
    };
  }
}