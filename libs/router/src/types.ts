/**
 * Types for the cross-chain liquidity and bridge path routing engine.
 *
 * @example
 * ```ts
 * import type { GraphNode, GraphEdge, PathResult, RoutingOptions } from '@bridgewise/router';
 * ```
 */

/**
 * A node in the bridge graph — a specific asset on a specific chain.
 */
export interface GraphNode {
  /** Unique identifier (e.g. "USDC:stellar", "ETH:ethereum"). */
  id: string;
  /** Chain name (e.g. "stellar", "ethereum", "polygon"). */
  chain: string;
  /** Asset symbol (e.g. "USDC", "ETH", "XLM"). */
  asset: string;
}

/**
 * A weighted edge in the bridge graph — a bridge route between two nodes.
 */
export interface GraphEdge {
  /** Source node ID. */
  sourceNode: string;
  /** Target node ID. */
  targetNode: string;
  /** Bridge protocol provider name (e.g. "layerzero", "hop", "stellar"). */
  provider: string;
  /** Estimated fee in input asset units. */
  fee: number;
  /** Estimated transfer time in milliseconds. */
  latencyMs: number;
  /** Available liquidity in input asset units. */
  liquidity: number;
  /** Whether the route is currently operational. */
  isActive: boolean;
}

/**
 * Result of a path-finding operation.
 */
export interface PathResult {
  /** The sequence of edges forming the path. */
  path: GraphEdge[];
  /** Total estimated fee across all hops. */
  totalFee: number;
  /** Total estimated time across all hops in milliseconds. */
  totalLatencyMs: number;
  /** Number of hops (edges) in the path. */
  totalHops: number;
  /** Unique bridge providers used in this path. */
  providers: string[];
  /** Composite score — lower is better (used for sorting). */
  score: number;
}

/**
 * Routing strategy selection.
 */
export type RoutingStrategy = "cheapest" | "fastest" | "balanced";

/**
 * Options for configuring a routing request.
 */
export interface RoutingOptions {
  /** Optimization strategy. */
  strategy: RoutingStrategy;
  /** Maximum acceptable slippage in basis points (default: 100 = 1%). */
  maxSlippageBps?: number;
  /** Bridge providers to prefer (will weight edges from these providers lower). */
  preferProviders?: string[];
  /** Bridge providers to exclude from routing. */
  excludeProviders?: string[];
  /** Maximum number of hops allowed (default: 5). */
  maxHops?: number;
}
