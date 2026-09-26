/**
 * Cost calculator for cross-chain bridge routes.
 *
 * Calculates edge weights (fee, latency, liquidity) between chain/asset pairs
 * by estimating network fees, bridge protocol fees, and transfer times.
 *
 * @example
 * ```ts
 * const calculator = new CostCalculator();
 * const edge = await calculator.calculateEdgeCost("USDC", "stellar", "ethereum", 1000);
 * ```
 */

import { GraphEdge } from "./types";

const BASE_NETWORK_FEE = 0.001;
const BRIDGE_FEE_BPS = 5; // 0.05%

interface ChainLatencyConfig {
  networkSeconds: number;
  confirmationSeconds: number;
}

const CHAIN_LATENCIES: Record<string, ChainLatencyConfig> = {
  stellar: { networkSeconds: 2, confirmationSeconds: 5 },
  ethereum: { networkSeconds: 12, confirmationSeconds: 60 },
  polygon: { networkSeconds: 2, confirmationSeconds: 20 },
  arbitrum: { networkSeconds: 1, confirmationSeconds: 15 },
  optimism: { networkSeconds: 1, confirmationSeconds: 15 },
  base: { networkSeconds: 1, confirmationSeconds: 15 },
  bsc: { networkSeconds: 3, confirmationSeconds: 10 },
  avalanche: { networkSeconds: 2, confirmationSeconds: 10 },
  gnosis: { networkSeconds: 5, confirmationSeconds: 15 },
  solana: { networkSeconds: 1, confirmationSeconds: 5 },
};

const BRIDGE_PROCESSING_SECONDS = 5;

/**
 * Calculates route costs between chain/asset pairs.
 */
export class CostCalculator {
  /**
   * Calculate the edge cost between two chains for a given asset and amount.
   */
  async calculateEdgeCost(
    asset: string,
    sourceChain: string,
    targetChain: string,
    amount: number,
    provider?: string,
  ): Promise<GraphEdge> {
    const sourceLatency = CHAIN_LATENCIES[sourceChain] ?? { networkSeconds: 10, confirmationSeconds: 30 };
    const targetLatency = CHAIN_LATENCIES[targetChain] ?? { networkSeconds: 10, confirmationSeconds: 30 };

    const networkFee = BASE_NETWORK_FEE;
    const bridgeFee = amount * (BRIDGE_FEE_BPS / 10000);
    const totalFee = networkFee + bridgeFee;

    const latencyMs =
      (sourceLatency.networkSeconds +
        sourceLatency.confirmationSeconds +
        targetLatency.networkSeconds +
        BRIDGE_PROCESSING_SECONDS) *
      1000;

    return {
      sourceNode: `${asset}:${sourceChain}`,
      targetNode: `${asset}:${targetChain}`,
      provider: provider ?? "unknown",
      fee: totalFee,
      latencyMs,
      liquidity: 10000,
      isActive: true,
    };
  }

  /**
   * Calculate multiple edges in parallel.
   */
  async calculateEdges(
    routes: Array<{ asset: string; sourceChain: string; targetChain: string; amount: number; provider?: string }>,
  ): Promise<GraphEdge[]> {
    return Promise.all(
      routes.map((r) => this.calculateEdgeCost(r.asset, r.sourceChain, r.targetChain, r.amount, r.provider)),
    );
  }

  /**
   * Simulate a liquidity refresh for an edge. In production this would query
   * the actual bridge protocol or liquidity monitoring service.
   */
  async refreshLiquidity(edge: GraphEdge): Promise<number> {
    return edge.liquidity;
  }
}
