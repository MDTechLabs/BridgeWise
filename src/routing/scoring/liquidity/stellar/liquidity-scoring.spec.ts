import {
  calculateLiquidityCoverage,
  calculateLiquidityScore,
} from './liquidity-scoring';

describe('Stellar route liquidity scoring', () => {
  it('calculates liquidity coverage correctly', () => {
    expect(calculateLiquidityCoverage(1000, 500)).toBe(2);
    expect(calculateLiquidityCoverage(250, 500)).toBe(0.5);
    expect(calculateLiquidityCoverage(0, 500)).toBe(0);
    expect(calculateLiquidityCoverage(500, 0)).toBe(1);
  });

  it('penalizes low-liquidity routes', () => {
    const score = calculateLiquidityScore({ availableLiquidity: 100, requiredLiquidity: 500 });

    expect(score.coverage).toBe(0.2);
    expect(score.status).toBe('critical');
    expect(score.score).toBeLessThan(1);
    expect(score.penalty).toBeGreaterThan(0);
  });

  it('keeps healthy routes near full score', () => {
    const score = calculateLiquidityScore({ availableLiquidity: 1000, requiredLiquidity: 500 });

    expect(score.status).toBe('healthy');
    expect(score.score).toBeCloseTo(1, 5);
  });
});
