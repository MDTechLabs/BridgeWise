/**
 * Stellar Route Explainability Types
 *
 * Defines types for explaining why a particular route was recommended,
 * including scoring factors and human-readable explanations.
 */

import type { Route, RouteEvaluation } from '../../smart/stellar/soroban-smart-routing-engine';

/** Individual scoring factor contribution to route selection. */
export interface ScoringFactor {
  /** Factor name (e.g., 'fee', 'speed', 'liquidity', 'reliability', 'risk'). */
  name: string;
  /** Human-readable label for the factor. */
  label: string;
  /** Raw score value (0-1). */
  score: number;
  /** Weight applied to this factor in the final score. */
  weight: number;
  /** Weighted contribution to the final score (score * weight). */
  contribution: number;
  /** Human-readable explanation of this factor's contribution. */
  explanation: string;
  /** Whether this factor positively influenced the route selection. */
  isPositive: boolean;
}

/** Complete explanation of why a route was selected. */
export interface RouteExplanation {
  /** The route being explained. */
  route: Route;
  /** The final route score. */
  finalScore: number;
  /** Individual scoring factors with their contributions. */
  factors: ScoringFactor[];
  /** Overall human-readable explanation. */
  summary: string;
  /** The strategy that was used for route selection. */
  strategy: string;
  /** Timestamp when the explanation was generated. */
  timestamp: number;
}

/** Configuration for the explainability model. */
export interface ExplainabilityConfig {
  /** Enable detailed factor breakdown. */
  detailedFactors?: boolean;
  /** Include risk scoring in explanation. */
  includeRisk?: boolean;
  /** Custom labels for scoring factors. */
  factorLabels?: Partial<Record<string, string>>;
  /** Threshold for considering a factor as "positive" influence. */
  positiveThreshold?: number;
}

/** Input data for generating a route explanation. */
export interface ExplanationInput {
  /** The route evaluation to explain. */
  evaluation: RouteEvaluation;
  /** The strategy used for selection. */
  strategy: string;
  /** Optional liquidity data for the route. */
  liquidityData?: {
    availableLiquidity: number;
    requiredLiquidity: number;
    score: number;
  };
  /** Optional reliability data for the route. */
  reliabilityData?: {
    successRate: number;
    confidence: number;
    score: number;
  };
  /** Optional risk data for the route. */
  riskData?: {
    riskScore: number;
    riskFactors: string[];
  };
  /** Optional weights used in scoring. */
  weights?: {
    fee: number;
    speed: number;
    reliability: number;
    liquidity?: number;
    risk?: number;
  };
}
