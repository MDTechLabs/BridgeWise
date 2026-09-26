/**
 * Route Scoring Factors
 *
 * Provides scoring factor calculations for route explainability.
 * This module integrates with existing scoring systems to provide
 * factor breakdowns for the explainability model.
 */

import type { Route, RouteEvaluation } from '../smart/stellar/soroban-smart-routing-engine';

/** Scoring factor weights configuration. */
export interface ScoringWeights {
  fee: number;
  speed: number;
  reliability: number;
  liquidity?: number;
  risk?: number;
}

/** Liquidity data for a route. */
export interface LiquidityData {
  availableLiquidity: number;
  requiredLiquidity: number;
  score: number;
}

/** Reliability data for a route. */
export interface ReliabilityData {
  successRate: number;
  confidence: number;
  score: number;
}

/** Risk data for a route. */
export interface RiskData {
  riskScore: number;
  riskFactors: string[];
}

/** Complete scoring data for a route. */
export interface RouteScoringData {
  evaluation: RouteEvaluation;
  liquidityData?: LiquidityData;
  reliabilityData?: ReliabilityData;
  riskData?: RiskData;
  weights: ScoringWeights;
}

/**
 * Calculate fee score for a route (0-1, lower fee = higher score).
 */
export function calculateFeeScore(route: Route): number {
  // Normalize fee assuming max reasonable fee is 100 units
  return Math.max(0, 1 - route.estimatedFee / 100);
}

/**
 * Calculate speed score for a route (0-1, faster = higher score).
 */
export function calculateSpeedScore(route: Route): number {
  // Normalize time assuming max reasonable time is 5 minutes (300,000ms)
  return Math.max(0, 1 - route.estimatedTimeMs / 300_000);
}

/**
 * Calculate liquidity score based on available vs required liquidity.
 */
export function calculateLiquidityScore(
  availableLiquidity: number,
  requiredLiquidity: number
): number {
  if (requiredLiquidity === 0) return 1;
  const ratio = availableLiquidity / requiredLiquidity;
  // Score saturates at 2x required liquidity
  return Math.min(1, ratio / 2);
}

/**
 * Calculate risk-adjusted score (0-1, lower risk = higher score).
 */
export function calculateRiskScore(riskScore: number): number {
  // Invert risk score so higher = better
  return Math.max(0, 1 - riskScore);
}

/**
 * Normalize weights to ensure they sum to 1.
 */
export function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const total = weights.fee + weights.speed + weights.reliability + 
                (weights.liquidity || 0) + (weights.risk || 0);
  
  if (Math.abs(total - 1) < 1e-9) return { ...weights };
  if (total === 0) {
    return {
      fee: 0.25,
      speed: 0.25,
      reliability: 0.25,
      liquidity: 0.125,
      risk: 0.125,
    };
  }

  return {
    fee: weights.fee / total,
    speed: weights.speed / total,
    reliability: weights.reliability / total,
    liquidity: (weights.liquidity || 0) / total,
    risk: (weights.risk || 0) / total,
  };
}

/**
 * Calculate comprehensive route scoring data.
 */
export function calculateRouteScoringData(
  route: Route,
  reliabilityScore: number,
  options: {
    liquidityData?: LiquidityData;
    riskData?: RiskData;
    weights?: Partial<ScoringWeights>;
  } = {}
): RouteScoringData {
  const weights = normalizeWeights({
    fee: options.weights?.fee ?? 0.35,
    speed: options.weights?.speed ?? 0.35,
    reliability: options.weights?.reliability ?? 0.3,
    liquidity: options.weights?.liquidity ?? 0,
    risk: options.weights?.risk ?? 0,
  });

  const feeScore = calculateFeeScore(route);
  const speedScore = calculateSpeedScore(route);

  const evaluation: RouteEvaluation = {
    route,
    score: 0, // Will be calculated below
    breakdown: {
      feeScore,
      speedScore,
      reliabilityScore,
    },
  };

  // Calculate final score
  let totalScore = feeScore * weights.fee + 
                   speedScore * weights.speed + 
                   reliabilityScore * weights.reliability;

  if (options.liquidityData && weights.liquidity > 0) {
    totalScore += options.liquidityData.score * weights.liquidity;
  }

  if (options.riskData && weights.risk > 0) {
    totalScore += calculateRiskScore(options.riskData.riskScore) * weights.risk;
  }

  evaluation.score = totalScore;

  return {
    evaluation,
    liquidityData: options.liquidityData,
    reliabilityData: options.reliabilityData,
    riskData: options.riskData,
    weights,
  };
}
