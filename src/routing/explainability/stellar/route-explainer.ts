/**
 * Stellar Route Explainability Model
 *
 * Generates human-readable explanations for why a particular route was recommended,
 * exposing the scoring factors that influenced the decision.
 *
 * Features:
 * - Fee contribution analysis
 * - Speed contribution analysis
 * - Liquidity contribution analysis
 * - Reliability contribution analysis
 * - Risk contribution analysis
 * - Deterministic explanation output
 */

import type {
  ExplanationInput,
  ExplainabilityConfig,
  RouteExplanation,
  ScoringFactor,
} from './types';

const DEFAULT_CONFIG: Required<Omit<ExplainabilityConfig, 'factorLabels'>> = {
  detailedFactors: true,
  includeRisk: true,
  positiveThreshold: 0.6,
};

const DEFAULT_FACTOR_LABELS: Record<string, string> = {
  fee: 'Transaction Fee',
  speed: 'Transfer Speed',
  liquidity: 'Available Liquidity',
  reliability: 'Provider Reliability',
  risk: 'Route Risk',
};

/**
 * StellarRouteExplainer
 *
 * Generates explanations for route selection decisions by analyzing
 * the scoring factors that contributed to the final route score.
 */
export class StellarRouteExplainer {
  private config: Required<Omit<ExplainabilityConfig, 'factorLabels'>>;
  private factorLabels: Record<string, string>;

  constructor(config: ExplainabilityConfig = {}) {
    this.config = {
      detailedFactors: config.detailedFactors ?? DEFAULT_CONFIG.detailedFactors,
      includeRisk: config.includeRisk ?? DEFAULT_CONFIG.includeRisk,
      positiveThreshold: config.positiveThreshold ?? DEFAULT_CONFIG.positiveThreshold,
    };
    this.factorLabels = { ...DEFAULT_FACTOR_LABELS, ...config.factorLabels };
  }

  /**
   * Generate a complete explanation for a route selection.
   */
  explain(input: ExplanationInput): RouteExplanation {
    const factors = this.calculateFactors(input);
    const summary = this.generateSummary(input, factors);

    return {
      route: input.evaluation.route,
      finalScore: input.evaluation.score,
      factors,
      summary,
      strategy: input.strategy,
      timestamp: Date.now(),
    };
  }

  /**
   * Calculate individual scoring factors and their contributions.
   */
  private calculateFactors(input: ExplanationInput): ScoringFactor[] {
    const factors: ScoringFactor[] = [];
    const weights = input.weights || {
      fee: 0.35,
      speed: 0.35,
      reliability: 0.3,
      liquidity: 0,
      risk: 0,
    };

    // Fee factor
    const feeFactor = this.calculateFeeFactor(input, weights.fee);
    if (feeFactor) factors.push(feeFactor);

    // Speed factor
    const speedFactor = this.calculateSpeedFactor(input, weights.speed);
    if (speedFactor) factors.push(speedFactor);

    // Liquidity factor
    if (input.liquidityData && weights.liquidity > 0) {
      const liquidityFactor = this.calculateLiquidityFactor(input, weights.liquidity);
      if (liquidityFactor) factors.push(liquidityFactor);
    }

    // Reliability factor
    if (input.reliabilityData) {
      const reliabilityFactor = this.calculateReliabilityFactor(input, weights.reliability);
      if (reliabilityFactor) factors.push(reliabilityFactor);
    }

    // Risk factor
    if (this.config.includeRisk && input.riskData && weights.risk > 0) {
      const riskFactor = this.calculateRiskFactor(input, weights.risk);
      if (riskFactor) factors.push(riskFactor);
    }

    // Sort factors by contribution (highest first)
    return factors.sort((a, b) => b.contribution - a.contribution);
  }

  /**
   * Calculate fee scoring factor.
   */
  private calculateFeeFactor(input: ExplanationInput, weight: number): ScoringFactor | null {
    const feeScore = input.evaluation.breakdown.feeScore;
    const fee = input.evaluation.route.estimatedFee;

    const contribution = feeScore * weight;
    const isPositive = feeScore >= this.config.positiveThreshold;

    let explanation: string;
    if (isPositive) {
      explanation = `Low transaction fee of ${fee.toFixed(2)} units (${(feeScore * 100).toFixed(1)}% score) positively influenced route selection.`;
    } else {
      explanation = `Higher transaction fee of ${fee.toFixed(2)} units (${(feeScore * 100).toFixed(1)}% score) negatively impacted route selection.`;
    }

    return {
      name: 'fee',
      label: this.factorLabels.fee,
      score: feeScore,
      weight,
      contribution,
      explanation,
      isPositive,
    };
  }

  /**
   * Calculate speed scoring factor.
   */
  private calculateSpeedFactor(input: ExplanationInput, weight: number): ScoringFactor | null {
    const speedScore = input.evaluation.breakdown.speedScore;
    const timeMs = input.evaluation.route.estimatedTimeMs;
    const timeMinutes = timeMs / 60_000;

    const contribution = speedScore * weight;
    const isPositive = speedScore >= this.config.positiveThreshold;

    let explanation: string;
    if (isPositive) {
      explanation = `Fast estimated transfer time of ${timeMinutes.toFixed(1)} minutes (${(speedScore * 100).toFixed(1)}% score) positively influenced route selection.`;
    } else {
      explanation = `Slower estimated transfer time of ${timeMinutes.toFixed(1)} minutes (${(speedScore * 100).toFixed(1)}% score) negatively impacted route selection.`;
    }

    return {
      name: 'speed',
      label: this.factorLabels.speed,
      score: speedScore,
      weight,
      contribution,
      explanation,
      isPositive,
    };
  }

  /**
   * Calculate liquidity scoring factor.
   */
  private calculateLiquidityFactor(input: ExplanationInput, weight: number): ScoringFactor | null {
    if (!input.liquidityData) return null;

    const { availableLiquidity, requiredLiquidity, score } = input.liquidityData;
    const liquidityRatio = availableLiquidity / requiredLiquidity;

    const contribution = score * weight;
    const isPositive = score >= this.config.positiveThreshold;

    let explanation: string;
    if (isPositive) {
      explanation = `Sufficient liquidity available (${(liquidityRatio * 100).toFixed(1)}% of required, ${(score * 100).toFixed(1)}% score) positively influenced route selection.`;
    } else {
      explanation = `Limited liquidity available (${(liquidityRatio * 100).toFixed(1)}% of required, ${(score * 100).toFixed(1)}% score) negatively impacted route selection.`;
    }

    return {
      name: 'liquidity',
      label: this.factorLabels.liquidity,
      score,
      weight,
      contribution,
      explanation,
      isPositive,
    };
  }

  /**
   * Calculate reliability scoring factor.
   */
  private calculateReliabilityFactor(input: ExplanationInput, weight: number): ScoringFactor | null {
    if (!input.reliabilityData) return null;

    const { successRate, confidence, score } = input.reliabilityData;
    const reliabilityScore = input.evaluation.breakdown.reliabilityScore;

    const contribution = reliabilityScore * weight;
    const isPositive = reliabilityScore >= this.config.positiveThreshold;

    let explanation: string;
    if (isPositive) {
      explanation = `High provider reliability with ${(successRate * 100).toFixed(1)}% success rate and ${(confidence * 100).toFixed(1)}% confidence (${(reliabilityScore * 100).toFixed(1)}% score) positively influenced route selection.`;
    } else {
      explanation = `Lower provider reliability with ${(successRate * 100).toFixed(1)}% success rate (${(reliabilityScore * 100).toFixed(1)}% score) negatively impacted route selection.`;
    }

    return {
      name: 'reliability',
      label: this.factorLabels.reliability,
      score: reliabilityScore,
      weight,
      contribution,
      explanation,
      isPositive,
    };
  }

  /**
   * Calculate risk scoring factor.
   */
  private calculateRiskFactor(input: ExplanationInput, weight: number): ScoringFactor | null {
    if (!input.riskData) return null;

    const { riskScore, riskFactors } = input.riskData;
    // Invert risk score so higher = better (like other factors)
    const adjustedScore = 1 - riskScore;

    const contribution = adjustedScore * weight;
    const isPositive = adjustedScore >= this.config.positiveThreshold;

    let explanation: string;
    if (isPositive) {
      explanation = `Low route risk (${(riskScore * 100).toFixed(1)}% risk score, ${(adjustedScore * 100).toFixed(1)}% safety score) positively influenced route selection.`;
    } else {
      const factorsList = riskFactors.length > 0 ? riskFactors.join(', ') : 'general risk factors';
      explanation = `Elevated route risk (${(riskScore * 100).toFixed(1)}% risk score, ${factorsList}) negatively impacted route selection.`;
    }

    return {
      name: 'risk',
      label: this.factorLabels.risk,
      score: adjustedScore,
      weight,
      contribution,
      explanation,
      isPositive,
    };
  }

  /**
   * Generate a human-readable summary of the route selection.
   */
  private generateSummary(input: ExplanationInput, factors: ScoringFactor[]): string {
    const route = input.evaluation.route;
    const score = input.evaluation.score;
    const positiveFactors = factors.filter(f => f.isPositive);
    const negativeFactors = factors.filter(f => !f.isPositive);

    let summary = `Route "${route.id}" via ${route.provider} was selected with a final score of ${(score * 100).toFixed(1)}%. `;

    if (positiveFactors.length > 0) {
      const topPositive = positiveFactors[0];
      summary += `The primary positive influence was ${topPositive.label.toLowerCase()} (${(topPositive.contribution * 100).toFixed(1)}% contribution). `;
    }

    if (negativeFactors.length > 0) {
      const topNegative = negativeFactors[0];
      summary += `The main concern was ${topNegative.label.toLowerCase()} (${(topNegative.contribution * 100).toFixed(1)}% contribution). `;
    }

    if (this.config.detailedFactors) {
      summary += `Scoring breakdown: ${factors.map(f => `${f.label} ${(f.contribution * 100).toFixed(1)}%`).join(', ')}.`;
    }

    return summary;
  }

  /**
   * Update the explainability configuration.
   */
  updateConfig(config: Partial<ExplainabilityConfig>): void {
    if (config.detailedFactors !== undefined) {
      this.config.detailedFactors = config.detailedFactors;
    }
    if (config.includeRisk !== undefined) {
      this.config.includeRisk = config.includeRisk;
    }
    if (config.positiveThreshold !== undefined) {
      this.config.positiveThreshold = config.positiveThreshold;
    }
    if (config.factorLabels) {
      this.factorLabels = { ...this.factorLabels, ...config.factorLabels };
    }
  }
}
