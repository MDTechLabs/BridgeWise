import { QuoteComparator } from '../../../src/quotes/comparison/stellar/quote-comparator';
import { DEFAULT_COMPARISON_WEIGHTS } from '../../../src/quotes/comparison/stellar/types';
import type { StellarBridgeQuote } from '../../../src/quotes/types/canonical-quote';
import type {
  QuoteComparisonWeights,
  QuoteComparisonEntry,
} from '../../../src/quotes/comparison/stellar/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FIXED_NOW = 1_700_000_000_000;

function buildQuote(
  overrides: Partial<StellarBridgeQuote> = {},
): StellarBridgeQuote {
  return {
    id: 'quote-1',
    providerId: 'allbridge',
    providerName: 'AllBridge',
    route: {
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      sourceAsset: 'USDC',
      destinationAsset: 'USDC',
      hops: 1,
    },
    fees: {
      bridgeFeeBps: 30,
      bridgeFeeFlatUsdCents: 50,
      networkFeeUsdCents: 25,
      totalFeeUsdCents: 100,
      feeToken: 'USDC',
    },
    execution: {
      estimatedTimeSeconds: 30,
      successRate: 0.98,
    },
    output: {
      inputAmount: '100',
      outputAmount: '99.5',
      netOutputAmount: '99.0',
      minOutputAmount: '98.0',
    },
    metadata: {},
    quotedAt: FIXED_NOW,
    ...overrides,
  };
}

function buildQuoteSet(): StellarBridgeQuote[] {
  return [
    buildQuote({
      id: 'q-cheap-slow',
      providerId: 'cheap-provider',
      providerName: 'CheapProvider',
      fees: {
        bridgeFeeBps: 10,
        bridgeFeeFlatUsdCents: 10,
        networkFeeUsdCents: 10,
        totalFeeUsdCents: 30,
        feeToken: 'USDC',
      },
      execution: { estimatedTimeSeconds: 120, successRate: 0.9 },
      output: {
        inputAmount: '100',
        outputAmount: '99.7',
        netOutputAmount: '99.4',
        minOutputAmount: '98.5',
      },
    }),
    buildQuote({
      id: 'q-fast-expensive',
      providerId: 'fast-provider',
      providerName: 'FastProvider',
      fees: {
        bridgeFeeBps: 80,
        bridgeFeeFlatUsdCents: 200,
        networkFeeUsdCents: 100,
        totalFeeUsdCents: 380,
        feeToken: 'USDC',
      },
      execution: { estimatedTimeSeconds: 5, successRate: 0.99 },
      output: {
        inputAmount: '100',
        outputAmount: '98.0',
        netOutputAmount: '96.5',
        minOutputAmount: '95.0',
      },
    }),
    buildQuote({
      id: 'q-balanced',
      providerId: 'balanced-provider',
      providerName: 'BalancedProvider',
      fees: {
        bridgeFeeBps: 40,
        bridgeFeeFlatUsdCents: 80,
        networkFeeUsdCents: 50,
        totalFeeUsdCents: 170,
        feeToken: 'USDC',
      },
      execution: { estimatedTimeSeconds: 45, successRate: 0.95 },
      output: {
        inputAmount: '100',
        outputAmount: '99.0',
        netOutputAmount: '98.0',
        minOutputAmount: '97.0',
      },
    }),
  ];
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('QuoteComparator', () => {
  let comparator: QuoteComparator;

  beforeEach(() => {
    comparator = new QuoteComparator({ now: () => FIXED_NOW });
  });

  // ─── Basic Comparison ───────────────────────────────────────────────────

  describe('compare()', () => {
    it('returns an empty result for an empty input', () => {
      const result = comparator.compare([]);
      expect(result.ranked).toEqual([]);
      expect(result.metadata.bestQuoteId).toBeNull();
      expect(result.metadata.totalQuotes).toBe(0);
      expect(result.metadata.averageCompositeScore).toBe(0);
    });

    it('returns a single entry for a single quote with neutral scores', () => {
      const quote = buildQuote();
      const result = comparator.compare([quote]);

      expect(result.ranked).toHaveLength(1);
      expect(result.ranked[0].rank).toBe(1);
      expect(result.ranked[0].deltaToBest).toBe(0);
      // With a single quote all ranges are equal → each dimension = 0.5
      expect(result.ranked[0].dimensionScores.receivedAmountScore).toBe(0.5);
      expect(result.ranked[0].dimensionScores.feeScore).toBe(0.5);
      expect(result.ranked[0].dimensionScores.speedScore).toBe(0.5);
      expect(result.ranked[0].dimensionScores.reliabilityScore).toBe(0.5);
    });

    it('ranks quotes correctly: best composite score gets rank 1', () => {
      const quotes = buildQuoteSet();
      const result = comparator.compare(quotes);

      expect(result.ranked.length).toBe(3);
      // Ranks should be sequential 1, 2, 3
      const ranks = result.ranked.map((e) => e.rank);
      expect(ranks).toEqual([1, 2, 3]);
      // Scores should be descending
      for (let i = 1; i < result.ranked.length; i++) {
        expect(result.ranked[i - 1].compositeScore).toBeGreaterThanOrEqual(
          result.ranked[i].compositeScore,
        );
      }
    });

    it('the top-ranked entry has deltaToBest === 0', () => {
      const quotes = buildQuoteSet();
      const result = comparator.compare(quotes);
      expect(result.ranked[0].deltaToBest).toBe(0);
    });

    it('all other entries have deltaToBest > 0', () => {
      const quotes = buildQuoteSet();
      const result = comparator.compare(quotes);
      for (let i = 1; i < result.ranked.length; i++) {
        expect(result.ranked[i].deltaToBest).toBeGreaterThan(0);
      }
    });

    it('preserves the original quote reference in each entry', () => {
      const quotes = buildQuoteSet();
      const result = comparator.compare(quotes);
      for (const entry of result.ranked) {
        const original = quotes.find((q) => q.id === entry.quote.id);
        expect(original).toBeDefined();
        expect(entry.quote).toBe(original);
      }
    });
  });

  // ─── Received Amount Comparison ─────────────────────────────────────────

  describe('received amount comparison', () => {
    it('gives a higher receivedAmountScore to quotes with more output', () => {
      const low = buildQuote({
        id: 'low',
        output: {
          inputAmount: '100',
          outputAmount: '90',
          netOutputAmount: '89',
          minOutputAmount: '88',
        },
      });
      const high = buildQuote({
        id: 'high',
        output: {
          inputAmount: '100',
          outputAmount: '99',
          netOutputAmount: '98',
          minOutputAmount: '97',
        },
      });

      const result = comparator.compare([low, high]);
      const highEntry = result.ranked.find((e) => e.quote.id === 'high')!;
      const lowEntry = result.ranked.find((e) => e.quote.id === 'low')!;

      expect(highEntry.dimensionScores.receivedAmountScore).toBeGreaterThan(
        lowEntry.dimensionScores.receivedAmountScore,
      );
    });

    it('falls back to outputAmount when netOutputAmount is 0', () => {
      const quote = buildQuote({
        output: {
          inputAmount: '100',
          outputAmount: '95',
          netOutputAmount: '0',
          minOutputAmount: '90',
        },
      });
      const amount = QuoteComparator.parseReceivedAmount(quote);
      expect(amount).toBe(95);
    });
  });

  // ─── Fee Comparison ─────────────────────────────────────────────────────

  describe('fee comparison', () => {
    it('gives a higher feeScore to quotes with lower total fees', () => {
      const expensive = buildQuote({
        id: 'expensive',
        fees: {
          bridgeFeeBps: 100,
          bridgeFeeFlatUsdCents: 500,
          networkFeeUsdCents: 200,
          totalFeeUsdCents: 700,
          feeToken: 'USDC',
        },
      });
      const cheap = buildQuote({
        id: 'cheap',
        fees: {
          bridgeFeeBps: 5,
          bridgeFeeFlatUsdCents: 10,
          networkFeeUsdCents: 5,
          totalFeeUsdCents: 20,
          feeToken: 'USDC',
        },
      });

      const result = comparator.compare([expensive, cheap]);
      const cheapEntry = result.ranked.find((e) => e.quote.id === 'cheap')!;
      const expensiveEntry = result.ranked.find(
        (e) => e.quote.id === 'expensive',
      )!;

      expect(cheapEntry.dimensionScores.feeScore).toBeGreaterThan(
        expensiveEntry.dimensionScores.feeScore,
      );
    });

    it('compareByFee sorts lowest fee first', () => {
      const quotes = buildQuoteSet();
      const sorted = QuoteComparator.compareByFee(quotes);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i - 1].fees.totalFeeUsdCents).toBeLessThanOrEqual(
          sorted[i].fees.totalFeeUsdCents,
        );
      }
    });
  });

  // ─── Speed Comparison ───────────────────────────────────────────────────

  describe('speed comparison', () => {
    it('gives a higher speedScore to faster quotes', () => {
      const slow = buildQuote({
        id: 'slow',
        execution: { estimatedTimeSeconds: 300, successRate: 0.95 },
      });
      const fast = buildQuote({
        id: 'fast',
        execution: { estimatedTimeSeconds: 5, successRate: 0.95 },
      });

      const result = comparator.compare([slow, fast]);
      const fastEntry = result.ranked.find((e) => e.quote.id === 'fast')!;
      const slowEntry = result.ranked.find((e) => e.quote.id === 'slow')!;

      expect(fastEntry.dimensionScores.speedScore).toBeGreaterThan(
        slowEntry.dimensionScores.speedScore,
      );
    });

    it('compareBySpeed sorts fastest first', () => {
      const quotes = buildQuoteSet();
      const sorted = QuoteComparator.compareBySpeed(quotes);
      for (let i = 1; i < sorted.length; i++) {
        expect(
          sorted[i - 1].execution.estimatedTimeSeconds,
        ).toBeLessThanOrEqual(sorted[i].execution.estimatedTimeSeconds);
      }
    });
  });

  // ─── Reliability Comparison ─────────────────────────────────────────────

  describe('reliability comparison', () => {
    it('gives a higher reliabilityScore to quotes with higher success rate', () => {
      const unreliable = buildQuote({
        id: 'unreliable',
        execution: { estimatedTimeSeconds: 30, successRate: 0.5 },
      });
      const reliable = buildQuote({
        id: 'reliable',
        execution: { estimatedTimeSeconds: 30, successRate: 0.99 },
      });

      const result = comparator.compare([unreliable, reliable]);
      const reliableEntry = result.ranked.find(
        (e) => e.quote.id === 'reliable',
      )!;
      const unreliableEntry = result.ranked.find(
        (e) => e.quote.id === 'unreliable',
      )!;

      expect(reliableEntry.dimensionScores.reliabilityScore).toBeGreaterThan(
        unreliableEntry.dimensionScores.reliabilityScore,
      );
    });

    it('compareByReliability sorts highest success rate first', () => {
      const quotes = buildQuoteSet();
      const sorted = QuoteComparator.compareByReliability(quotes);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i - 1].execution.successRate).toBeGreaterThanOrEqual(
          sorted[i].execution.successRate,
        );
      }
    });
  });

  // ─── Configurable Weights ───────────────────────────────────────────────

  describe('configurable weights', () => {
    it('uses default weights when none are provided', () => {
      const weights = comparator.getDefaultWeights();
      expect(weights).toEqual(DEFAULT_COMPARISON_WEIGHTS);
    });

    it('allows overriding individual weights', () => {
      const custom: QuoteComparator = new QuoteComparator({
        weights: { feeWeight: 0.8 },
      });
      const weights = custom.getDefaultWeights();
      expect(weights.feeWeight).toBe(0.8);
      // Other weights should remain at defaults
      expect(weights.receivedAmountWeight).toBe(
        DEFAULT_COMPARISON_WEIGHTS.receivedAmountWeight,
      );
    });

    it('fee-heavy weights rank the cheapest quote first', () => {
      const quotes = buildQuoteSet();
      const feeHeavy = new QuoteComparator({
        weights: {
          receivedAmountWeight: 0,
          feeWeight: 1,
          speedWeight: 0,
          reliabilityWeight: 0,
        },
      });
      const result = feeHeavy.compare(quotes);
      // The cheapest quote (q-cheap-slow, totalFeeUsdCents=30) should be rank 1
      expect(result.ranked[0].quote.id).toBe('q-cheap-slow');
    });

    it('speed-heavy weights rank the fastest quote first', () => {
      const quotes = buildQuoteSet();
      const speedHeavy = new QuoteComparator({
        weights: {
          receivedAmountWeight: 0,
          feeWeight: 0,
          speedWeight: 1,
          reliabilityWeight: 0,
        },
      });
      const result = speedHeavy.compare(quotes);
      // The fastest quote (q-fast-expensive, 5s) should be rank 1
      expect(result.ranked[0].quote.id).toBe('q-fast-expensive');
    });

    it('reliability-heavy weights rank the most reliable quote first', () => {
      const quotes = buildQuoteSet();
      const reliabilityHeavy = new QuoteComparator({
        weights: {
          receivedAmountWeight: 0,
          feeWeight: 0,
          speedWeight: 0,
          reliabilityWeight: 1,
        },
      });
      const result = reliabilityHeavy.compare(quotes);
      // Most reliable: q-fast-expensive (0.99)
      expect(result.ranked[0].quote.id).toBe('q-fast-expensive');
    });

    it('received-amount-heavy weights rank the highest output first', () => {
      const quotes = buildQuoteSet();
      const amountHeavy = new QuoteComparator({
        weights: {
          receivedAmountWeight: 1,
          feeWeight: 0,
          speedWeight: 0,
          reliabilityWeight: 0,
        },
      });
      const result = amountHeavy.compare(quotes);
      // Highest netOutputAmount: q-cheap-slow (99.4)
      expect(result.ranked[0].quote.id).toBe('q-cheap-slow');
    });

    it('all-zero weights produce a neutral 0.5 composite score', () => {
      const quotes = buildQuoteSet();
      const zeroWeights = new QuoteComparator({
        weights: {
          receivedAmountWeight: 0,
          feeWeight: 0,
          speedWeight: 0,
          reliabilityWeight: 0,
        },
      });
      const result = zeroWeights.compare(quotes);
      for (const entry of result.ranked) {
        expect(entry.compositeScore).toBe(0.5);
      }
    });

    it('per-call weight overrides take precedence over constructor weights', () => {
      const quotes = buildQuoteSet();
      const defaultComparator = new QuoteComparator();
      const result = defaultComparator.compare(quotes, {
        weights: {
          feeWeight: 1,
          receivedAmountWeight: 0,
          speedWeight: 0,
          reliabilityWeight: 0,
        },
      });
      expect(result.ranked[0].quote.id).toBe('q-cheap-slow');
    });
  });

  // ─── maxResults ─────────────────────────────────────────────────────────

  describe('maxResults', () => {
    it('limits the number of returned results', () => {
      const quotes = buildQuoteSet();
      const result = comparator.compare(quotes, { maxResults: 2 });
      expect(result.ranked).toHaveLength(2);
    });

    it('still returns the best quote when maxResults is 1', () => {
      const quotes = buildQuoteSet();
      const fullResult = comparator.compare(quotes);
      const limitedResult = comparator.compare(quotes, { maxResults: 1 });

      expect(limitedResult.ranked).toHaveLength(1);
      expect(limitedResult.ranked[0].quote.id).toBe(
        fullResult.ranked[0].quote.id,
      );
    });
  });

  // ─── Expired Quote Filtering ────────────────────────────────────────────

  describe('expired quote filtering', () => {
    it('does not filter expired quotes by default', () => {
      const quotes = [
        buildQuote({ id: 'expired', expiresAt: FIXED_NOW - 1000 }),
        buildQuote({ id: 'valid' }),
      ];
      const result = comparator.compare(quotes);
      expect(result.ranked).toHaveLength(2);
      expect(result.metadata.excludedQuotes).toBe(0);
    });

    it('excludes expired quotes when excludeExpired is true', () => {
      const quotes = [
        buildQuote({ id: 'expired', expiresAt: FIXED_NOW - 1000 }),
        buildQuote({ id: 'valid' }),
      ];
      const result = comparator.compare(quotes, { excludeExpired: true });
      expect(result.ranked).toHaveLength(1);
      expect(result.ranked[0].quote.id).toBe('valid');
      expect(result.metadata.excludedQuotes).toBe(1);
    });

    it('returns empty result when all quotes are expired', () => {
      const quotes = [
        buildQuote({ id: 'a', expiresAt: FIXED_NOW - 5000 }),
        buildQuote({ id: 'b', expiresAt: FIXED_NOW - 1000 }),
      ];
      const result = comparator.compare(quotes, { excludeExpired: true });
      expect(result.ranked).toHaveLength(0);
      expect(result.metadata.excludedQuotes).toBe(2);
      expect(result.metadata.bestQuoteId).toBeNull();
    });

    it('quotes without expiresAt are never excluded', () => {
      const quotes = [buildQuote({ id: 'no-expiry' })];
      const result = comparator.compare(quotes, { excludeExpired: true });
      expect(result.ranked).toHaveLength(1);
    });
  });

  // ─── getBest() ──────────────────────────────────────────────────────────

  describe('getBest()', () => {
    it('returns the top-ranked entry', () => {
      const quotes = buildQuoteSet();
      const best = comparator.getBest(quotes);
      expect(best).not.toBeNull();
      expect(best!.rank).toBe(1);
    });

    it('returns null for an empty input', () => {
      const best = comparator.getBest([]);
      expect(best).toBeNull();
    });
  });

  // ─── comparePair() ──────────────────────────────────────────────────────

  describe('comparePair()', () => {
    it('returns exactly two ranked entries', () => {
      const a = buildQuote({ id: 'a' });
      const b = buildQuote({ id: 'b' });
      const [first, second] = comparator.comparePair(a, b);
      expect(first.rank).toBe(1);
      expect(second.rank).toBe(2);
    });

    it('ranks the better quote first', () => {
      const cheapQuote = buildQuote({
        id: 'cheap',
        fees: {
          bridgeFeeBps: 5,
          bridgeFeeFlatUsdCents: 5,
          networkFeeUsdCents: 5,
          totalFeeUsdCents: 15,
          feeToken: 'USDC',
        },
      });
      const expensiveQuote = buildQuote({
        id: 'expensive',
        fees: {
          bridgeFeeBps: 200,
          bridgeFeeFlatUsdCents: 500,
          networkFeeUsdCents: 300,
          totalFeeUsdCents: 1000,
          feeToken: 'USDC',
        },
      });
      const [first] = comparator.comparePair(cheapQuote, expensiveQuote);
      expect(first.quote.id).toBe('cheap');
    });
  });

  // ─── Metadata ───────────────────────────────────────────────────────────

  describe('comparison metadata', () => {
    it('records totalQuotes correctly', () => {
      const quotes = buildQuoteSet();
      const result = comparator.compare(quotes);
      expect(result.metadata.totalQuotes).toBe(3);
    });

    it('records the correct bestQuoteId', () => {
      const quotes = buildQuoteSet();
      const result = comparator.compare(quotes);
      expect(result.metadata.bestQuoteId).toBe(result.ranked[0].quote.id);
    });

    it('records the correct bestCompositeScore', () => {
      const quotes = buildQuoteSet();
      const result = comparator.compare(quotes);
      expect(result.metadata.bestCompositeScore).toBe(
        result.ranked[0].compositeScore,
      );
    });

    it('records the correct averageCompositeScore', () => {
      const quotes = buildQuoteSet();
      const result = comparator.compare(quotes);
      const expected =
        result.ranked.reduce((sum, e) => sum + e.compositeScore, 0) /
        result.ranked.length;
      expect(result.metadata.averageCompositeScore).toBeCloseTo(expected);
    });

    it('records the correct scoreRange', () => {
      const quotes = buildQuoteSet();
      const result = comparator.compare(quotes);
      const scores = result.ranked.map((e) => e.compositeScore);
      expect(result.metadata.scoreRange.min).toBe(Math.min(...scores));
      expect(result.metadata.scoreRange.max).toBe(Math.max(...scores));
    });

    it('records the provider distribution', () => {
      const quotes = buildQuoteSet();
      const result = comparator.compare(quotes);
      expect(result.metadata.providerDistribution['cheap-provider']).toBe(1);
      expect(result.metadata.providerDistribution['fast-provider']).toBe(1);
      expect(result.metadata.providerDistribution['balanced-provider']).toBe(1);
    });

    it('records the applied weights', () => {
      const quotes = buildQuoteSet();
      const customWeights: Partial<QuoteComparisonWeights> = { feeWeight: 0.5 };
      const result = comparator.compare(quotes, { weights: customWeights });
      expect(result.metadata.appliedWeights.feeWeight).toBe(0.5);
      expect(result.metadata.appliedWeights.receivedAmountWeight).toBe(
        DEFAULT_COMPARISON_WEIGHTS.receivedAmountWeight,
      );
    });

    it('records comparedAt timestamp', () => {
      const result = comparator.compare(buildQuoteSet());
      expect(result.metadata.comparedAt).toBe(FIXED_NOW);
    });
  });

  // ─── Deterministic Ranking ──────────────────────────────────────────────

  describe('deterministic ranking', () => {
    it('produces the same ranking on repeated calls with the same input', () => {
      const quotes = buildQuoteSet();
      const r1 = comparator.compare(quotes);
      const r2 = comparator.compare(quotes);

      expect(r1.ranked.map((e) => e.quote.id)).toEqual(
        r2.ranked.map((e) => e.quote.id),
      );
      expect(r1.ranked.map((e) => e.compositeScore)).toEqual(
        r2.ranked.map((e) => e.compositeScore),
      );
    });

    it('ranking is consistent regardless of input order', () => {
      const quotes = buildQuoteSet();
      const reversed = [...quotes].reverse();
      const r1 = comparator.compare(quotes);
      const r2 = comparator.compare(reversed);

      // Same set of IDs should appear in the same order
      expect(r1.ranked.map((e) => e.quote.id)).toEqual(
        r2.ranked.map((e) => e.quote.id),
      );
    });
  });

  // ─── Static Dimension Comparators ───────────────────────────────────────

  describe('static dimension comparators', () => {
    it('compareByReceivedAmount returns a new array (does not mutate input)', () => {
      const quotes = buildQuoteSet();
      const original = [...quotes];
      QuoteComparator.compareByReceivedAmount(quotes);
      expect(quotes).toEqual(original);
    });

    it('compareByFee returns a new array (does not mutate input)', () => {
      const quotes = buildQuoteSet();
      const original = [...quotes];
      QuoteComparator.compareByFee(quotes);
      expect(quotes).toEqual(original);
    });

    it('compareBySpeed returns a new array (does not mutate input)', () => {
      const quotes = buildQuoteSet();
      const original = [...quotes];
      QuoteComparator.compareBySpeed(quotes);
      expect(quotes).toEqual(original);
    });

    it('compareByReliability returns a new array (does not mutate input)', () => {
      const quotes = buildQuoteSet();
      const original = [...quotes];
      QuoteComparator.compareByReliability(quotes);
      expect(quotes).toEqual(original);
    });
  });

  // ─── Edge Cases ─────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles quotes with identical dimension values', () => {
      const a = buildQuote({ id: 'a' });
      const b = buildQuote({ id: 'b' });
      const result = comparator.compare([a, b]);
      // All dimensions are identical → all scores should be 0.5
      for (const entry of result.ranked) {
        expect(entry.compositeScore).toBe(0.5);
      }
    });

    it('handles quotes with zero fees', () => {
      const free = buildQuote({
        id: 'free',
        fees: {
          bridgeFeeBps: 0,
          bridgeFeeFlatUsdCents: 0,
          networkFeeUsdCents: 0,
          totalFeeUsdCents: 0,
          feeToken: 'USDC',
        },
      });
      const paid = buildQuote({
        id: 'paid',
        fees: {
          bridgeFeeBps: 50,
          bridgeFeeFlatUsdCents: 100,
          networkFeeUsdCents: 50,
          totalFeeUsdCents: 200,
          feeToken: 'USDC',
        },
      });
      const result = comparator.compare([free, paid]);
      const freeEntry = result.ranked.find((e) => e.quote.id === 'free')!;
      expect(freeEntry.dimensionScores.feeScore).toBe(1);
    });

    it('handles quotes with zero estimated time', () => {
      const instant = buildQuote({
        id: 'instant',
        execution: { estimatedTimeSeconds: 0, successRate: 0.95 },
      });
      const slow = buildQuote({
        id: 'slow',
        execution: { estimatedTimeSeconds: 600, successRate: 0.95 },
      });
      const result = comparator.compare([instant, slow]);
      const instantEntry = result.ranked.find((e) => e.quote.id === 'instant')!;
      expect(instantEntry.dimensionScores.speedScore).toBe(1);
    });

    it('composite scores are always in [0, 1]', () => {
      const quotes = buildQuoteSet();
      const result = comparator.compare(quotes);
      for (const entry of result.ranked) {
        expect(entry.compositeScore).toBeGreaterThanOrEqual(0);
        expect(entry.compositeScore).toBeLessThanOrEqual(1);
      }
    });

    it('dimension scores are always in [0, 1]', () => {
      const quotes = buildQuoteSet();
      const result = comparator.compare(quotes);
      for (const entry of result.ranked) {
        const ds = entry.dimensionScores;
        for (const val of Object.values(ds)) {
          expect(val).toBeGreaterThanOrEqual(0);
          expect(val).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});
