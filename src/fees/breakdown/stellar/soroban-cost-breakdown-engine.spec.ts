import { SorobanCostBreakdownEngine } from './soroban-cost-breakdown-engine';
import {
  InvalidQuoteError,
  STROOPS_PER_XLM,
} from './types';
import type { SorobanRouteQuote } from './types';

// ─── Fixture ──────────────────────────────────────────────────────────────────

function buildQuote(overrides: Partial<SorobanRouteQuote> = {}): SorobanRouteQuote {
  return {
    routeId: 'r1',
    bridgeId: 'soroswap',
    sourceNetwork: 'stellar',
    destinationNetwork: 'ethereum',
    amountIn: { code: 'USDC', rawAmount: 100_000_000n, decimals: 6 }, // 100 USDC
    amountOutExpected: 99_500_000n,
    amountOutMin: 98_000_000n,
    destinationAssetUsdPrice: 1, // 1 USD per USDC
    bridgeFee: { bps: 30 },
    network: {
      resourceFeeStroops: 100_000, // 0.01 XLM
      sourceGasUnits: 0,
      sourceGasPriceUnitsUsd: 0,
      destinationGasUnits: 50_000,
      destinationGasPriceUnitsUsd: 0.00002,
    },
    xlmUsdPrice: 0.1,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SorobanCostBreakdownEngine', () => {
  let tick: number;
  let engine: SorobanCostBreakdownEngine;

  beforeEach(() => {
    tick = 1_000;
    engine = new SorobanCostBreakdownEngine({ now: () => tick });
  });

  // ─── Shape & defaults ──────────────────────────────────────────────────────

  it('returns a fully-populated breakdown with timestamps', () => {
    const result = engine.breakdown(buildQuote());
    expect(result.routeId).toBe('r1');
    expect(result.bridgeId).toBe('soroswap');
    expect(result.bridgeFee).toBeDefined();
    expect(result.network).toBeDefined();
    expect(result.slippage).toBeDefined();
    expect(result.protocolFee).toBeDefined();
    expect(result.trustline).toBeDefined();
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.generatedAt).toBe(tick);
    expect(typeof result.totalUsdCents).toBe('number');
    expect(typeof result.totalCostPercent).toBe('number');
  });

  it('STROOPS_PER_XLM is exported and equals 10_000_000n', () => {
    expect(STROOPS_PER_XLM).toBe(10_000_000n);
  });

  // ─── Validation ───────────────────────────────────────────────────────────

  it.each([
    ['blank routeId', { routeId: '   ' }],
    ['blank bridgeId', { bridgeId: '' }],
    ['zero amountIn', { amountIn: { code: 'USDC', rawAmount: 0n, decimals: 6 } }],
    ['negative amountOutExpected', { amountOutExpected: -1n }],
    ['negative xlmUsdPrice', { xlmUsdPrice: -1 }],
    ['negative resourceFeeStroops', { network: { resourceFeeStroops: -1, sourceGasUnits: 0, sourceGasPriceUnitsUsd: 0, destinationGasUnits: 0, destinationGasPriceUnitsUsd: 0 } as SorobanRouteQuote['network'] }],
    ['out-of-range bridge bps', { bridgeFee: { bps: 10_001 } }],
    ['negative decimals', { amountIn: { code: 'USDC', rawAmount: 1n, decimals: -1 } }],
  ])('throws InvalidQuoteError for %s', (_label, override) => {
    expect(() => engine.breakdown(buildQuote(override))).toThrow(InvalidQuoteError);
  });

  // ─── Bridge fee component ─────────────────────────────────────────────────

  it('bridge fee with flat only', () => {
    const result = engine.breakdown(buildQuote({ bridgeFee: { flatUsdCents: 50 } }));
    expect(result.bridgeFee).toEqual({
      flatUsdCents: 50,
      bpsUsdCents: 0,
      tieredUsdCents: 0,
      totalUsdCents: 50,
    });
  });

  it('bridge fee with bps only (100 USDC × 30 bps = 30 cents)', () => {
    const result = engine.breakdown(buildQuote({ bridgeFee: { bps: 30 } }));
    expect(result.bridgeFee.bpsUsdCents).toBe(30);
    expect(result.bridgeFee.totalUsdCents).toBe(30);
  });

  it('bridge fee with flat + bps + tiered combined', () => {
    // 100 USD = 10_000 cents. flat=10, bps=10 (=10), tier[0] hits (100<=200 USD) → 25
    const result = engine.breakdown(
      buildQuote({
        bridgeFee: {
          flatUsdCents: 10,
          bps: 10,
          tiered: [{ upToAmountUsd: 200, feeUsdCents: 25 }],
        },
      }),
    );
    expect(result.bridgeFee.flatUsdCents).toBe(10);
    expect(result.bridgeFee.bpsUsdCents).toBe(10);
    expect(result.bridgeFee.tieredUsdCents).toBe(25);
    expect(result.bridgeFee.totalUsdCents).toBe(45);
  });

  it('bridge fee uses the last tier when amount exceeds every threshold', () => {
    const result = engine.breakdown(
      buildQuote({
        // amountIn here dwarfs both tiers
        amountIn: { code: 'USDC', rawAmount: 50_000_000_000n, decimals: 6 }, // 50_000 USDC
        bridgeFee: {
          tiered: [
            { upToAmountUsd: 50, feeUsdCents: 5 },
            { upToAmountUsd: 100, feeUsdCents: 10 },
          ],
        },
      }),
    );
    expect(result.bridgeFee.tieredUsdCents).toBe(10);
  });

  // ─── Network / gas ────────────────────────────────────────────────────────

  it('converts Soroban resource fee stroops to USD cents', () => {
    const result = engine.breakdown(
      buildQuote({
        network: {
          resourceFeeStroops: 1_000_000, // 0.1 XLM
          sourceGasUnits: 0,
          sourceGasPriceUnitsUsd: 0,
          destinationGasUnits: 0,
          destinationGasPriceUnitsUsd: 0,
        },
        xlmUsdPrice: 0.5,
      }),
    );
    // 0.1 XLM × 0.5 USD/XLM × 100 cents = 5 cents
    expect(result.network.resourceFeeUsdCents).toBe(5);
  });

  it('computes destination gas in USD cents', () => {
    const result = engine.breakdown(
      buildQuote({
        network: {
          resourceFeeStroops: 0,
          sourceGasUnits: 0,
          sourceGasPriceUnitsUsd: 0,
          destinationGasUnits: 100_000,
          destinationGasPriceUnitsUsd: 0.00002,
        },
      }),
    );
    // 100_000 * 0.00002 * 100 = 200 cents
    expect(result.network.destinationGasUsdCents).toBe(200);
  });

  it('honours the engine-level XLM price override', () => {
    const localEngine = new SorobanCostBreakdownEngine({
      now: () => tick,
      xlmUsdPriceOverride: 0.4,
    });
    const result = localEngine.breakdown(
      buildQuote({
        network: {
          resourceFeeStroops: 1_000_000, // 0.1 XLM
          sourceGasUnits: 0,
          sourceGasPriceUnitsUsd: 0,
          destinationGasUnits: 0,
          destinationGasPriceUnitsUsd: 0,
        },
        xlmUsdPrice: 0.5, // ignored
      }),
    );
    // 0.1 * 0.4 * 100 = 4 cents
    expect(result.network.resourceFeeUsdCents).toBe(4);
  });

  // ─── Slippage ─────────────────────────────────────────────────────────────

  it('computes slippage percent and USD-cent gap from expected vs min', () => {
    const result = engine.breakdown(
      buildQuote({
        amountOutExpected: 100_000_000n,
        amountOutMin: 95_000_000n,
        amountIn: { code: 'USDC', rawAmount: 100_000_000n, decimals: 6 },
      }),
    );
    // gap = 5 USD = 500 cents; percent = 5/100 * 100 = 5
    expect(result.slippage.slippagePercent).toBe(5);
    expect(result.slippage.gapUsdCents).toBe(500);
  });

  it('reports 0 slippage when min matches or exceeds expected', () => {
    const result = engine.breakdown(
      buildQuote({ amountOutExpected: 100_000_000n, amountOutMin: 100_000_000n }),
    );
    expect(result.slippage.slippagePercent).toBe(0);
    expect(result.slippage.gapUsdCents).toBe(0);
  });

  it('reports 0 slippage when expected is 0', () => {
    const result = engine.breakdown(buildQuote({ amountOutExpected: 0n }));
    expect(result.slippage.slippagePercent).toBe(0);
    expect(result.slippage.gapUsdCents).toBe(0);
  });

  // ─── Protocol fee ─────────────────────────────────────────────────────────

  it('computes protocol fee when protocolFeeBps is set', () => {
    const result = engine.breakdown(buildQuote({ protocolFeeBps: 20 }));
    // 10_000 cents * 20 / 10_000 = 20 cents
    expect(result.protocolFee).toEqual({ bpsUsdCents: 20 });
  });

  it('returns 0 protocol fee when protocolFeeBps is undefined', () => {
    const result = engine.breakdown(buildQuote());
    expect(result.protocolFee).toEqual({ bpsUsdCents: 0 });
  });

  // ─── Trustline ────────────────────────────────────────────────────────────

  it('records trustline component and emits a warning', () => {
    const result = engine.breakdown(buildQuote({ trustlineFeeStroops: 500_000 }));
    expect(result.trustline.stroops).toBe(500_000);
    // 0.05 XLM × 0.10 USD/XLM × 100 cents = 0.5 cents
    expect(result.trustline.usdCents).toBe(0.5);
    expect(result.warnings.some((w) => w.includes('trustline'))).toBe(true);
  });

  it('returns 0 trustline component when unset', () => {
    const result = engine.breakdown(buildQuote());
    expect(result.trustline).toEqual({ stroops: 0, usdCents: 0 });
    expect(result.warnings).toEqual([]);
  });

  // ─── Totals ───────────────────────────────────────────────────────────────

  it('totalUsdCents equals the sum of the rounded component totals', () => {
    const result = engine.breakdown(
      buildQuote({
        bridgeFee: { flatUsdCents: 50, bps: 30 },
        protocolFeeBps: 10,
        trustlineFeeStroops: 1_000_000,
      }),
    );
    const sum =
      result.bridgeFee.totalUsdCents +
      result.network.totalUsdCents +
      result.slippage.gapUsdCents +
      result.protocolFee.bpsUsdCents +
      result.trustline.usdCents;
    expect(result.totalUsdCents).toBe(sum);
    expect(result.componentTotals.bridge).toBe(result.bridgeFee.totalUsdCents);
    expect(result.componentTotals.network).toBe(result.network.totalUsdCents);
  });

  it('totalCostPercent scales with notional amount', () => {
    const small = engine.breakdown(
      buildQuote({
        routeId: 'small',
        bridgeFee: { flatUsdCents: 100 }, // 100 cents
        amountIn: { code: 'USDC', rawAmount: 100_000_000n, decimals: 6 }, // 100 USD = 10_000 cents
      }),
    );
    const big = engine.breakdown(
      buildQuote({
        routeId: 'big',
        bridgeFee: { flatUsdCents: 100 }, // 100 cents
        amountIn: { code: 'USDC', rawAmount: 100_000_000_000n, decimals: 6 }, // 100_000 USD = 10_000_000 cents
      }),
    );
    expect(small.totalCostPercent).toBeGreaterThan(big.totalCostPercent);
  });

  // ─── Warnings ─────────────────────────────────────────────────────────────

  it('warns when resource fee exceeds 0.1 XLM', () => {
    const result = engine.breakdown(
      buildQuote({
        network: {
          resourceFeeStroops: 2_000_000, // 0.2 XLM
          sourceGasUnits: 0,
          sourceGasPriceUnitsUsd: 0,
          destinationGasUnits: 0,
          destinationGasPriceUnitsUsd: 0,
        },
      }),
    );
    expect(result.warnings.some((w) => w.includes('Soroban resource fee'))).toBe(true);
  });

  it('warns when protocol fee exceeds 50 bps', () => {
    const result = engine.breakdown(buildQuote({ protocolFeeBps: 100 }));
    expect(result.warnings.some((w) => w.includes('protocol fee'))).toBe(true);
  });

  // ─── Batch + aggregate ────────────────────────────────────────────────────

  it('breakdownBatch atomically validates and returns one entry per quote', () => {
    const results = engine.breakdownBatch([
      buildQuote({ routeId: 'r-a' }),
      buildQuote({ routeId: 'r-b' }),
    ]);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.routeId)).toEqual(['r-a', 'r-b']);
  });

  it('breakdownBatch leaves no partial results on validation failure', () => {
    expect(() =>
      engine.breakdownBatch([buildQuote({ routeId: 'r-a' }), buildQuote({ routeId: '' })]),
    ).toThrow(InvalidQuoteError);
  });

  it('aggregate() over no quotes returns zeros and "none" driver', () => {
    expect(engine.aggregate([])).toEqual({
      routeCount: 0,
      averageTotalUsdCents: 0,
      medianTotalUsdCents: 0,
      minTotalUsdCents: 0,
      maxTotalUsdCents: 0,
      averageSlippagePercent: 0,
      averageCostPercent: 0,
      biggestCostDriver: 'none',
    });
  });

  it('aggregate() finds the biggest cost driver across routes', () => {
    const b1 = engine.breakdown(
      buildQuote({ routeId: 'route-heavy', bridgeFee: { flatUsdCents: 1_000 }, xlmUsdPrice: 0, network: { resourceFeeStroops: 0, sourceGasUnits: 0, sourceGasPriceUnitsUsd: 0, destinationGasUnits: 0, destinationGasPriceUnitsUsd: 0 } as SorobanRouteQuote['network'] }),
    );
    const b2 = engine.breakdown(
      buildQuote({ routeId: 'route-light', bridgeFee: { flatUsdCents: 10 } }),
    );
    const agg = engine.aggregate([b1, b2]);
    expect(agg.biggestCostDriver).toBe('bridge');
    expect(agg.routeCount).toBe(2);
    expect(agg.minTotalUsdCents).toBeLessThanOrEqual(agg.averageTotalUsdCents);
    expect(agg.averageTotalUsdCents).toBeLessThanOrEqual(agg.maxTotalUsdCents);
  });

  // ─── Precision ────────────────────────────────────────────────────────────

  it('uses bigint for amount subtraction without precision loss', () => {
    // Use values around Number.MAX_SAFE_INTEGER to demonstrate that
    // bigint subtraction (expected - min) keeps the gap exact.
    const result = engine.breakdown(
      buildQuote({
        amountOutExpected: 9_007_199_254_740_993n,
        amountOutMin: 9_007_199_254_728_648n,
        amountIn: { code: 'USDC', rawAmount: 9_007_199_254_740_993n, decimals: 6 },
      }),
    );
    // gapRaw = 12_345 raw → 0.012345 USDC → 1.2345 cents, exact.
    expect(result.slippage.gapUsdCents).toBe(1.2345);
  });
});
