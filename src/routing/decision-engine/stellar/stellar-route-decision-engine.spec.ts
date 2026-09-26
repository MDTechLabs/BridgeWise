/**
 * File: src/routing/decision-engine/stellar/stellar-route-decision-engine.spec.ts
 *
 * Unit tests for the Stellar Route Decision Engine.
 */

import { BridgeRoute } from '../../../services/route-ranker';
import { StellarRouteDecisionEngine } from './stellar-route-decision-engine';

const FIXED_NOW = 1_700_000_000_000;
const now = () => FIXED_NOW;

function makeRoute(partial: Partial<BridgeRoute> & { id: string; provider: string }): BridgeRoute {
  return {
    id: partial.id,
    fromChain: 'ethereum',
    toChain: 'stellar',
    fromToken: 'USDC',
    toToken: 'USDC',
    amount: '100',
    fee: { amount: '0.5', token: 'USDC', usdValue: 0.5 },
    estimatedTime: 10,
    successRate: 0.95,
    provider: partial.provider,
    slippage: 0.5,
    confidence: 0.9,
    ...partial,
  };
}

describe('StellarRouteDecisionEngine', () => {
  it('returns an empty result when no candidates are supplied', () => {
    const engine = new StellarRouteDecisionEngine({ now });
    const result = engine.decide([]);

    expect(result.selection).toBeNull();
    expect(result.alternatives).toEqual([]);
    expect(result.rejections).toEqual([]);
    expect(result.decidedAt).toBe(FIXED_NOW);
  });

  it('selects the top-ranked candidate and surfaces alternatives', () => {
    const engine = new StellarRouteDecisionEngine({ now });

    const candidates: BridgeRoute[] = [
      makeRoute({ id: 'r1', provider: 'allbridge', fee: { amount: '0.1', token: 'USDC', usdValue: 0.1 }, estimatedTime: 5, successRate: 0.98, slippage: 0.1 }),
      makeRoute({ id: 'r2', provider: 'squid', fee: { amount: '0.5', token: 'USDC', usdValue: 0.5 }, estimatedTime: 10, successRate: 0.95, slippage: 0.5 }),
      makeRoute({ id: 'r3', provider: 'wormhole', fee: { amount: '0.8', token: 'USDC', usdValue: 0.8 }, estimatedTime: 20, successRate: 0.92, slippage: 1.5 }),
    ];

    const result = engine.decide(candidates);

    expect(result.selection).not.toBeNull();
    expect(result.selection!.id).toBe('r1');
    expect(['r2', 'r3']).toContain(result.alternatives[0]?.id);
    expect(result.rejections).toEqual([]);
    expect(result.appliedPolicy.maxResults).toBe(3);
  });

  it('rejects routes that exceed the slippage policy', () => {
    const engine = new StellarRouteDecisionEngine({ now });
    const candidates: BridgeRoute[] = [
      makeRoute({ id: 'high-slippage', provider: 'p1', slippage: 10 }),
      makeRoute({ id: 'low-slippage', provider: 'p2', slippage: 0.2 }),
    ];

    const result = engine.decide(candidates, {}, { policy: { maxSlippage: 2 } });

    expect(result.rejections.map((r) => r.route.id)).toEqual(['high-slippage']);
    expect(result.selection?.id).toBe('low-slippage');
  });

  it('rejects routes from excluded providers', () => {
    const engine = new StellarRouteDecisionEngine({ now });
    const candidates: BridgeRoute[] = [
      makeRoute({ id: 'a', provider: 'allbridge' }),
      makeRoute({ id: 'b', provider: 'squid' }),
    ];

    const result = engine.decide(candidates, {}, {
      policy: { excludeProviders: ['allbridge'] },
    });

    expect(result.rejections.find((r) => r.route.id === 'a')).toBeDefined();
    expect(result.selection?.id).toBe('b');
  });

  it('honors a risk ceiling supplied via signals', () => {
    const engine = new StellarRouteDecisionEngine({ now });
    const candidates: BridgeRoute[] = [
      makeRoute({ id: 'safe', provider: 'allbridge', successRate: 0.99 }),
      makeRoute({ id: 'risky', provider: 'unknown', successRate: 0.9 }),
    ];

    const result = engine.decide(candidates, {}, {
      policy: { minRiskScore: 0.5 },
      signals: {
        riskSignals: [
          { routeId: 'risky', riskScore: 0.9, reason: 'centralized single validator' },
        ],
      },
    });

    expect(result.rejections.find((r) => r.route.id === 'risky')).toBeDefined();
    expect(result.selection?.id).toBe('safe');
  });

  it('drops routes marked incompatible by compatibility signals', () => {
    const engine = new StellarRouteDecisionEngine({ now });
    const candidates: BridgeRoute[] = [
      makeRoute({ id: 'good', provider: 'allbridge' }),
      makeRoute({ id: 'bad', provider: 'legacy' }),
    ];

    const result = engine.decide(candidates, {}, {
      signals: {
        compatibilitySignals: [
          { routeId: 'bad', compatible: false, missingFeatures: ['custom_types_v2'] },
        ],
      },
    });

    expect(result.rejections.find((r) => r.route.id === 'bad')).toBeDefined();
    expect(result.selection?.id).toBe('good');
  });

  it('respects maxResults when returning alternatives', () => {
    const engine = new StellarRouteDecisionEngine({ now });

    const routes: BridgeRoute[] = Array.from({ length: 5 }, (_, i) =>
      makeRoute({ id: `r${i}`, provider: `p${i}`, fee: { amount: `${i}`, token: 'USDC', usdValue: i } }),
    );

    const result = engine.decide(routes, {}, { policy: { maxResults: 2 } });

    expect(result.selection).not.toBeNull();
    expect(result.selection!.id).toBe('r0');
    expect(result.alternatives.length).toBe(1);
    expect(result.appliedPolicy.maxResults).toBe(2);
    expect(result.rejections.length).toBe(0);
  });

  it('produces a rejection list when every candidate is filtered', () => {
    const engine = new StellarRouteDecisionEngine({ now });
    const candidates: BridgeRoute[] = [
      makeRoute({ id: 'a', provider: 'p1', slippage: 10 }),
      makeRoute({ id: 'b', provider: 'p2', successRate: 0.5 }),
    ];

    const result = engine.decide(candidates);

    expect(result.selection).toBeNull();
    expect(result.alternatives).toEqual([]);
    expect(result.rejections.map((r) => r.route.id).sort()).toEqual(['a', 'b']);
  });
});
