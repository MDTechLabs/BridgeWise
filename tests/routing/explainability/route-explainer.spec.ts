/**
 * Tests for Stellar Route Explainability Model
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { StellarRouteExplainer } from '../../src/routing/explainability/stellar/route-explainer';
import type { ExplanationInput } from '../../src/routing/explainability/stellar/types';
import type { Route, RouteEvaluation } from '../../src/routing/smart/stellar/soroban-smart-routing-engine';

describe('StellarRouteExplainer', () => {
  let explainer: StellarRouteExplainer;

  beforeEach(() => {
    explainer = new StellarRouteExplainer();
  });

  describe('explain', () => {
    it('generates explanation with basic scoring factors', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const evaluation: RouteEvaluation = {
        route,
        score: 0.85,
        breakdown: {
          feeScore: 0.9,
          speedScore: 0.8,
          reliabilityScore: 0.85,
        },
      };

      const input: ExplanationInput = {
        evaluation,
        strategy: 'balanced',
        weights: {
          fee: 0.35,
          speed: 0.35,
          reliability: 0.3,
        },
      };

      const explanation = explainer.explain(input);

      expect(explanation.route).toEqual(route);
      expect(explanation.finalScore).toBe(0.85);
      expect(explanation.strategy).toBe('balanced');
      expect(explanation.factors).toHaveLength(3);
      expect(explanation.summary).toBeDefined();
      expect(explanation.timestamp).toBeGreaterThan(0);
    });

    it('includes liquidity factor when data is provided', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const evaluation: RouteEvaluation = {
        route,
        score: 0.85,
        breakdown: {
          feeScore: 0.9,
          speedScore: 0.8,
          reliabilityScore: 0.85,
        },
      };

      const input: ExplanationInput = {
        evaluation,
        strategy: 'balanced',
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
      };

      const explanation = explainer.explain(input);

      expect(explanation.factors).toHaveLength(4);
      expect(explanation.factors.some(f => f.name === 'liquidity')).toBe(true);
    });

    it('includes reliability factor when data is provided', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const evaluation: RouteEvaluation = {
        route,
        score: 0.85,
        breakdown: {
          feeScore: 0.9,
          speedScore: 0.8,
          reliabilityScore: 0.85,
        },
      };

      const input: ExplanationInput = {
        evaluation,
        strategy: 'balanced',
        reliabilityData: {
          successRate: 0.95,
          confidence: 0.9,
          score: 0.85,
        },
        weights: {
          fee: 0.35,
          speed: 0.35,
          reliability: 0.3,
        },
      };

      const explanation = explainer.explain(input);

      expect(explanation.factors).toHaveLength(3);
      expect(explanation.factors.some(f => f.name === 'reliability')).toBe(true);
    });

    it('includes risk factor when enabled and data is provided', () => {
      const explainerWithRisk = new StellarRouteExplainer({ includeRisk: true });

      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const evaluation: RouteEvaluation = {
        route,
        score: 0.85,
        breakdown: {
          feeScore: 0.9,
          speedScore: 0.8,
          reliabilityScore: 0.85,
        },
      };

      const input: ExplanationInput = {
        evaluation,
        strategy: 'balanced',
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
      };

      const explanation = explainerWithRisk.explain(input);

      expect(explanation.factors).toHaveLength(4);
      expect(explanation.factors.some(f => f.name === 'risk')).toBe(true);
    });

    it('excludes risk factor when disabled', () => {
      const explainerWithoutRisk = new StellarRouteExplainer({ includeRisk: false });

      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const evaluation: RouteEvaluation = {
        route,
        score: 0.85,
        breakdown: {
          feeScore: 0.9,
          speedScore: 0.8,
          reliabilityScore: 0.85,
        },
      };

      const input: ExplanationInput = {
        evaluation,
        strategy: 'balanced',
        riskData: {
          riskScore: 0.15,
          riskFactors: ['low liquidity'],
        },
        weights: {
          fee: 0.3,
          speed: 0.3,
          reliability: 0.25,
          risk: 0.15,
        },
      };

      const explanation = explainerWithoutRisk.explain(input);

      expect(explanation.factors).toHaveLength(3);
      expect(explanation.factors.some(f => f.name === 'risk')).toBe(false);
    });

    it('sorts factors by contribution (highest first)', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const evaluation: RouteEvaluation = {
        route,
        score: 0.85,
        breakdown: {
          feeScore: 0.9,
          speedScore: 0.8,
          reliabilityScore: 0.85,
        },
      };

      const input: ExplanationInput = {
        evaluation,
        strategy: 'balanced',
        weights: {
          fee: 0.5,
          speed: 0.3,
          reliability: 0.2,
        },
      };

      const explanation = explainer.explain(input);

      const contributions = explanation.factors.map(f => f.contribution);
      for (let i = 0; i < contributions.length - 1; i++) {
        expect(contributions[i]).toBeGreaterThanOrEqual(contributions[i + 1]);
      }
    });

    it('generates human-readable summary', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const evaluation: RouteEvaluation = {
        route,
        score: 0.85,
        breakdown: {
          feeScore: 0.9,
          speedScore: 0.8,
          reliabilityScore: 0.85,
        },
      };

      const input: ExplanationInput = {
        evaluation,
        strategy: 'balanced',
        weights: {
          fee: 0.35,
          speed: 0.35,
          reliability: 0.3,
        },
      };

      const explanation = explainer.explain(input);

      expect(explanation.summary).toContain('route-1');
      expect(explanation.summary).toContain('provider-a');
      expect(explanation.summary).toContain('85.0%');
    });

    it('identifies positive factors correctly', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const evaluation: RouteEvaluation = {
        route,
        score: 0.85,
        breakdown: {
          feeScore: 0.9,
          speedScore: 0.8,
          reliabilityScore: 0.85,
        },
      };

      const input: ExplanationInput = {
        evaluation,
        strategy: 'balanced',
        weights: {
          fee: 0.35,
          speed: 0.35,
          reliability: 0.3,
        },
      };

      const explanation = explainer.explain(input);

      explanation.factors.forEach(factor => {
        if (factor.score >= 0.6) {
          expect(factor.isPositive).toBe(true);
          expect(factor.explanation).toContain('positively');
        }
      });
    });

    it('identifies negative factors correctly', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 80,
        estimatedTimeMs: 250_000,
        maxSlippage: 0.01,
      };

      const evaluation: RouteEvaluation = {
        route,
        score: 0.4,
        breakdown: {
          feeScore: 0.2,
          speedScore: 0.17,
          reliabilityScore: 0.85,
        },
      };

      const input: ExplanationInput = {
        evaluation,
        strategy: 'balanced',
        weights: {
          fee: 0.35,
          speed: 0.35,
          reliability: 0.3,
        },
      };

      const explanation = explainer.explain(input);

      const negativeFactors = explanation.factors.filter(f => !f.isPositive);
      expect(negativeFactors.length).toBeGreaterThan(0);
      negativeFactors.forEach(factor => {
        expect(factor.explanation).toContain('negatively');
      });
    });

    it('uses custom factor labels when provided', () => {
      const customExplainer = new StellarRouteExplainer({
        factorLabels: {
          fee: 'Custom Fee Label',
          speed: 'Custom Speed Label',
        },
      });

      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const evaluation: RouteEvaluation = {
        route,
        score: 0.85,
        breakdown: {
          feeScore: 0.9,
          speedScore: 0.8,
          reliabilityScore: 0.85,
        },
      };

      const input: ExplanationInput = {
        evaluation,
        strategy: 'balanced',
        weights: {
          fee: 0.35,
          speed: 0.35,
          reliability: 0.3,
        },
      };

      const explanation = customExplainer.explain(input);

      const feeFactor = explanation.factors.find(f => f.name === 'fee');
      expect(feeFactor?.label).toBe('Custom Fee Label');

      const speedFactor = explanation.factors.find(f => f.name === 'speed');
      expect(speedFactor?.label).toBe('Custom Speed Label');
    });

    it('respects custom positive threshold', () => {
      const customExplainer = new StellarRouteExplainer({ positiveThreshold: 0.8 });

      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const evaluation: RouteEvaluation = {
        route,
        score: 0.75,
        breakdown: {
          feeScore: 0.9,
          speedScore: 0.7,
          reliabilityScore: 0.65,
        },
      };

      const input: ExplanationInput = {
        evaluation,
        strategy: 'balanced',
        weights: {
          fee: 0.35,
          speed: 0.35,
          reliability: 0.3,
        },
      };

      const explanation = customExplainer.explain(input);

      const speedFactor = explanation.factors.find(f => f.name === 'speed');
      expect(speedFactor?.isPositive).toBe(false);
    });

    it('generates deterministic explanations', () => {
      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const evaluation: RouteEvaluation = {
        route,
        score: 0.85,
        breakdown: {
          feeScore: 0.9,
          speedScore: 0.8,
          reliabilityScore: 0.85,
        },
      };

      const input: ExplanationInput = {
        evaluation,
        strategy: 'balanced',
        weights: {
          fee: 0.35,
          speed: 0.35,
          reliability: 0.3,
        },
      };

      const explanation1 = explainer.explain(input);
      const explanation2 = explainer.explain(input);

      expect(explanation1.summary).toBe(explanation2.summary);
      expect(explanation1.factors).toEqual(explanation2.factors);
    });
  });

  describe('updateConfig', () => {
    it('updates detailed factors setting', () => {
      explainer.updateConfig({ detailedFactors: false });

      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const evaluation: RouteEvaluation = {
        route,
        score: 0.85,
        breakdown: {
          feeScore: 0.9,
          speedScore: 0.8,
          reliabilityScore: 0.85,
        },
      };

      const input: ExplanationInput = {
        evaluation,
        strategy: 'balanced',
        weights: {
          fee: 0.35,
          speed: 0.35,
          reliability: 0.3,
        },
      };

      const explanation = explainer.explain(input);

      expect(explanation.summary).not.toContain('Scoring breakdown');
    });

    it('updates include risk setting', () => {
      explainer.updateConfig({ includeRisk: false });

      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const evaluation: RouteEvaluation = {
        route,
        score: 0.85,
        breakdown: {
          feeScore: 0.9,
          speedScore: 0.8,
          reliabilityScore: 0.85,
        },
      };

      const input: ExplanationInput = {
        evaluation,
        strategy: 'balanced',
        riskData: {
          riskScore: 0.15,
          riskFactors: ['low liquidity'],
        },
        weights: {
          fee: 0.3,
          speed: 0.3,
          reliability: 0.25,
          risk: 0.15,
        },
      };

      const explanation = explainer.explain(input);

      expect(explanation.factors.some(f => f.name === 'risk')).toBe(false);
    });

    it('updates positive threshold', () => {
      explainer.updateConfig({ positiveThreshold: 0.9 });

      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const evaluation: RouteEvaluation = {
        route,
        score: 0.85,
        breakdown: {
          feeScore: 0.9,
          speedScore: 0.8,
          reliabilityScore: 0.85,
        },
      };

      const input: ExplanationInput = {
        evaluation,
        strategy: 'balanced',
        weights: {
          fee: 0.35,
          speed: 0.35,
          reliability: 0.3,
        },
      };

      const explanation = explainer.explain(input);

      const speedFactor = explanation.factors.find(f => f.name === 'speed');
      expect(speedFactor?.isPositive).toBe(false);
    });

    it('updates factor labels', () => {
      explainer.updateConfig({ factorLabels: { fee: 'Updated Fee Label' } });

      const route: Route = {
        id: 'route-1',
        provider: 'provider-a',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        estimatedFee: 10,
        estimatedTimeMs: 120_000,
        maxSlippage: 0.01,
      };

      const evaluation: RouteEvaluation = {
        route,
        score: 0.85,
        breakdown: {
          feeScore: 0.9,
          speedScore: 0.8,
          reliabilityScore: 0.85,
        },
      };

      const input: ExplanationInput = {
        evaluation,
        strategy: 'balanced',
        weights: {
          fee: 0.35,
          speed: 0.35,
          reliability: 0.3,
        },
      };

      const explanation = explainer.explain(input);

      const feeFactor = explanation.factors.find(f => f.name === 'fee');
      expect(feeFactor?.label).toBe('Updated Fee Label');
    });
  });
});
