import {
  InvalidQuoteError,
  STROOPS_PER_XLM,
  type AssetAmount,
  type BreakdownAggregate,
  type BridgeFeeComponent,
  type BridgeFeeStructure,
  type CostDriver,
  type NetworkFeeComponent,
  type NetworkFeeStructure,
  type ProtocolFeeComponent,
  type SlippageCostComponent,
  type SorobanQuoteBreakdown,
  type SorobanRouteQuote,
  type TrustlineFeeComponent,
} from './types';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface SorobanCostBreakdownEngineOptions {
  /**
   * Injected clock for deterministic `generatedAt` timestamps.
   * Defaults to `Date.now`.
   */
  now?: () => number;
  /**
   * Optional override for the XLM/USD price used to convert Soroban
   * stroops (and XLM-denominated trustline fees) to USD. When set, this
   * wins over each quote's `xlmUsdPrice`.
   */
  xlmUsdPriceOverride?: number;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

/**
 * Soroban Route Cost Breakdown Engine (issue #446).
 *
 * Decomposes a single Stellar / Soroban cross-chain route quote (or any
 * set of such quotes) into a structured, audit-friendly breakdown of
 * every cost component:
 * - bridge fee (flat + basis points + tiered)
 * - network / gas fees on source + destination chains
 * - slippage cost derived from `amountOutExpected` vs `amountOutMin`
 * - optional protocol fee
 * - optional trustline fee
 *
 * Distinct from `optimization/costs/stellar/soroban-cost-optimizer.ts`,
 * which **ranks** routes by a weighted cost. This engine produces a
 * forensic / display / billing-friendly breakdown.
 *
 * Raw balances are kept in `bigint` so quote amounts do not lose
 * precision in floats.
 */
export class SorobanCostBreakdownEngine {
  private readonly now: () => number;
  private readonly xlmUsdPriceOverride: number | undefined;

  constructor(options: SorobanCostBreakdownEngineOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.xlmUsdPriceOverride = options.xlmUsdPriceOverride;
  }

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Decompose a single quote.
   * @throws `InvalidQuoteError` if any required field is malformed.
   */
  breakdown(quote: SorobanRouteQuote): SorobanQuoteBreakdown {
    this.assertValidQuote(quote);
    const xlmUsdPrice = this.xlmUsdPriceOverride ?? quote.xlmUsdPrice;

    const bridgeFee = this.computeBridgeFee(
      quote.bridgeFee,
      quote.amountIn,
      quote.destinationAssetUsdPrice,
    );
    const network = this.computeNetworkFee(quote.network, xlmUsdPrice);
    const slippage = this.computeSlippageCost(quote, quote.destinationAssetUsdPrice);
    const protocolFee = this.computeProtocolFee(
      quote.protocolFeeBps,
      quote.amountIn,
      quote.destinationAssetUsdPrice,
    );
    const trustline = this.computeTrustlineFee(quote.trustlineFeeStroops, xlmUsdPrice);
    const warnings = this.computeWarnings(quote);

    const totalUsdCents =
      bridgeFee.totalUsdCents +
      network.totalUsdCents +
      slippage.gapUsdCents +
      protocolFee.bpsUsdCents +
      trustline.usdCents;

    const amountInUsdCents = amountToUsdCents(
      quote.amountIn,
      quote.destinationAssetUsdPrice,
    );
    const totalCostPercent = amountInUsdCents > 0 ? (totalUsdCents / amountInUsdCents) * 100 : 0;

    return {
      routeId: quote.routeId,
      bridgeId: quote.bridgeId,
      sourceNetwork: quote.sourceNetwork,
      destinationNetwork: quote.destinationNetwork,
      bridgeFee,
      network,
      slippage,
      protocolFee,
      trustline,
      totalUsdCents: round(totalUsdCents),
      totalCostPercent: round(totalCostPercent, 4),
      componentTotals: {
        bridge: bridgeFee.totalUsdCents,
        network: network.totalUsdCents,
        slippage: slippage.gapUsdCents,
        protocol: protocolFee.bpsUsdCents,
        trustline: trustline.usdCents,
      },
      warnings,
      generatedAt: this.now(),
    };
  }

  /**
   * Decompose multiple quotes. Validates every quote before breaking
   * any down to preserve atomic failure semantics.
   */
  breakdownBatch(quotes: SorobanRouteQuote[]): SorobanQuoteBreakdown[] {
    for (const quote of quotes) this.assertValidQuote(quote);
    return quotes.map((quote) => this.breakdown(quote));
  }

  /** Aggregate stats over a set of pre-computed breakdowns. */
  aggregate(breakdowns: SorobanQuoteBreakdown[]): BreakdownAggregate {
    if (breakdowns.length === 0) {
      return {
        routeCount: 0,
        averageTotalUsdCents: 0,
        medianTotalUsdCents: 0,
        minTotalUsdCents: 0,
        maxTotalUsdCents: 0,
        averageSlippagePercent: 0,
        averageCostPercent: 0,
        biggestCostDriver: 'none',
      };
    }

    const totals = breakdowns.map((b) => b.totalUsdCents);
    const sortedTotals = [...totals].sort((a, b) => a - b);
    const sum = totals.reduce((acc, n) => acc + n, 0);
    const averageSlippagePercent =
      breakdowns.reduce((acc, b) => acc + b.slippage.slippagePercent, 0) / breakdowns.length;
    const averageCostPercent =
      breakdowns.reduce((acc, b) => acc + b.totalCostPercent, 0) / breakdowns.length;

    return {
      routeCount: breakdowns.length,
      averageTotalUsdCents: round(sum / breakdowns.length),
      medianTotalUsdCents: round(sortedTotals[Math.floor(sortedTotals.length / 2)]),
      minTotalUsdCents: round(sortedTotals[0]),
      maxTotalUsdCents: round(sortedTotals[sortedTotals.length - 1]),
      averageSlippagePercent: round(averageSlippagePercent, 4),
      averageCostPercent: round(averageCostPercent, 4),
      biggestCostDriver: this.pickBiggestDriver(breakdowns),
    };
  }

  // ─── Component computations ───────────────────────────────────────────

  /**
   * Compute the bridge fee component. All branches operate in USD cents
   * to keep the chain of arithmetic stable.
   */
  computeBridgeFee(
    fee: BridgeFeeStructure,
    amountIn: AssetAmount,
    assetUsdPrice: number,
  ): BridgeFeeComponent {
    const amountUsdCents = amountToUsdCents(amountIn, assetUsdPrice);
    const flatUsdCents = fee.flatUsdCents ?? 0;
    const bpsUsdCents = fee.bps ? (amountUsdCents * fee.bps) / 10_000 : 0;
    const tieredUsdCents = fee.tiered ? this.applyTieredFee(fee.tiered, amountUsdCents) : 0;

    return {
      flatUsdCents: round(flatUsdCents),
      bpsUsdCents: round(bpsUsdCents),
      tieredUsdCents: round(tieredUsdCents),
      totalUsdCents: round(flatUsdCents + bpsUsdCents + tieredUsdCents),
    };
  }

  /** Compute the network / gas fee component, converting stroops to USD. */
  computeNetworkFee(network: NetworkFeeStructure, xlmUsdPrice: number): NetworkFeeComponent {
    if (xlmUsdPrice < 0) {
      throw new InvalidQuoteError('xlmUsdPrice must be non-negative');
    }
    const resourceFeeUsdCents =
      (network.resourceFeeStroops / Number(STROOPS_PER_XLM)) * xlmUsdPrice * 100;
    const sourceGasUsdCents = network.sourceGasUnits * network.sourceGasPriceUnitsUsd * 100;
    const destinationGasUsdCents =
      network.destinationGasUnits * network.destinationGasPriceUnitsUsd * 100;
    return {
      resourceFeeUsdCents: round(resourceFeeUsdCents),
      sourceGasUsdCents: round(sourceGasUsdCents),
      destinationGasUsdCents: round(destinationGasUsdCents),
      totalUsdCents: round(resourceFeeUsdCents + sourceGasUsdCents + destinationGasUsdCents),
    };
  }

  /**
   * Compute the slippage cost in USD cents and as a percentage. Uses
   * bigint subtraction so the gap is exact for any token-decimal range.
   */
  computeSlippageCost(
    quote: SorobanRouteQuote,
    assetUsdPrice: number,
  ): SlippageCostComponent {
    const expected = quote.amountOutExpected;
    const min = quote.amountOutMin;
    if (expected <= 0n) {
      return { gapUsdCents: 0, slippagePercent: 0 };
    }
    const gapRaw = expected > min ? expected - min : 0n;
    if (gapRaw === 0n) {
      return { gapUsdCents: 0, slippagePercent: 0 };
    }
    const gapRatio = Number(gapRaw) / Number(expected); // 0..1
    const gapUsdCents = this.gapToUsdCents(gapRaw, quote.amountIn.decimals, assetUsdPrice);
    return {
      gapUsdCents: round(gapUsdCents),
      slippagePercent: round(gapRatio * 100, 4),
    };
  }

  /** Compute the protocol fee in USD cents. */
  computeProtocolFee(
    bps: number | undefined,
    amountIn: AssetAmount,
    assetUsdPrice: number,
  ): ProtocolFeeComponent {
    if (bps === undefined || bps <= 0) return { bpsUsdCents: 0 };
    const amountUsdCents = amountToUsdCents(amountIn, assetUsdPrice);
    return { bpsUsdCents: round((amountUsdCents * bps) / 10_000) };
  }

  /** Compute the trustline fee in stroops + USD cents. */
  computeTrustlineFee(
    stroops: number | undefined,
    xlmUsdPrice: number,
  ): TrustlineFeeComponent {
    if (stroops === undefined || stroops <= 0) {
      return { stroops: 0, usdCents: 0 };
    }
    const usdCents = (stroops / Number(STROOPS_PER_XLM)) * xlmUsdPrice * 100;
    return { stroops, usdCents: round(usdCents) };
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private computeWarnings(quote: SorobanRouteQuote): string[] {
    const warnings: string[] = [];
    if (quote.trustlineFeeStroops && quote.trustlineFeeStroops > 0) {
      warnings.push('trustline fee required — recipient will need to establish a trustline');
    }
    if (quote.network.resourceFeeStroops > 1_000_000) {
      warnings.push('Soroban resource fee is unusually high (>0.1 XLM)');
    }
    if (quote.protocolFeeBps !== undefined && quote.protocolFeeBps > 50) {
      warnings.push('protocol fee exceeds 0.5%');
    }
    return warnings;
  }

  private gapToUsdCents(gapRaw: bigint, decimals: number, assetUsdPrice: number): number {
    const divisor = 10 ** decimals;
    const gapUnits = Number(gapRaw) / divisor; // exact decimal value
    return gapUnits * assetUsdPrice * 100;
  }

  private applyTieredFee(
    tiers: NonNullable<BridgeFeeStructure['tiered']>,
    amountUsdCents: number,
  ): number {
    let chosen = 0;
    let matched = false;
    for (const tier of tiers) {
      const centsThreshold = tier.upToAmountUsd * 100;
      if (amountUsdCents <= centsThreshold) {
        chosen = tier.feeUsdCents;
        matched = true;
        break;
      }
    }
    if (!matched && tiers.length > 0) {
      chosen = tiers[tiers.length - 1].feeUsdCents;
    }
    return chosen;
  }

  private pickBiggestDriver(breakdowns: SorobanQuoteBreakdown[]): CostDriver {
    const totals: Record<Exclude<CostDriver, 'none'>, number> = {
      bridge: 0,
      network: 0,
      slippage: 0,
      protocol: 0,
      trustline: 0,
    };
    for (const b of breakdowns) {
      totals.bridge += b.componentTotals.bridge;
      totals.network += b.componentTotals.network;
      totals.slippage += b.componentTotals.slippage;
      totals.protocol += b.componentTotals.protocol;
      totals.trustline += b.componentTotals.trustline;
    }
    let best: CostDriver = 'none';
    let max = -Infinity;
    for (const key of Object.keys(totals) as Array<Exclude<CostDriver, 'none'>>) {
      if (totals[key] > max) {
        max = totals[key];
        best = key;
      }
    }
    return max > 0 ? best : 'none';
  }

  private assertValidQuote(quote: SorobanRouteQuote): void {
    if (typeof quote.routeId !== 'string' || !quote.routeId.trim()) {
      throw new InvalidQuoteError('routeId must be a non-empty string');
    }
    if (typeof quote.bridgeId !== 'string' || !quote.bridgeId.trim()) {
      throw new InvalidQuoteError(`route "${quote.routeId}": bridgeId must be a non-empty string`);
    }
    if (quote.amountIn.rawAmount <= 0n) {
      throw new InvalidQuoteError(
        `route "${quote.routeId}": amountIn.rawAmount must be positive`,
      );
    }
    if (quote.amountOutExpected < 0n) {
      throw new InvalidQuoteError(
        `route "${quote.routeId}": amountOutExpected must be non-negative`,
      );
    }
    if (quote.amountOutMin < 0n) {
      throw new InvalidQuoteError(
        `route "${quote.routeId}": amountOutMin must be non-negative`,
      );
    }
    if (quote.destinationAssetUsdPrice < 0) {
      throw new InvalidQuoteError(
        `route "${quote.routeId}": destinationAssetUsdPrice must be non-negative`,
      );
    }
    if (quote.xlmUsdPrice < 0) {
      throw new InvalidQuoteError(`route "${quote.routeId}": xlmUsdPrice must be non-negative`);
    }
    if (quote.network.resourceFeeStroops < 0) {
      throw new InvalidQuoteError(
        `route "${quote.routeId}": network.resourceFeeStroops must be non-negative`,
      );
    }
    if (quote.network.sourceGasUnits < 0 || quote.network.sourceGasPriceUnitsUsd < 0) {
      throw new InvalidQuoteError(
        `route "${quote.routeId}": source-gas numbers must be non-negative`,
      );
    }
    if (quote.network.destinationGasUnits < 0 || quote.network.destinationGasPriceUnitsUsd < 0) {
      throw new InvalidQuoteError(
        `route "${quote.routeId}": destination-gas numbers must be non-negative`,
      );
    }
    if (quote.amountIn.decimals < 0) {
      throw new InvalidQuoteError(
        `route "${quote.routeId}": amountIn.decimals must be non-negative`,
      );
    }
    if (
      quote.bridgeFee.bps !== undefined &&
      (quote.bridgeFee.bps < 0 || quote.bridgeFee.bps > 10_000)
    ) {
      throw new InvalidQuoteError(`route "${quote.routeId}": bridgeFee.bps must be in [0, 10_000]`);
    }
    if (
      quote.protocolFeeBps !== undefined &&
      (quote.protocolFeeBps < 0 || quote.protocolFeeBps > 10_000)
    ) {
      throw new InvalidQuoteError(
        `route "${quote.routeId}": protocolFeeBps must be in [0, 10_000]`,
      );
    }
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function round(value: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function amountToUsdCents(amount: AssetAmount, assetUsdPrice: number): number {
  const divisor = 10 ** amount.decimals;
  const units = Number(amount.rawAmount) / divisor;
  return units * assetUsdPrice * 100;
}
