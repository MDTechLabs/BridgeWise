/**
 * File: src/liquidity/stress/liquidity-stress-scenarios.ts
 *
 * A library of ready-made liquidity stress scenarios.
 *
 * These builders return {@link StressScenario} objects that can be run through
 * the {@link LiquidityStressTester}. They encode the shocks a bridge treasury
 * is most exposed to, so callers get realistic worst cases out of the box while
 * remaining free to compose their own.
 */

import type { StressScenario, StressShock } from './liquidity-stress.types';

/** A sudden withdrawal of `percent`% of every pool's liquidity (a mass exit). */
export function massWithdrawal(percent = 50, asset?: string): StressScenario {
  const shock: StressShock = { kind: 'withdrawalPct', percent, ...(asset ? { asset } : {}) };
  return {
    name: `mass-withdrawal-${percent}pct${asset ? `-${asset}` : ''}`,
    description: `Withdraw ${percent}% of available liquidity${asset ? ` for ${asset}` : ' across all pools'}.`,
    shocks: [shock],
  };
}

/** A severe "bank run": almost all liquidity leaves at once. */
export function bankRun(percent = 90, asset?: string): StressScenario {
  return {
    name: `bank-run-${percent}pct${asset ? `-${asset}` : ''}`,
    description: `Bank-run drawdown of ${percent}% of available liquidity.`,
    shocks: [{ kind: 'withdrawalPct', percent, ...(asset ? { asset } : {}) }],
  };
}

/** A single provider/pool goes offline and its liquidity is stranded. */
export function providerOutage(poolId: string): StressScenario {
  return {
    name: `provider-outage-${poolId}`,
    description: `Provider ${poolId} goes offline; its liquidity becomes unusable.`,
    shocks: [{ kind: 'outage', poolId }],
  };
}

/** A concentrated demand surge draining an absolute amount of one asset. */
export function demandSurge(asset: string, amount: string): StressScenario {
  return {
    name: `demand-surge-${asset}-${amount}`,
    description: `Sudden demand withdraws ${amount} ${asset} across its pools.`,
    shocks: [{ kind: 'withdrawal', asset, amount }],
  };
}

/**
 * A correlated drawdown: an outage on one provider immediately followed by a
 * flight of `percent`% from the remaining pools (contagion).
 */
export function correlatedDrawdown(offlinePoolId: string, percent = 40): StressScenario {
  return {
    name: `correlated-drawdown-${offlinePoolId}-${percent}pct`,
    description: `${offlinePoolId} fails, then ${percent}% flees the surviving pools.`,
    shocks: [
      { kind: 'outage', poolId: offlinePoolId },
      { kind: 'withdrawalPct', percent },
    ],
  };
}

/** The default battery of scenarios for a book of pools of a given asset. */
export function defaultScenarioSuite(asset?: string): StressScenario[] {
  return [
    massWithdrawal(50, asset),
    bankRun(90, asset),
    massWithdrawal(25, asset),
  ];
}

/** Convenience namespace mirroring how callers usually reach for these. */
export const LiquidityStressScenarios = {
  massWithdrawal,
  bankRun,
  providerOutage,
  demandSurge,
  correlatedDrawdown,
  defaultScenarioSuite,
};
