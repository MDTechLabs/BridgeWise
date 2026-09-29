/**
 * Quote Source Traceability
 *
 * Provides structured traceability metadata for normalized bridge/DEX routes.
 * Tracks source provider attribution, execution latency, hop details, DEX pool IDs,
 * and timestamp metadata for auditability and debugging.
 */

export interface HopTrace {
  hopIndex: number;
  source: string;
  poolId?: string;
  protocol?: string;
  inputAsset?: string;
  outputAsset?: string;
}

export interface QuoteTraceability {
  traceId: string;
  providerId: string;
  timestamp: number;
  latencyMs: number;
  hopTraces: HopTrace[];
  rawQuoteRef?: string;
  attributionMetadata?: Record<string, unknown>;
}

/**
 * Generate a pseudo-random trace ID if none provided.
 */
function generateTraceId(providerId: string): string {
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  return `trc_${providerId}_${Date.now()}_${randomSuffix}`;
}

/**
 * Create a new QuoteTraceability instance with secure defaults.
 */
export function createQuoteTrace(
  providerId: string,
  options: Partial<QuoteTraceability> = {},
): QuoteTraceability {
  return {
    traceId: options.traceId ?? generateTraceId(providerId),
    providerId,
    timestamp: options.timestamp ?? Date.now(),
    latencyMs: options.latencyMs ?? 0,
    hopTraces: options.hopTraces ?? [],
    rawQuoteRef: options.rawQuoteRef,
    attributionMetadata: options.attributionMetadata ?? {},
  };
}

/**
 * Format a human-readable summary string for logging or debugging.
 */
export function formatTraceSummary(trace: QuoteTraceability): string {
  const hopsSummary =
    trace.hopTraces.length > 0
      ? trace.hopTraces
          .map(
            (h) =>
              `#${h.hopIndex}: ${h.source}${h.poolId ? ` (${h.poolId})` : ""}`,
          )
          .join(" -> ")
      : "direct";

  return `[Trace ${trace.traceId}] Provider: ${trace.providerId} | Latency: ${trace.latencyMs}ms | Hops: ${hopsSummary} | Timestamp: ${new Date(trace.timestamp).toISOString()}`;
}
