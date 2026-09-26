import { ProviderHistory, HistoryEvent } from './history';

// Simple scoring: +1 for success, -2 for failure
const SCORE_SUCCESS = 1;
const SCORE_FAILURE = -2;

export class ScoreCalculator {
  calculateScore(history: ProviderHistory): number {
    if (!history || !history.events) {
      return 0;
    }

    return history.events.reduce((score, event) => {
      if (event.type === 'success') {
        return score + SCORE_SUCCESS;
      } else if (event.type === 'failure') {
        return score + SCORE_FAILURE;
      }
      return score;
    }, 0);
  }
}