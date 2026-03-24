export const RELIABILITY_CONSTANTS = {
  HIGH_THRESHOLD: 95,
  MEDIUM_THRESHOLD: 85,
  DEFAULT_WINDOW_SIZE: 100, // last 100 transactions
  DEFAULT_WINDOW_DAYS: 7, // last 7 days
  MIN_ATTEMPTS_FOR_SCORE: 5, // minimum attempts before scoring
  PENALTY_BELOW_THRESHOLD: 20, // ranking penalty points
  MAX_SCORE: 100,
  MIN_SCORE: 0,
} as const;

export const RELIABILITY_BADGE_LABELS = {
  HIGH: 'High Reliability',
  MEDIUM: 'Medium Reliability',
  LOW: 'Low Reliability',
} as const;
