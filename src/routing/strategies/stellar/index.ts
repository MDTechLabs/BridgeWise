export { SorobanRouteOptimizationStrategyEngine } from './strategy-engine';
export type {
  OptimizationPriority,
  StrategyWeights,
  StrategyMetadata,
  CustomRule,
  CustomWeightResolver,
  CustomRouteFilter,
  StrategyEngineConfig,
  StrategyOptimizationResult,
  StrategySelection,
} from './types';
export {
  CHEAPEST_STRATEGY,
  FASTEST_STRATEGY,
  SAFEST_STRATEGY,
  BALANCED_STRATEGY,
  PREBUILT_STRATEGIES,
} from './types';

import { SorobanRouteOptimizationStrategyEngine } from './strategy-engine';
import { PREBUILT_STRATEGIES } from './types';

/** Pre-configured engine instance with all built-in strategies registered. */
export const sorobanRouteOptimizationStrategyEngine =
  new SorobanRouteOptimizationStrategyEngine({
    strategies: PREBUILT_STRATEGIES,
    defaultStrategy: 'balanced',
  });
