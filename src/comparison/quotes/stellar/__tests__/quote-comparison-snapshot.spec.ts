import {
  QuoteComparisonSnapshotStore,
  QuoteComparisonQuery,
} from "../quote-comparison-snapshot";
import { NormalizedRoute } from "../../../aggregation/providers/stellar/stellar-route-aggregator";

describe("QuoteComparisonSnapshotStore", () => {
  let store: QuoteComparisonSnapshotStore;
  const sampleQuery: QuoteComparisonQuery = {
    sourceAsset: "XLM",
    destAsset: "USDC",
    inputAmount: "1000",
    network: "stellar-mainnet",
  };

  const sampleQuotes: NormalizedRoute[] = [
    {
      providerId: "provider-a",
      sourceAsset: "XLM",
      destAsset: "USDC",
      inputAmount: "1000",
      outputAmount: "950",
      feeAmount: "2",
      hops: 1,
    },
    {
      providerId: "provider-b",
      sourceAsset: "XLM",
      destAsset: "USDC",
      inputAmount: "1000",
      outputAmount: "940",
      feeAmount: "1",
      hops: 2,
    },
  ];

  beforeEach(() => {
    store = new QuoteComparisonSnapshotStore();
  });

  it("takes and retrieves a quote comparison snapshot", () => {
    const snap = store.takeSnapshot(sampleQuery, sampleQuotes, ["test-tag"]);
    expect(snap.snapshotId).toBeDefined();
    expect(snap.quotes).toHaveLength(2);
    expect(snap.bestQuote?.providerId).toBe("provider-a");
    expect(snap.tags).toContain("test-tag");

    const retrieved = store.getSnapshot(snap.snapshotId);
    expect(retrieved).toEqual(snap);
  });

  it("compares two snapshots and detects provider shifts and output deltas", () => {
    const snapA = store.takeSnapshot(sampleQuery, sampleQuotes);

    // Later snapshot where provider-b improves output and becomes best
    const updatedQuotes: NormalizedRoute[] = [
      {
        providerId: "provider-a",
        sourceAsset: "XLM",
        destAsset: "USDC",
        inputAmount: "1000",
        outputAmount: "948",
        feeAmount: "2",
        hops: 1,
      },
      {
        providerId: "provider-b",
        sourceAsset: "XLM",
        destAsset: "USDC",
        inputAmount: "1000",
        outputAmount: "960",
        feeAmount: "1",
        hops: 2,
      },
    ];

    const snapB = store.takeSnapshot(sampleQuery, updatedQuotes);

    const diff = store.compareSnapshots(snapA.snapshotId, snapB.snapshotId);
    expect(diff).not.toBeNull();
    expect(diff?.bestProviderShift).toEqual({ from: "provider-a", to: "provider-b" });
    expect(diff?.outputAmountDeltas["provider-a"]).toBe(-2);
    expect(diff?.outputAmountDeltas["provider-b"]).toBe(20);
    expect(diff?.bestOutputDiff).toBe(10); // 960 - 950
  });

  it("finds snapshots by query criteria", () => {
    store.takeSnapshot(sampleQuery, sampleQuotes);
    store.takeSnapshot(
      { sourceAsset: "ETH", destAsset: "USDC", inputAmount: "1" },
      [],
    );

    const xlmSnaps = store.findSnapshots({ sourceAsset: "XLM" });
    expect(xlmSnaps).toHaveLength(1);
    expect(xlmSnaps[0].query.sourceAsset).toBe("XLM");
  });

  it("purges old snapshots based on maxAgeMs", async () => {
    const snap = store.takeSnapshot(sampleQuery, sampleQuotes);
    expect(store.size).toBe(1);

    // Wait short delay or purge with 0 maxAge
    const purged = store.purgeOldSnapshots(-1);
    expect(purged).toBe(1);
    expect(store.size).toBe(0);
  });
});
