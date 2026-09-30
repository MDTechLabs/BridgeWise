/**
 * File: src/liquidity/stress/liquidity-stress-tester.ts
 *
 * Liquidity stress tester.
 *
 * Replays a scenario's shocks against a snapshot of liquidity pools and reports
 * per-pool and per-asset outcomes, whether the book survived, and which pools
 * breached their minimum buffer. Pure and deterministic so it is trivial to
 * unit test and to run as a CI guardrail against reserve sizing.
 *
 * Semantics of a shock's targeting:
 *   - `poolId` set  → the shock hits that pool only.
 *   - `asset` set    → the shock is spread across pools of that asset.
 *   - neither set    → the shock is spread across every pool.
 * Absolute withdrawals/inflows are distributed proportionally to each pool's
 * available liquidity (equal split when every target is empty); percentage
 * shocks apply to each targeted pool independently.
 */

import {
  addAmounts,
  coerceAmount,
  compareAmounts,
  percentOf,
  proportion,
  subtractClampedAmounts,
} from './decimal';
import type {
  AssetStressResult,
  LiquidityPoolState,
  PoolStressResult,
  PoolStressStatus,
  StressScenario,
  StressScenarioResult,
  StressShock,
  StressSuiteResult,
} from './liquidity-stress.types';

interface WorkingPool {
  id: string;
  asset: string;
  assetKey: string;
  starting: string;
  available: string;
  minimumBuffer: string;
  offline: boolean;
}

const STATUS_SEVERITY: Record<PoolStressStatus, number> = {
  HEALTHY: 0,
  BUFFER_BREACHED: 1,
  DEPLETED: 2,
  OFFLINE: 3,
};

export class LiquidityStressTester {
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  /** Run a single scenario against a snapshot of pools. */
  run(pools: LiquidityPoolState[], scenario: StressScenario): StressScenarioResult {
    const working = pools.map((pool) => this.toWorkingPool(pool));

    for (const shock of scenario.shocks ?? []) {
      this.applyShock(working, shock);
    }

    const poolResults = working.map((pool) => this.toPoolResult(pool));
    const assets = this.aggregateByAsset(poolResults, working);
    const breaches = poolResults.filter((p) => p.status !== 'HEALTHY');

    return {
      scenario: scenario.name,
      survived: breaches.length === 0,
      pools: poolResults,
      assets,
      breaches,
      evaluatedAt: this.now(),
    };
  }

  /** Run several scenarios, each against a fresh copy of the starting book. */
  runSuite(
    pools: LiquidityPoolState[],
    scenarios: StressScenario[],
  ): StressSuiteResult {
    const results = scenarios.map((scenario) => this.run(pools, scenario));
    const failedScenarios = results.filter((r) => !r.survived).map((r) => r.scenario);
    return {
      results,
      allSurvived: failedScenarios.length === 0,
      failedScenarios,
      evaluatedAt: this.now(),
    };
  }

  // ─── Shock application ─────────────────────────────────────────────────────

  private applyShock(pools: WorkingPool[], shock: StressShock): void {
    switch (shock.kind) {
      case 'outage': {
        const target = pools.find((p) => p.id === shock.poolId);
        if (target) {
          target.offline = true;
          target.available = '0';
        }
        return;
      }
      case 'withdrawalPct':
      case 'inflow' /* pct handled below only for withdrawalPct */:
      case 'withdrawal': {
        const targets = this.resolveTargets(pools, shock);
        if (targets.length === 0) return;

        if (shock.kind === 'withdrawalPct') {
          const percent = coerceAmount(shock.percent);
          if (percent === null) return;
          for (const pool of targets) {
            const drain = percentOf(pool.available, percent);
            pool.available = subtractClampedAmounts(pool.available, drain);
          }
          return;
        }

        const amount = coerceAmount(shock.amount);
        if (amount === null) return;
        const op = shock.kind === 'inflow' ? 'add' : 'sub';
        this.distribute(targets, amount, op);
        return;
      }
    }
  }

  /** Pools a shock applies to, honoring poolId / asset / all targeting. */
  private resolveTargets(pools: WorkingPool[], shock: StressShock): WorkingPool[] {
    if ('poolId' in shock && shock.poolId) {
      return pools.filter((p) => p.id === shock.poolId && !p.offline);
    }
    if ('asset' in shock && shock.asset) {
      const key = normalizeAsset(shock.asset);
      return pools.filter((p) => p.assetKey === key && !p.offline);
    }
    return pools.filter((p) => !p.offline);
  }

  /**
   * Distribute an absolute amount across targets, weighting by each pool's
   * available liquidity (equal split when all targets are empty). The remainder
   * lands on the last target so the total moved equals `amount` exactly.
   */
  private distribute(targets: WorkingPool[], amount: string, op: 'add' | 'sub'): void {
    if (targets.length === 1) {
      this.applyDelta(targets[0], amount, op);
      return;
    }

    const totalAvailable = targets.reduce((sum, p) => addAmounts(sum, p.available), '0');
    const useEqual = compareAmounts(totalAvailable, '0') === 0;

    let distributed = '0';
    for (let i = 0; i < targets.length - 1; i++) {
      const share = useEqual
        ? proportion(amount, '1', String(targets.length))
        : proportion(amount, targets[i].available, totalAvailable);
      this.applyDelta(targets[i], share, op);
      distributed = addAmounts(distributed, share);
    }

    // Last target absorbs the rounding remainder.
    const remainder = subtractClampedAmounts(amount, distributed);
    this.applyDelta(targets[targets.length - 1], remainder, op);
  }

  private applyDelta(pool: WorkingPool, delta: string, op: 'add' | 'sub'): void {
    pool.available =
      op === 'add'
        ? addAmounts(pool.available, delta)
        : subtractClampedAmounts(pool.available, delta);
  }

  // ─── Result building ───────────────────────────────────────────────────────

  private toWorkingPool(pool: LiquidityPoolState): WorkingPool {
    const available = coerceAmount(pool.available) ?? '0';
    const minimumBuffer = coerceAmount(pool.minimumBuffer ?? '0') ?? '0';
    return {
      id: pool.id,
      asset: pool.asset,
      assetKey: normalizeAsset(pool.asset),
      starting: available,
      available,
      minimumBuffer,
      offline: false,
    };
  }

  private toPoolResult(pool: WorkingPool): PoolStressResult {
    const ending = pool.available;
    const drained = subtractClampedAmounts(pool.starting, ending);
    const remainingBuffer = subtractClampedAmounts(ending, pool.minimumBuffer);

    let status: PoolStressStatus;
    if (pool.offline) {
      status = 'OFFLINE';
    } else if (compareAmounts(ending, '0') === 0) {
      status = 'DEPLETED';
    } else if (compareAmounts(ending, pool.minimumBuffer) < 0) {
      status = 'BUFFER_BREACHED';
    } else {
      status = 'HEALTHY';
    }

    return {
      poolId: pool.id,
      asset: pool.asset,
      startingAvailable: pool.starting,
      endingAvailable: ending,
      minimumBuffer: pool.minimumBuffer,
      remainingBuffer,
      drained,
      status,
    };
  }

  private aggregateByAsset(
    results: PoolStressResult[],
    working: WorkingPool[],
  ): AssetStressResult[] {
    const keyByPoolId = new Map(working.map((p) => [p.id, p.assetKey]));
    const groups = new Map<string, AssetStressResult>();

    results.forEach((result) => {
      const key = keyByPoolId.get(result.poolId) ?? normalizeAsset(result.asset);
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          asset: result.asset,
          startingAvailable: result.startingAvailable,
          endingAvailable: result.endingAvailable,
          status: result.status,
        });
        return;
      }
      existing.startingAvailable = addAmounts(existing.startingAvailable, result.startingAvailable);
      existing.endingAvailable = addAmounts(existing.endingAvailable, result.endingAvailable);
      if (STATUS_SEVERITY[result.status] > STATUS_SEVERITY[existing.status]) {
        existing.status = result.status;
      }
    });

    return [...groups.values()];
  }
}

/** Normalize an asset symbol for grouping (trim + upper-case). */
function normalizeAsset(asset: string): string {
  return String(asset ?? '').trim().toUpperCase();
}
