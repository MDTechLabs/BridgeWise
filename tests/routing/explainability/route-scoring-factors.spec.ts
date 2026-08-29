/**
 * Tests for Route Scoring Factors
 */

import { describe, it, expect } from '@jest/globals';
import {
  calculateFeeScore,
  calculateSpeedScore,
  calculateLiquidityScore,
  calculateRiskScore,
  normalizeWeights,
  calculateRouteScoringData,
} from '../../src/routing/scoring/route-scoring-factors';
import type { Route } from '../../src/routing/smart/stellar/soroban-smart-routing-engine';

describe('Route Scoring Factors', () => {
  describe('calculateFeeScore', () => {
    it('returns high score for low fees', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 5,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const score = calculateFeeScore(route);
      expect(score).toBeCloseTo(0.95, 1);
    });

    it('returns low score for high fees', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 90,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const score = calculateFeeScore(route);
      expect(score).toBeCloseTo(0.1, 1);
    });

    it('returns 0 for fees above 100', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 150,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const score = calculateFeeScore(route);
      expect(score).toBe(0);
    });

    it('returns 1 for zero fee', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 0,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const score = calculateFeeScore(route);
      expect(score).toBe(1);
    });
  });

  describe('calculateSpeedScore', () => {
    it('returns high score for fast transfers', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 30_000,
        maxSlippage: 0.01,
      };

      const score = calculateSpeedScore(route);
      expect(score).toBeCloseTo(0.9, 1);
    });

    it('returns low score for slow transfers', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 270_000,
        maxSlippage: 0.01,
      };

      const score = calculateSpeedScore(route);
      expect(score).toBeCloseTo(0.1, 1);
    });

    it('returns 0 for transfers above 5 minutes', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 400_000,
        maxSlippage: 0.01,
      };

      const score = calculateSpeedScore(route);
      expect(score).toBe(0);
    });

    it('returns 1 for instant transfers', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 0,
        maxSlippage: 0.01,
      };

      const score = calculateSpeedScore(route);
      expect(score).toBe(1);
    });
  });

  describe('calculateLiquidityScore', () => {
    it('returns high score when liquidity exceeds requirement', () => {
      const score = calculateLiquidityScore(100_000, 50_000);
      expect(score).toBe(1);
    });

    it('returns medium score when liquidity meets requirement', () => {
      const score = calculateLiquidityScore(50_000, 50_000);
      expect(score).toBeCloseTo(0.5, 1);
    });

    it('returns low score when liquidity is below requirement', () => {
      const score = calculateLiquidityScore(25_000, 50_000);
      expect(score).toBeCloseTo(0.25, 1);
    });

    it('returns 1 when required liquidity is zero', () => {
      const score = calculateLiquidityScore(100_000, 0);
      expect(score).toBe(1);
    });

    it('saturates at 2x required liquidity', () => {
      const score = calculateLiquidityScore(200_000, 50_000);
      expect(score).toBe(1);
    });
  });

  describe('calculateRiskScore', () => {
    it('returns high score for low risk', () => {
      const score = calculateRiskScore(0.1);
      expect(score).toBeCloseTo(0.9, 1);
    });

    it('returns low score for high risk', () => {
      const score = calculateRiskScore(0.9);
      expect(score).toBeCloseTo(0.1, 1);
    });

    it('returns 1 for zero risk', () => {
      const score = calculateRiskScore(0);
      expect(score).toBe(1);
    });

    it('returns 0 for maximum risk', () => {
      const score = calculateRiskScore(1);
      expect(score).toBe(0);
    });
  });

  describe('normalizeWeights', () => {
    it('returns same weights if they sum to 1', () => {
      const weights = {
        fee: 0.35,
        speed: 0.35,
        reliability: 0.3,
      };

      const normalized = normalizeWeights(weights);
      expect(normalized).toEqual(weights);
    });

    it('normalizes weights if they do not sum to 1', () => {
      const weights = {
        fee: 0.5,
        speed: 0.5,
        reliability: 0.5,
      };

      const normalized = normalizeWeights(weights);
      const total = normalized.fee + normalized.speed + normalized.reliability;
      expect(total).toBeCloseTo(1, 5);
    });

    it('returns equal weights if all are zero', () => {
      const weights = {
        fee: 0,
        speed: 0,
        reliability: 0,
        liquidity: 0,
        risk: 0,
      };

      const normalized = normalizeWeights(weights);
      const total = normalized.fee + normalized.speed + normalized.reliability + 
                    normalized.liquidity + normalized.risk;
      expect(total).toBeCloseTo(1, 5);
    });

    it('handles optional liquidity and risk weights', () => {
      const weights = {
        fee: 0.4,
        speed: 0.4,
        reliability: 0.2,
      };

      const normalized = normalizeWeights(weights);
      expect(normalized.liquidity).toBe(0);
      expect(normalized.risk).toBe(0);
    });
  });

  describe('calculateRouteScoringData', () => {
    it('calculates complete scoring data with basic factors', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const scoringData = calculateRouteScoringData(route, 0.85);

      expect(scoringData.evaluation.route).toEqual(route);
      expect(scoringData.evaluation.breakdown.feeScore).toBeCloseTo(0.9, 1);
      expect(scoringData.evaluation.breakdown.speedScore).toBeCloseTo(0.6, 1);
      expect(scoringData.evaluation.breakdown.reliabilityScore).toBe(0.85);
      expect(scoringData.weights).toBeDefined();
    });

    it('includes liquidity data when provided', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const scoringData = calculateRouteScoringData(route, 0.85, {
        liquidityData: {
          availableLiquidity: 100_000,
          requiredLiquidity: 50_000,
          score: 0.9,
        },
        weights: {
          fee: 0.3,
          speed: 0.3,
          reliability: 0.25,
          liquidity: 0.15,
        },
      });

      expect(scoringData.liquidityData).toBeDefined();
      expect(scoringData.liquidityData?.score).toBe(0.9);
      expect(scoringData.weights.liquidity).toBeGreaterThan(0);
    });

    it('includes risk data when provided', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const scoringData = calculateRouteScoringData(route, 0.85, {
        riskData: {
          riskScore: 0.15,
          riskFactors: ['low liquidity', 'high volatility'],
        },
        weights: {
          fee: 0.3,
          speed: 0.3,
          reliability: 0.25,
          risk: 0.15,
        },
      });

      expect(scoringData.riskData).toBeDefined();
      expect(scoringData.riskData?.riskScore).toBe(0.15);
      expect(scoringData.weights.risk).toBeGreaterThan(0);
    });

    it('uses custom weights when provided', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const customWeights = {
        fee: 0.5,
        speed: 0.3,
        reliability: 0.2,
      };

      const scoringData = calculateRouteScoringData(route, 0.85, {
        weights: customWeights,
      });

      expect(scoringData.weights.fee).toBeCloseTo(0.5, 5);
      expect(scoringData.weights.speed).toBeCloseTo(0.3, 5);
      expect(scoringData.weights.reliability).toBeCloseTo(0.2, 5);
    });

    it('calculates final score correctly', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const scoringData = calculateRouteScoringData(route, 0.85);

      const expectedScore = 
        scoringData.evaluation.breakdown.feeScore * scoringData.weights.fee +
        scoringData.evaluation.breakdown.speedScore * scoringData.weights.speed +
        scoringData.evaluation.breakdown.reliabilityScore * scoringData.weights.reliability;

      expect(scoringData.evaluation.score).toBeCloseTo(expectedScore, 5);
    });
  });
});
