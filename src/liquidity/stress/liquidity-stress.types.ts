/**
 * File: src/liquidity/stress/liquidity-stress.types.ts
 *
 * Type definitions for liquidity stress scenarios.
 *
 * A stress scenario is an ordered list of shocks (large withdrawals, demand
 * surges, provider outages, inflows) applied to a snapshot of liquidity pools.
 * The tester replays the shocks and reports whether liquidity survives, how
 * much buffer remains, and which pools breach their minimum buffer — so the
 * treasury can size reserves against realistic worst cases.
 */

/** A single liquidity pool's starting state for a stress run. */
export interface LiquidityPoolState {
  /** Pool/provider identifier. */
  id: string;
  /** Asset symbol (e.g. USDC, XLM). Matched case-insensitively for asset shocks. */
  asset: string;
  /** Current available liquidity as a non-negative decimal string. */
  available: string;
  /**
   * Minimum liquidity that must remain for the pool to stay healthy. Breaching
   * it flags the pool even if it is not fully depleted. Defaults to '0'.
   */
  minimumBuffer?: string;
}

/**
 * A shock applied to the book. Shocks target a specific pool (`poolId`), all
 * pools of an `asset`, or — when neither is given — every pool proportionally.
 */
export type StressShock =
  /** Remove an absolute amount of liquidity. */
  | { kind: 'withdrawal'; amount: string; poolId?: string; asset?: string }
  /** Remove a percentage of each targeted pool's current available liquidity. */
  | { kind: 'withdrawalPct'; percent: number; poolId?: string; asset?: string }
  /** Add an absolute amount of liquidity (e.g. an emergency top-up). */
  | { kind: 'inflow'; amount: string; poolId?: string; asset?: string }
  /** Take a pool offline; its liquidity becomes stranded (unusable). */
  | { kind: 'outage'; poolId: string };

/** A named, ordered collection of shocks. */
export interface StressScenario {
  name: string;
  description?: string;
  shocks: StressShock[];
}

/** Per-pool status after a scenario. */
export type PoolStressStatus =
  /** Ending liquidity is at or above the minimum buffer. */
  | 'HEALTHY'
  /** Ending liquidity is positive but below the minimum buffer. */
  | 'BUFFER_BREACHED'
  /** Ending liquidity is zero after withdrawals. */
  | 'DEPLETED'
  /** Pool was taken offline; its liquidity is stranded. */
  | 'OFFLINE';

/** Per-pool stress result. */
export interface PoolStressResult {
  poolId: string;
  asset: string;
  startingAvailable: string;
  /** Usable liquidity after all shocks (0 when offline or depleted). */
  endingAvailable: string;
  minimumBuffer: string;
  /** `endingAvailable - minimumBuffer`, clamped at zero. */
  remainingBuffer: string;
  /** Liquidity removed relative to the start (`start - ending`), never negative. */
  drained: string;
  status: PoolStressStatus;
}

/** Per-asset aggregate across its pools. */
export interface AssetStressResult {
  asset: string;
  startingAvailable: string;
  endingAvailable: string;
  /** Worst pool status observed for this asset. */
  status: PoolStressStatus;
}

/** Result of running one scenario against a set of pools. */
export interface StressScenarioResult {
  scenario: string;
  /** True when no pool is depleted, offline, or below its buffer. */
  survived: boolean;
  pools: PoolStressResult[];
  assets: AssetStressResult[];
  /** Pools that breached their buffer or worse — the alerts. */
  breaches: PoolStressResult[];
  evaluatedAt: number;
}

/** Result of running several scenarios against the same starting book. */
export interface StressSuiteResult {
  results: StressScenarioResult[];
  /** True only when every scenario survived. */
  allSurvived: boolean;
  /** Names of the scenarios that did not survive. */
  failedScenarios: string[];
  evaluatedAt: number;
}
