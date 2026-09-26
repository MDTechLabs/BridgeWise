import { StellarAssetRiskRegistry } from './stellar-asset-risk-registry';
import { RegisterRiskInput, RiskLevel, RiskAssessment, RiskCategory } from './types';

const makeAssessment = (
  category: RiskCategory,
  level: RiskLevel,
  score: number,
): Omit<RiskAssessment, 'updatedAt'> => ({
  category,
  level,
  score,
  summary: `${category} risk is ${level}`,
});

const makeInput = (overrides: Partial<RegisterRiskInput> = {}): RegisterRiskInput => ({
  symbol: 'USDC',
  name: 'USD Coin',
  chain: 'stellar',
  address: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  assessments: [
    makeAssessment('volatility', 'low', 10),
    makeAssessment('liquidity', 'low', 15),
    makeAssessment('counterparty', 'medium', 35),
    makeAssessment('regulatory', 'low', 20),
  ],
  tags: ['stablecoin'],
  ...overrides,
});

describe('StellarAssetRiskRegistry', () => {
  let registry: StellarAssetRiskRegistry;

  beforeEach(() => {
    registry = new StellarAssetRiskRegistry();
  });

  // ─── Registration ──────────────────────────────────────────────────────

  it('registers an asset with risk information', () => {
    const entry = registry.registerAsset(makeInput());

    expect(entry.symbol).toBe('USDC');
    expect(entry.overallRisk).toBe('low');
    expect(entry.overallScore).toBe(20); // (10+15+35+20)/4 = 20
    expect(entry.assessments).toHaveLength(4);
    expect(entry.tags).toContain('stablecoin');
    expect(entry.version).toBe(1);
    expect(registry.size).toBe(1);
  });

  it('throws when registering duplicate asset', () => {
    registry.registerAsset(makeInput());
    expect(() => registry.registerAsset(makeInput())).toThrow(
      /already registered in the risk registry/,
    );
  });

  it('computes overall risk correctly for each level', () => {
    const low = registry.registerAsset(makeInput({
      symbol: 'LOW',
      assessments: [makeAssessment('volatility', 'low', 10)],
    }));
    expect(low.overallRisk).toBe('low');

    const medium = registry.registerAsset(makeInput({
      symbol: 'MED',
      assessments: [makeAssessment('volatility', 'high', 40)],
    }));
    expect(medium.overallRisk).toBe('medium');

    const high = registry.registerAsset(makeInput({
      symbol: 'HIGH',
      assessments: [makeAssessment('volatility', 'high', 60)],
    }));
    expect(high.overallRisk).toBe('high');

    const critical = registry.registerAsset(makeInput({
      symbol: 'CRIT',
      assessments: [makeAssessment('volatility', 'critical', 85)],
    }));
    expect(critical.overallRisk).toBe('critical');
  });

  // ─── Lookup ────────────────────────────────────────────────────────────

  it('looks up risk by symbol', () => {
    registry.registerAsset(makeInput());
    const risk = registry.getRisk('USDC');
    expect(risk).toBeDefined();
    expect(risk!.overallRisk).toBe('low');
  });

  it('returns undefined for unknown symbol', () => {
    expect(registry.getRisk('UNKNOWN')).toBeUndefined();
  });

  it('throws when using getRiskOrThrow for unknown', () => {
    expect(() => registry.getRiskOrThrow('UNKNOWN')).toThrow(
      /not registered in the risk registry/,
    );
  });

  it('filters by risk level', () => {
    registry.registerAsset(makeInput({ symbol: 'LOW' }));
    registry.registerAsset(makeInput({ symbol: 'HIGH', assessments: [makeAssessment('volatility', 'high', 60)] }));

    const lowRisk = registry.getByRiskLevel('low');
    expect(lowRisk).toHaveLength(1);
    expect(lowRisk[0].symbol).toBe('LOW');
  });

  it('filters by minimum risk level', () => {
    registry.registerAsset(makeInput({ symbol: 'LOW' }));
    registry.registerAsset(makeInput({ symbol: 'MED', assessments: [makeAssessment('volatility', 'high', 40)] }));
    registry.registerAsset(makeInput({ symbol: 'HIGH', assessments: [makeAssessment('volatility', 'high', 60)] }));

    const mediumPlus = registry.getByMinRiskLevel('medium');
    expect(mediumPlus).toHaveLength(2); // MEDIUM and HIGH
  });

  it('filters by chain', () => {
    registry.registerAsset(makeInput({ symbol: 'S1', chain: 'stellar' }));
    registry.registerAsset(makeInput({ symbol: 'E1', chain: 'ethereum' }));

    expect(registry.getByChain('stellar')).toHaveLength(1);
    expect(registry.getByChain('ethereum')).toHaveLength(1);
  });

  it('advanced query with multiple filters', () => {
    registry.registerAsset(makeInput({ symbol: 'S1', chain: 'stellar' }));
    registry.registerAsset(makeInput({
      symbol: 'S2',
      chain: 'stellar',
      assessments: [makeAssessment('volatility', 'high', 60)],
    }));

    const results = registry.query({ chain: 'stellar', minRiskLevel: 'medium' });
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('S2');
  });

  // ─── Update ────────────────────────────────────────────────────────────

  it('updates risk for an existing asset', () => {
    registry.registerAsset(makeInput());
    const updated = registry.updateRisk('USDC', {
      assessments: [makeAssessment('volatility', 'high', 65)],
      changeReason: 'Market volatility increased',
    });

    expect(updated.overallRisk).not.toBe('low');
    expect(updated.version).toBe(2);
    expect(updated.assessments).toHaveLength(4); // existing 3 + updated 1
  });

  it('throws when updating unknown asset', () => {
    expect(() =>
      registry.updateRisk('UNKNOWN', {
        changeReason: 'test',
        assessments: [makeAssessment('volatility', 'low', 10)],
      }),
    ).toThrow(/not registered/);
  });

  // ─── Risk History ──────────────────────────────────────────────────────

  it('tracks risk history on registration', () => {
    registry.registerAsset(makeInput());
    const history = registry.getRiskHistory('USDC');
    expect(history).toHaveLength(1);
    expect(history[0].reason).toBe('Initial registration');
    expect(history[0].version).toBe(1);
  });

  it('records risk history on updates', () => {
    registry.registerAsset(makeInput());
    registry.updateRisk('USDC', {
      assessments: [makeAssessment('volatility', 'high', 60)],
      changeReason: 'Volatility spike',
    });

    const history = registry.getRiskHistory('USDC');
    expect(history).toHaveLength(2);
    expect(history[1].reason).toBe('Volatility spike');
    expect(history[1].version).toBe(2);
    expect(history[1].changedCategories).toContain('volatility');
  });

  it('returns empty history for unknown asset', () => {
    expect(registry.getRiskHistory('UNKNOWN')).toEqual([]);
  });

  // ─── Stats ─────────────────────────────────────────────────────────────

  it('reports stats correctly', () => {
    registry.registerAsset(makeInput({ symbol: 'LOW' }));
    registry.registerAsset(makeInput({
      symbol: 'HIGH',
      assessments: [makeAssessment('volatility', 'high', 65), makeAssessment('liquidity', 'medium', 45)],
    }));

    const stats = registry.stats();
    expect(stats.totalAssets).toBe(2);
    expect(stats.byRiskLevel.low).toBe(1);
    expect(stats.byRiskLevel.high).toBe(1);
    expect(stats.byChain.stellar).toBe(2);
    expect(stats.totalHistoryEntries).toBe(2);
    expect(stats.riskiestAssets).toHaveLength(2);
    expect(stats.riskiestAssets[0].symbol).toBe('HIGH');
    expect(stats.averageOverallScore).toBeGreaterThan(0);
  });

  // ─── Removal ───────────────────────────────────────────────────────────

  it('removes an asset and its history', () => {
    registry.registerAsset(makeInput());
    expect(registry.removeAsset('USDC')).toBe(true);
    expect(registry.size).toBe(0);
    expect(registry.getRiskHistory('USDC')).toEqual([]);
  });

  it('returns false when removing unknown asset', () => {
    expect(registry.removeAsset('UNKNOWN')).toBe(false);
  });

  // ─── Edge cases ────────────────────────────────────────────────────────

  it('case-insensitive symbol lookups', () => {
    registry.registerAsset(makeInput());
    expect(registry.getRisk('usdc')).toBeDefined();
    expect(registry.isRegistered('UsDc')).toBe(true);
  });

  it('handles zero assessments gracefully', () => {
    const entry = registry.registerAsset(makeInput({ assessments: [] }));
    expect(entry.overallScore).toBe(0);
    expect(entry.overallRisk).toBe('low');
  });

  it('tags are stored correctly', () => {
    registry.registerAsset(makeInput({ tags: ['stablecoin', 'verified'] }));
    const byTag = registry.getByTag('verified');
    expect(byTag).toHaveLength(1);
    expect(byTag[0].symbol).toBe('USDC');
  });
});
