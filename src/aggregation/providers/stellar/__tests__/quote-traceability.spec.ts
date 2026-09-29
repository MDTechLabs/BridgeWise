import {
  createQuoteTrace,
  formatTraceSummary,
} from "../quote-traceability";
import { normalizeProviderResponse } from "../stellar-route-aggregator";

describe("Quote Source Traceability", () => {
  describe("createQuoteTrace", () => {
    it("creates a trace with valid defaults", () => {
      const trace = createQuoteTrace("stellar-dex");

      expect(trace.providerId).toBe("stellar-dex");
      expect(trace.traceId).toContain("trc_stellar-dex_");
      expect(trace.timestamp).toBeGreaterThan(0);
      expect(trace.latencyMs).toBe(0);
      expect(trace.hopTraces).toEqual([]);
      expect(trace.attributionMetadata).toEqual({});
    });

    it("respects custom options", () => {
      const trace = createQuoteTrace("soroban-pool", {
        traceId: "custom-trace-123",
        latencyMs: 150,
        rawQuoteRef: "ref-999",
        hopTraces: [
          { hopIndex: 0, source: "XLM", inputAsset: "XLM", outputAsset: "USDC" },
        ],
      });

      expect(trace.traceId).toBe("custom-trace-123");
      expect(trace.latencyMs).toBe(150);
      expect(trace.rawQuoteRef).toBe("ref-999");
      expect(trace.hopTraces).toHaveLength(1);
    });
  });

  describe("formatTraceSummary", () => {
    it("formats trace summary without hops correctly", () => {
      const trace = createQuoteTrace("bridge-a", {
        traceId: "trc_test_123",
        latencyMs: 42,
      });

      const summary = formatTraceSummary(trace);
      expect(summary).toContain("[Trace trc_test_123]");
      expect(summary).toContain("Provider: bridge-a");
      expect(summary).toContain("Latency: 42ms");
      expect(summary).toContain("Hops: direct");
    });

    it("formats trace summary with hops correctly", () => {
      const trace = createQuoteTrace("bridge-b", {
        traceId: "trc_test_456",
        latencyMs: 80,
        hopTraces: [
          { hopIndex: 0, source: "XLM", poolId: "pool-1" },
          { hopIndex: 1, source: "USDC", poolId: "pool-2" },
        ],
      });

      const summary = formatTraceSummary(trace);
      expect(summary).toContain("#0: XLM (pool-1) -> #1: USDC (pool-2)");
    });
  });

  describe("Integration with normalizeProviderResponse", () => {
    it("attaches traceability metadata to normalized routes", () => {
      const routes = normalizeProviderResponse({
        providerId: "test-provider",
        sourceAsset: "XLM",
        destAsset: "USDC",
        latencyMs: 25,
        routes: [
          {
            inputAmount: "100",
            outputAmount: "95",
            feeAmount: "1",
            path: ["XLM", "AQUA", "USDC"],
            id: "quote-ref-001",
          },
        ],
      });

      expect(routes).toHaveLength(1);
      const route = routes[0];
      expect(route.traceability).toBeDefined();
      expect(route.traceability?.providerId).toBe("test-provider");
      expect(route.traceability?.latencyMs).toBe(25);
      expect(route.traceability?.rawQuoteRef).toBe("quote-ref-001");
      expect(route.traceability?.hopTraces).toHaveLength(3);
    });
  });
});
