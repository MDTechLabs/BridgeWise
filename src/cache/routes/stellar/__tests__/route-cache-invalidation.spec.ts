import { RouteCacheStore, RouteQuery, RouteResponse } from "../routeCache";

describe("RouteCacheStore Invalidation Enhancements", () => {
  let cache: RouteCacheStore;

  const sampleQuery1: RouteQuery = {
    fromAsset: "XLM",
    toAsset: "USDC",
    fromNetwork: "stellar",
    toNetwork: "ethereum",
  };

  const sampleResponse1: RouteResponse = {
    path: ["XLM", "USDC"],
    estimatedFee: 0.1,
    estimatedTimeMs: 5000,
    bridgeId: "bridge-1",
  };

  const sampleQuery2: RouteQuery = {
    fromAsset: "USDC",
    toAsset: "EURC",
    fromNetwork: "stellar",
    toNetwork: "stellar",
  };

  const sampleResponse2: RouteResponse = {
    path: ["USDC", "AQUA", "EURC"],
    estimatedFee: 0.05,
    estimatedTimeMs: 2000,
    bridgeId: "bridge-2",
  };

  beforeEach(() => {
    cache = new RouteCacheStore();
    cache.set(sampleQuery1, sampleResponse1, 60_000, ["fast", "stellar-eth"]);
    cache.set(sampleQuery2, sampleResponse2, 60_000, ["cheap", "stellar-local"]);
  });

  it("invalidates entries by asset pair", () => {
    expect(cache.size).toBe(2);
    const count = cache.invalidateByAssetPair("XLM", "USDC");
    expect(count).toBe(1);
    expect(cache.has(sampleQuery1)).toBe(false);
    expect(cache.has(sampleQuery2)).toBe(true);
  });

  it("invalidates entries touching an asset as source, dest, or path", () => {
    // USDC is in sampleQuery1 (toAsset), sampleQuery2 (fromAsset), and path of both
    const count = cache.invalidateByAsset("USDC");
    expect(count).toBe(2);
    expect(cache.size).toBe(0);
  });

  it("invalidates entries by network", () => {
    const count = cache.invalidateByNetwork("ethereum");
    expect(count).toBe(1);
    expect(cache.has(sampleQuery1)).toBe(false);
    expect(cache.has(sampleQuery2)).toBe(true);
  });

  it("invalidates entries by tag", () => {
    const count = cache.invalidateByTag("fast");
    expect(count).toBe(1);
    expect(cache.has(sampleQuery1)).toBe(false);
    expect(cache.has(sampleQuery2)).toBe(true);
  });

  it("invalidates entries by predicate", () => {
    const count = cache.invalidateByPredicate(
      (_key, entry) => entry.data.estimatedFee < 0.08,
    );
    expect(count).toBe(1); // sampleQuery2 fee is 0.05
    expect(cache.has(sampleQuery2)).toBe(false);
    expect(cache.has(sampleQuery1)).toBe(true);
  });

  it("notifies invalidation listeners with reason", () => {
    const listener = jest.fn();
    cache.onInvalidation(listener);

    cache.invalidateByBridge("bridge-1");

    expect(listener).toHaveBeenCalledWith(
      "xlm:usdc:stellar:ethereum:any",
      "bridge",
    );
  });
});
