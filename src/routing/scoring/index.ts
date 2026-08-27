// ─── Routing Scoring ─────────────────────────────────────────────────────────

export {
  DEFAULT_ROUTING_SCORING_WEIGHTS,
  type RoutingScoringWeights,
  type RoutingDimensionScores,
  type RoutingScoredEntry,
} from './types';

export {
  validateScoringWeights,
  mergeScoringWeights,
  normaliseWeights,
} from './scoring-weights';

export {
  calculateCompositeScore,
  scoreRoutes,
  type RoutingMetricsExtractor,
  type RoutingScoringMetrics,
} from './composite/composite-scorer';

export { scoreStellarRoutes } from './stellar';
