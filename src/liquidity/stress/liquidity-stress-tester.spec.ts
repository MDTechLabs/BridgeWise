/**
 * File: src/liquidity/stress/liquidity-stress-tester.spec.ts
 *
 * Unit tests for the liquidity stress tester and scenario library.
 */

import { LiquidityStressTester } from './liquidity-stress-tester';
import {
  bankRun,
  correlatedDrawdown,
  defaultScenarioSuite,
  demandSurge,
  massWithdrawal,
  providerOutage,
} from './liquidity-stress-scenarios';
import type { LiquidityPoolState } from './liquidity-stress.types';

const FIXED_NOW = 1_700_000_000_000;
const now = () => FIXED_NOW;

function pools(): LiquidityPoolState[] {
  return [
    { id: 'poolA', asset: 'USDC', available: '1000', minimumBuffer: '200' },
    { id: 'poolB', asset: 'USDC', available: '1000', minimumBuffer: '200' },
  ];
}

describe('LiquidityStressTester', () => {
  it('survives a moderate mass withdrawal that stays above the buffer', () => {
    const tester = new LiquidityStressTester({ now });
    const result = tester.run(pools(), massWithdrawal(50));

    expect(result.survived).toBe(true);
    expect(result.pools.map((p) => p.endingAvailable)).toEqual(['500', '500']);
    expect(result.pools.every((p) => p.status === 'HEALTHY')).toBe(true);
    expect(result.evaluatedAt).toBe(FIXED_NOW);
  });

  it('flags buffer breaches under a severe bank run', () => {
    const tester = new LiquidityStressTester({ now });
    const result = tester.run(pools(), bankRun(90));

    expect(result.survived).toBe(false);
    expect(result.breaches).toHaveLength(2);
    expect(result.pools.map((p) => p.status)).toEqual([
      'BUFFER_BREACHED',
      'BUFFER_BREACHED',
    ]);
    expect(result.pools[0].endingAvailable).toBe('100');
  });

  it('marks a pool OFFLINE and strands its liquidity on an outage', () => {
    const tester = new LiquidityStressTester({ now });
    const result = tester.run(pools(), providerOutage('poolA'));

    const poolA = result.pools.find((p) => p.poolId === 'poolA')!;
    expect(poolA.status).toBe('OFFLINE');
    expect(poolA.endingAvailable).toBe('0');
    expect(poolA.drained).toBe('1000');
    expect(result.survived).toBe(false);
  });

  it('distributes an absolute demand surge proportionally across pools', () => {
    const tester = new LiquidityStressTester({ now });
    const result = tester.run(pools(), demandSurge('USDC', '1500'));

    expect(result.pools.map((p) => p.endingAvailable)).toEqual(['250', '250']);
    expect(result.survived).toBe(true);
  });

  it('depletes pools when the withdrawal exceeds total liquidity', () => {
    const tester = new LiquidityStressTester({ now });
    const result = tester.run(pools(), demandSurge('USDC', '2500'));

    expect(result.pools.map((p) => p.status)).toEqual(['DEPLETED', 'DEPLETED']);
    expect(result.pools.map((p) => p.endingAvailable)).toEqual(['0', '0']);
  });

  it('models contagion: an outage followed by a flight from survivors', () => {
    const tester = new LiquidityStressTester({ now });
    const result = tester.run(pools(), correlatedDrawdown('poolA', 40));

    const poolA = result.pools.find((p) => p.poolId === 'poolA')!;
    const poolB = result.pools.find((p) => p.poolId === 'poolB')!;
    expect(poolA.status).toBe('OFFLINE');
    expect(poolB.endingAvailable).toBe('600'); // 1000 - 40%
    expect(poolB.status).toBe('HEALTHY');
  });

  it('aggregates outcomes per asset with the worst pool status', () => {
    const tester = new LiquidityStressTester({ now });
    const result = tester.run(pools(), bankRun(90));

    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]).toMatchObject({
      asset: 'USDC',
      startingAvailable: '2000',
      endingAvailable: '200',
      status: 'BUFFER_BREACHED',
    });
  });

  it('ignores malformed shocks rather than crashing', () => {
    const tester = new LiquidityStressTester({ now });
    const result = tester.run(pools(), {
      name: 'bad',
      shocks: [{ kind: 'withdrawalPct', percent: Number.NaN }],
    });

    expect(result.survived).toBe(true);
    expect(result.pools.map((p) => p.endingAvailable)).toEqual(['1000', '1000']);
  });

  it('handles fractional percentage shocks precisely', () => {
    const tester = new LiquidityStressTester({ now });
    const result = tester.run(
      [{ id: 'p', asset: 'USDC', available: '1000' }],
      massWithdrawal(12.5),
    );

    expect(result.pools[0].endingAvailable).toBe('875'); // 1000 - 12.5%
  });

  it('runs a suite and reports which scenarios failed', () => {
    const tester = new LiquidityStressTester({ now });
    const suite = tester.runSuite(pools(), defaultScenarioSuite());

    expect(suite.results).toHaveLength(3);
    expect(suite.allSurvived).toBe(false);
    expect(suite.failedScenarios).toEqual(['bank-run-90pct']);
  });
});
