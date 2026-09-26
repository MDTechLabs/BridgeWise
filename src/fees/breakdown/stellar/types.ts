// ─── Constants ────────────────────────────────────────────────────────────────

/** Conversion factor: 1 XLM = 10_000_000 stroops. */
export const STROOPS_PER_XLM = 10_000_000n;

// ─── Inputs ───────────────────────────────────────────────────────────────────

/** Asset amount expressed as raw smallest-unit bigint + decimals. */
export interface AssetAmount {
  /** Asset code, e.g. "USDC" or "XLM". */
  code: string;
  /** Raw balance in the asset's smallest unit. */
  rawAmount: bigint;
  /** Number of decimals the asset uses (e.g. 6 for USDC, 7 for XLM). */
  decimals: number;
}

/** Fee the bridge charges for forwarding funds. */
export interface BridgeFeeStructure {
  /** Flat fee, denominated in USD cents. */
  flatUsdCents?: number;
  /** Basis-point fee applied to the notional amount (0..10_000). */
  bps?: number;
  /** Tiered fee schedule: pick the first tier whose threshold covers the amount. */
  tiered?: Array<{ upToAmountUsd: number; feeUsdCents: number }>;
}

/** Network / gas fees on the source and destination chains. */
export interface NetworkFeeStructure {
  /** Soroban resource fee, in stroops. */
  resourceFeeStroops: number;
  /** Source-chain gas units (0 if not applicable, e.g. Soroban-only). */
  sourceGasUnits: number;
  /** Source-chain gas price in USD per unit (e.g. USD/gas). */
  sourceGasPriceUnitsUsd: number;
  /** Destination-chain gas units. */
  destinationGasUnits: number;
  /** Destination-chain gas price in USD per unit. */
  destinationGasPriceUnitsUsd: number;
  /** Asset code used to settle destination gas (defaults to XLM). */
  destinationGasAssetCode?: string;
}

/** A single Stellar / Soroban cross-chain route quote to be broken down. */
export interface SorobanRouteQuote {
  /** Stable id for the route proposal. */
  routeId: string;
  /** Bridge provider id (matches a `StellarBridgeProvider.id`). */
  bridgeId: string;
  /** Source network identifier. */
  sourceNetwork: string;
  /** Destination network identifier. */
  destinationNetwork: string;
  /** Source asset amount sent by the user. */
  amountIn: AssetAmount;
  /** Expected amount out from the bridge's quoted price (raw smallest unit). */
  amountOutExpected: bigint;
  /** Minimum amount out the user has accepted (raw smallest unit). */
  amountOutMin: bigint;
  /** USD price per unit of the destination asset. */
  destinationAssetUsdPrice: number;
  /** Bridge fee structure. */
  bridgeFee: BridgeFeeStructure;
  /** Network / gas fees involved. */
  network: NetworkFeeStructure;
  /** XLM/USD price used to convert Soroban stroops. */
  xlmUsdPrice: number;
  /** Optional trustline fee in stroops. */
  trustlineFeeStroops?: number;
  /** Optional protocol fee in basis points (0..10_000). */
  protocolFeeBps?: number;
  /** When the quote was generated. Optional. */
  quotedAt?: number;
}

// ─── Output Components ────────────────────────────────────────────────────────

export interface BridgeFeeComponent {
  flatUsdCents: number;
  bpsUsdCents: number;
  tieredUsdCents: number;
  totalUsdCents: number;
}

export interface NetworkFeeComponent {
  resourceFeeUsdCents: number;
  sourceGasUsdCents: number;
  destinationGasUsdCents: number;
  totalUsdCents: number;
}

export interface SlippageCostComponent {
  /** USD-cent value of the gap between expected and minimum threshold. */
  gapUsdCents: number;
  /** Slippage percent relative to the expected output (0..100). */
  slippagePercent: number;
}

export interface ProtocolFeeComponent {
  /** Protocol fee in USD cents. */
  bpsUsdCents: number;
}

export interface TrustlineFeeComponent {
  /** Stroops charged for the trustline, when applicable. */
  stroops: number;
  /** Equivalent USD cents. */
  usdCents: number;
}

/**
 * Structured output of breaking down a single route quote.
 *
 * Intentionally named differently from `optimization/costs/stellar`'s
 * `CostBreakdown` so the two engines do not collide at call sites. This
 * type focuses on per-component USD-cent totals + percent cost relative
 * to the notional, plus human-readable warnings.
 */
export interface SorobanQuoteBreakdown {
  routeId: string;
  bridgeId: string;
  sourceNetwork: string;
  destinationNetwork: string;
  bridgeFee: BridgeFeeComponent;
  network: NetworkFeeComponent;
  slippage: SlippageCostComponent;
  protocolFee: ProtocolFeeComponent;
  trustline: TrustlineFeeComponent;
  /** Total cost across all components, in USD cents. */
  totalUsdCents: number;
  /** Total cost as a percentage of the notional transfer (0..100). */
  totalCostPercent: number;
  /** Pre-rounded component subtotals for rendering / aggregation. */
  componentTotals: {
    bridge: number;
    network: number;
    slippage: number;
    protocol: number;
    trustline: number;
  };
  /** Human-readable warnings, e.g. trustline required or unusually high fees. */
  warnings: string[];
  /** Epoch ms when this breakdown was produced. */
  generatedAt: number;
}

// ─── Aggregate ────────────────────────────────────────────────────────────────

export type CostDriver = 'bridge' | 'network' | 'slippage' | 'protocol' | 'trustline' | 'none';

export interface BreakdownAggregate {
  routeCount: number;
  averageTotalUsdCents: number;
  medianTotalUsdCents: number;
  minTotalUsdCents: number;
  maxTotalUsdCents: number;
  averageSlippagePercent: number;
  averageCostPercent: number;
  /**
   * The component that contributes the largest aggregate USD-cent total
   * across the supplied breakdowns. `'none'` when no costs were incurred.
   */
  biggestCostDriver: CostDriver;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class InvalidQuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidQuoteError';
  }
}
