import { Injectable } from '@nestjs/common';
import { StellarReputationStore }      from './stellar-reputation.store';
import { StellarReputationCalculator } from './stellar-reputation.calculator';
import { StellarReputationReporter }   from './stellar-reputation.reporter';
import { ProviderHistoryEntry, ReputationScore, TrendReport } from './types';

@Injectable()
export class StellarReputationTracker {
  constructor(
    private readonly store:      StellarReputationStore,
    private readonly calculator: StellarReputationCalculator,
    private readonly reporter:   StellarReputationReporter,
  ) {}

  /**
   * Record a provider interaction and refresh their score.
   */
  track(providerId: string, entry: ProviderHistoryEntry): ReputationScore {
    this.store.appendEntry(providerId, entry);

    const history = this.store.getHistory(providerId);
    const score   = this.calculator.calculate(providerId, history);
    this.store.setScore(providerId, score);

    return score;
  }

  /**
   * Get the latest cached reputation score for a provider.
   */
  getScore(providerId: string): ReputationScore | null {
    return this.store.getScore(providerId);
  }

  /**
   * Get reputation scores for all tracked providers.
   */
  getAllScores(): ReputationScore[] {
    return this.store
      .getAllProviderIds()
      .map((id) => this.store.getScore(id))
      .filter((s): s is ReputationScore => s !== null);
  }

  /**
   * Generate a trend report for a provider.
   */
  getTrendReport(
    providerId: string,
    period: TrendReport['period'] = 'weekly'
  ): TrendReport {
    const history = this.store.getHistory(providerId);
    return this.reporter.generate(providerId, history, period);
  }
}