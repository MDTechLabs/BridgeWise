export interface GraphNode {
  id: string; // e.g. "USDC:ethereum"
  token: string;
  chain: string;
  nativeGasToken: string;
}

export interface GraphEdge {
  id: string; // e.g. "bridge-hop-1"
  fromNodeId: string; // e.g. "USDC:ethereum"
  toNodeId: string; // e.g. "USDC:stellar"
  protocol: string; // e.g. "StellarBridge", "LayerZero", "Uniswap"
  bridgeFeeUsd: number;
  gasCostUsd: number;
  estimatedTimeSec: number;
  exchangeRate: number; // multiplier for amount: receiveAmount = inputAmount * exchangeRate
  liquidityUsd: number;
  requiresGasConversion?: boolean;
  intermediateGasTokenCostUsd?: number;
}

export interface RoutingGraph {
  nodes: Map<string, GraphNode>;
  adjacency: Map<string, GraphEdge[]>;
}

export interface HopDetails {
  fromNode: GraphNode;
  toNode: GraphNode;
  protocol: string;
  bridgeFeeUsd: number;
  gasCostUsd: number;
  exchangeRate: number;
  inputAmount: number;
  outputAmount: number;
  estimatedTimeSec: number;
}

export interface OptimalRoute {
  path: GraphNode[];
  hops: HopDetails[];
  totalInputAmount: number;
  totalOutputAmount: number;
  totalGasCostUsd: number;
  totalBridgeFeeUsd: number;
  totalCostUsd: number;
  totalEstimatedTimeSec: number;
  executionTimeMs: number;
}

export class GraphBuilder {
  private graph: RoutingGraph = {
    nodes: new Map(),
    adjacency: new Map(),
  };

  public addNode(node: GraphNode): void {
    this.graph.nodes.set(node.id, node);
    if (!this.graph.adjacency.has(node.id)) {
      this.graph.adjacency.set(node.id, []);
    }
  }

  public addEdge(edge: GraphEdge): void {
    if (!this.graph.nodes.has(edge.fromNodeId) || !this.graph.nodes.has(edge.toNodeId)) {
      throw new Error(`Nodes ${edge.fromNodeId} and ${edge.toNodeId} must exist in graph before adding edge`);
    }
    const edges = this.graph.adjacency.get(edge.fromNodeId) || [];
    edges.push(edge);
    this.graph.adjacency.set(edge.fromNodeId, edges);
  }

  public updateEdgeWeight(edgeId: string, updates: Partial<GraphEdge>): void {
    for (const [, edges] of this.graph.adjacency.entries()) {
      const edge = edges.find((e) => e.id === edgeId);
      if (edge) {
        Object.assign(edge, updates);
        return;
      }
    }
  }

  public getGraph(): RoutingGraph {
    return this.graph;
  }

  public clear(): void {
    this.graph.nodes.clear();
    this.graph.adjacency.clear();
  }
}
