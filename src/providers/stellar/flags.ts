import { ProviderHistory } from './history';
import { ScoreCalculator } from './score';

const LOW_SCORE_THRESHOLD = -5;

export class FlagManager {
  private scoreCalculator: ScoreCalculator;

  constructor() {
    this.scoreCalculator = new ScoreCalculator();
  }

  isProviderFlagged(history: ProviderHistory): boolean {
    const score = this.scoreCalculator.calculateScore(history);
    return score < LOW_SCORE_THRESHOLD;
  }
}