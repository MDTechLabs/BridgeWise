/**
 * Quote Comparison Snapshots
 *
 * Implements point-in-time snapshot capture and comparative diffing for multi-provider
 * quotes in BridgeWise. Enables analyzing quote drift, price impact shift, fee deltas,
 * and best-provider transitions across snapshot intervals.
 */

import { NormalizedRoute, aggregateRoutes } from "../../../aggregation/providers/stellar/stellar-route-aggregator";

export interface QuoteComparisonQuery {
  sourceAsset: string;
  destAsset: string;
  inputAmount: string;
  network?: string;
}

export interface QuoteComparisonSnapshot {
  snapshotId: string;
  query: QuoteComparisonQuery;
  createdAt: number;
  quotes: NormalizedRoute[];
  bestQuote: NormalizedRoute | null;
  tags?: string[];
}

export interface QuoteComparisonDiff {
  snapshotAId: string;
  snapshotBId: string;
  timeDeltaMs: number;
  outputAmountDeltas: Record<string, number>;
  feeAmountDeltas: Record<string, number>;
  bestProviderShift: { from: string; to: string } | null;
  bestOutputDiff: number;
}

export class QuoteComparisonSnapshotStore {
  private snapshots: Map<string, QuoteComparisonSnapshot> = new Map();

  /**
   * Take and store a point-in-time snapshot of quotes for a given query.
   */
  takeSnapshot(
    query: QuoteComparisonQuery,
    quotes: NormalizedRoute[],
    tags: string[] = [],
  ): QuoteComparisonSnapshot {
    const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Sort quotes best-first if not already sorted
    const sortedQuotes = [...quotes].sort((a, b) => {
      const outDiff = Number(b.outputAmount) - Number(a.outputAmount);
      if (outDiff !== 0) return outDiff;
      const feeDiff = Number(a.feeAmount) - Number(b.feeAmount);
      if (feeDiff !== 0) return feeDiff;
      return a.hops - b.hops;
    });

    const snapshot: QuoteComparisonSnapshot = {
      snapshotId,
      query: { ...query },
      createdAt: Date.now(),
      quotes: sortedQuotes,
      bestQuote: sortedQuotes[0] ?? null,
      tags,
    };

    this.snapshots.set(snapshotId, snapshot);
    return snapshot;
  }

  /**
   * Retrieve a snapshot by ID.
   */
  getSnapshot(snapshotId: string): QuoteComparisonSnapshot | null {
    return this.snapshots.get(snapshotId) ?? null;
  }

  /**
   * Calculate diff between two comparison snapshots.
   */
  compareSnapshots(snapshotAId: string, snapshotBId: string): QuoteComparisonDiff | null {
    const snapA = this.snapshots.get(snapshotAId);
    const snapB = this.snapshots.get(snapshotBId);

    if (!snapA || !snapB) return null;

    const timeDeltaMs = snapB.createdAt - snapA.createdAt;
    const outputAmountDeltas: Record<string, number> = {};
    const feeAmountDeltas: Record<string, number> = {};

    const mapAByProvider = new Map(snapA.quotes.map((q) => [q.providerId, q]));
    const mapBByProvider = new Map(snapB.quotes.map((q) => [q.providerId, q]));

    const allProviders = new Set([...mapAByProvider.keys(), ...mapBByProvider.keys()]);

    for (const providerId of allProviders) {
      const qA = mapAByProvider.get(providerId);
      const qB = mapBByProvider.get(providerId);

      if (qA && qB) {
        outputAmountDeltas[providerId] = Number(qB.outputAmount) - Number(qA.outputAmount);
        feeAmountDeltas[providerId] = Number(qB.feeAmount) - Number(qA.feeAmount);
      }
    }

    const providerA = snapA.bestQuote?.providerId ?? "none";
    const providerB = snapB.bestQuote?.providerId ?? "none";

    const bestProviderShift =
      providerA !== providerB ? { from: providerA, to: providerB } : null;

    const bestOutputA = snapA.bestQuote ? Number(snapA.bestQuote.outputAmount) : 0;
    const bestOutputB = snapB.bestQuote ? Number(snapB.bestQuote.outputAmount) : 0;

    return {
      snapshotAId,
      snapshotBId,
      timeDeltaMs,
      outputAmountDeltas,
      feeAmountDeltas,
      bestProviderShift,
      bestOutputDiff: bestOutputB - bestOutputA,
    };
  }

  /**
   * Query snapshots by criteria.
   */
  findSnapshots(query: Partial<QuoteComparisonQuery>): QuoteComparisonSnapshot[] {
    const results: QuoteComparisonSnapshot[] = [];
    for (const snap of this.snapshots.values()) {
      if (query.sourceAsset && snap.query.sourceAsset.toLowerCase() !== query.sourceAsset.toLowerCase()) {
        continue;
      }
      if (query.destAsset && snap.query.destAsset.toLowerCase() !== query.destAsset.toLowerCase()) {
        continue;
      }
      if (query.network && snap.query.network?.toLowerCase() !== query.network.toLowerCase()) {
        continue;
      }
      results.push(snap);
    }
    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Purge snapshots older than maxAgeMs.
   */
  purgeOldSnapshots(maxAgeMs: number): number {
    const now = Date.now();
    let count = 0;
    for (const [id, snap] of this.snapshots.entries()) {
      if (now - snap.createdAt > maxAgeMs) {
        this.snapshots.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear store.
   */
  clear(): void {
    this.snapshots.clear();
  }

  get size(): number {
    return this.snapshots.size;
  }
}

export const quoteComparisonSnapshotStore = new QuoteComparisonSnapshotStore();
