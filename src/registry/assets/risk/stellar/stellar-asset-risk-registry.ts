import {
  RiskLevel,
  RiskCategory,
  RiskAssessment,
  AssetRiskEntry,
  RiskHistoryEntry,
  RegisterRiskInput,
  UpdateRiskInput,
  RiskQuery,
  RiskRegistryStats,
  RISK_LEVEL_ORDER,
} from './types';

/**
 * Stores and manages asset risk metadata in a central registry.
 *
 * Provides risk lookups, history tracking, and filtering by risk level,
 * category, chain, and tags. Risk history is preserved for audit trails.
 *
 * Usage:
 *   const registry = new StellarAssetRiskRegistry();
 *   registry.registerAsset({ symbol: 'USDC', name: 'USD Coin', chain: 'stellar', assessments: [...] });
 *   const risk = registry.getRisk('USDC');
 *   const risky = registry.getByRiskLevel('high');
 */
export class StellarAssetRiskRegistry {
  private readonly assets: Map<string, AssetRiskEntry> = new Map();
  private readonly history: Map<string, RiskHistoryEntry[]> = new Map();
  private historyIdCounter = 0;

  // ─── Registration ──────────────────────────────────────────────────────

  /**
   * Register a new asset with risk information.
   *
   * @throws Error if the asset is already registered.
   */
  registerAsset(input: RegisterRiskInput): AssetRiskEntry {
    const symbol = input.symbol.toUpperCase();

    if (this.assets.has(symbol)) {
      throw new Error(`Asset "${symbol}" is already registered in the risk registry`);
    }

    const now = new Date().toISOString();
    const timestamped = input.assessments.map((a) => ({
      ...a,
      updatedAt: now,
    }));

    const overallScore = this.computeOverallScore(timestamped);
    const overallRisk = this.computeOverallRisk(overallScore);

    const entry: AssetRiskEntry = {
      symbol,
      name: input.name,
      chain: input.chain,
      address: input.address,
      overallRisk,
      overallScore,
      assessments: timestamped,
      tags: input.tags ?? [],
      registeredAt: now,
      updatedAt: now,
      version: 1,
    };

    this.assets.set(symbol, entry);

    this.recordHistory(symbol, overallRisk, overallScore, [], 'Initial registration', 1);

    return entry;
  }

  /**
   * Update an existing asset's risk information.
   *
   * @throws Error if the asset is not registered.
   */
  updateRisk(symbol: string, input: UpdateRiskInput): AssetRiskEntry {
    const existing = this.getOrThrow(symbol);
    const now = new Date().toISOString();

    let newAssessments: RiskAssessment[] = existing.assessments;

    if (input.assessments) {
      // Merge assessments: replace matching categories, keep others
      const assessmentMap = new Map<RiskCategory, RiskAssessment>();
      for (const a of existing.assessments) {
        assessmentMap.set(a.category, a);
      }
      for (const a of input.assessments) {
        assessmentMap.set(a.category, { ...a, updatedAt: now });
      }
      newAssessments = Array.from(assessmentMap.values());
    }

    const overallScore = this.computeOverallScore(newAssessments);
    const overallRisk = this.computeOverallRisk(overallScore);
    const newVersion = existing.version + 1;

    const changedCategories = input.assessments
      ? input.assessments.map((a) => a.category)
      : [];

    const updated: AssetRiskEntry = {
      ...existing,
      name: input.name ?? existing.name,
      address: input.address ?? existing.address,
      overallRisk,
      overallScore,
      assessments: newAssessments,
      tags: input.tags ?? existing.tags,
      updatedAt: now,
      version: newVersion,
    };

    this.assets.set(symbol, updated);

    this.recordHistory(
      symbol,
      overallRisk,
      overallScore,
      changedCategories,
      input.changeReason,
      newVersion,
    );

    return updated;
  }

  // ─── Lookup ────────────────────────────────────────────────────────────

  /**
   * Get risk information for an asset. Returns undefined if not registered.
   */
  getRisk(symbol: string): AssetRiskEntry | undefined {
    return this.assets.get(symbol.toUpperCase());
  }

  /**
   * Get risk information or throw if not registered.
   */
  getRiskOrThrow(symbol: string): AssetRiskEntry {
    const entry = this.getRisk(symbol);
    if (!entry) {
      throw new Error(`Asset "${symbol.toUpperCase()}" is not registered in the risk registry`);
    }
    return entry;
  }

  /**
   * Get assets filtered by risk level.
   */
  getByRiskLevel(level: RiskLevel): AssetRiskEntry[] {
    return Array.from(this.assets.values()).filter(
      (a) => a.overallRisk === level,
    );
  }

  /**
   * Get assets at or above a minimum risk level.
   */
  getByMinRiskLevel(level: RiskLevel): AssetRiskEntry[] {
    const threshold = RISK_LEVEL_ORDER[level];
    return Array.from(this.assets.values()).filter(
      (a) => RISK_LEVEL_ORDER[a.overallRisk] >= threshold,
    );
  }

  /**
   * Get assets by chain.
   */
  getByChain(chain: string): AssetRiskEntry[] {
    return Array.from(this.assets.values()).filter(
      (a) => a.chain === chain,
    );
  }

  /**
   * Get assets that have a specific risk category assessed.
   */
  getByCategory(category: RiskCategory): AssetRiskEntry[] {
    return Array.from(this.assets.values()).filter(
      (a) => a.assessments.some((assess) => assess.category === category),
    );
  }

  /**
   * Get assets matching a specific tag.
   */
  getByTag(tag: string): AssetRiskEntry[] {
    return Array.from(this.assets.values()).filter(
      (a) => a.tags.includes(tag),
    );
  }

  /**
   * Advanced query for risk lookups.
   */
  query(query: RiskQuery): AssetRiskEntry[] {
    let results = Array.from(this.assets.values());

    if (query.riskLevel) {
      results = results.filter((a) => a.overallRisk === query.riskLevel);
    }
    if (query.minRiskLevel) {
      const threshold = RISK_LEVEL_ORDER[query.minRiskLevel];
      results = results.filter((a) => RISK_LEVEL_ORDER[a.overallRisk] >= threshold);
    }
    if (query.chain) {
      results = results.filter((a) => a.chain === query.chain);
    }
    if (query.category) {
      results = results.filter((a) =>
        a.assessments.some((assess) => assess.category === query.category),
      );
    }
    if (query.tag) {
      results = results.filter((a) => a.tags.includes(query.tag));
    }
    if (query.maxScore !== undefined) {
      results = results.filter((a) => a.overallScore <= query.maxScore!);
    }

    return results;
  }

  // ─── Risk History ──────────────────────────────────────────────────────

  /**
   * Get the full risk history for an asset.
   */
  getRiskHistory(symbol: string): RiskHistoryEntry[] {
    return this.history.get(symbol.toUpperCase()) ?? [];
  }

  /**
   * Get the latest risk history entry for an asset.
   */
  getLatestRiskChange(symbol: string): RiskHistoryEntry | undefined {
    const entries = this.getRiskHistory(symbol);
    return entries.length > 0 ? entries[entries.length - 1] : undefined;
  }

  // ─── Introspection ─────────────────────────────────────────────────────

  /**
   * Get all registered assets.
   */
  getAllAssets(): AssetRiskEntry[] {
    return Array.from(this.assets.values());
  }

  /**
   * Check if an asset is registered.
   */
  isRegistered(symbol: string): boolean {
    return this.assets.has(symbol.toUpperCase());
  }

  /**
   * Remove an asset and its history from the registry.
   * Returns true if the asset was found and removed.
   */
  removeAsset(symbol: string): boolean {
    const upper = symbol.toUpperCase();
    this.history.delete(upper);
    return this.assets.delete(upper);
  }

  /**
   * Get comprehensive statistics about the registry.
   */
  stats(): RiskRegistryStats {
    const entries = this.getAllAssets();
    const byRiskLevel: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    const byChain: Record<string, number> = {};
    const byCategory: Record<RiskCategory, number> = {
      volatility: 0,
      liquidity: 0,
      counterparty: 0,
      regulatory: 0,
      technical: 0,
      market: 0,
      custodial: 0,
    };

    let totalScore = 0;

    for (const entry of entries) {
      byRiskLevel[entry.overallRisk]++;
      byChain[entry.chain] = (byChain[entry.chain] || 0) + 1;
      for (const assessment of entry.assessments) {
        byCategory[assessment.category]++;
      }
      totalScore += entry.overallScore;
    }

    const sortedByScore = [...entries].sort((a, b) => b.overallScore - a.overallScore);
    const riskiest = sortedByScore.slice(0, 5).map((e) => ({ symbol: e.symbol, score: e.overallScore }));
    const safest = [...sortedByScore].reverse().slice(0, 5).map((e) => ({ symbol: e.symbol, score: e.overallScore }));

    let totalHistoryEntries = 0;
    for (const entries of this.history.values()) {
      totalHistoryEntries += entries.length;
    }

    return {
      totalAssets: entries.length,
      byRiskLevel,
      byChain,
      byCategory,
      averageOverallScore: entries.length > 0 ? totalScore / entries.length : 0,
      riskiestAssets: riskiest,
      safestAssets: safest,
      totalHistoryEntries,
    };
  }

  /** Number of registered assets. */
  get size(): number {
    return this.assets.size;
  }

  // ─── Private ───────────────────────────────────────────────────────────

  private recordHistory(
    symbol: string,
    riskLevel: RiskLevel,
    riskScore: number,
    changedCategories: RiskCategory[],
    reason: string,
    version: number,
  ): void {
    const entry: RiskHistoryEntry = {
      id: `risk-history-${++this.historyIdCounter}`,
      symbol,
      riskLevel,
      riskScore,
      changedCategories,
      reason,
      timestamp: new Date().toISOString(),
      version,
    };

    const existing = this.history.get(symbol) ?? [];
    existing.push(entry);
    this.history.set(symbol, existing);
  }

  private computeOverallScore(assessments: RiskAssessment[]): number {
    if (assessments.length === 0) return 0;
    const sum = assessments.reduce((acc, a) => acc + a.score, 0);
    return Math.round(sum / assessments.length);
  }

  private computeOverallRisk(score: number): RiskLevel {
    if (score <= 20) return 'low';
    if (score <= 50) return 'medium';
    if (score <= 75) return 'high';
    return 'critical';
  }

  private getOrThrow(symbol: string): AssetRiskEntry {
    const entry = this.getRisk(symbol);
    if (!entry) {
      throw new Error(`Asset "${symbol.toUpperCase()}" is not registered in the risk registry`);
    }
    return entry;
  }
}
