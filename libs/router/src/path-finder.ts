/**
 * Path finder for cross-chain bridge routing.
 *
 * Builds a graph of bridge routes as weighted edges and uses Dijkstra's
 * algorithm to find optimal transfer paths based on the selected strategy
 * (cheapest, fastest, or balanced).
 *
 * @example
 * ```ts
 * const finder = new PathFinder();
 * finder.addEdge(edge1);
 * finder.addEdge(edge2);
 * const result = finder.findPath("USDC:stellar", "USDC:ethereum", { strategy: "cheapest" });
 * ```
 */

import { GraphEdge, GraphNode, PathResult, RoutingOptions, RoutingStrategy } from "./types";

/**
 * Priority queue entry for Dijkstra's algorithm.
 */
interface DistantNode {
  nodeId: string;
  distance: number;
  path: GraphEdge[];
  visited: Set<string>;
}

/**
 * Computes the edge weight based on the routing strategy.
 */
function edgeWeight(edge: GraphEdge, strategy: RoutingStrategy, options: RoutingOptions): number {
  switch (strategy) {
    case "cheapest":
      return edge.fee + (options.preferProviders?.includes(edge.provider) ? edge.fee * -0.1 : 0);
    case "fastest":
      return edge.latencyMs + (options.preferProviders?.includes(edge.provider) ? edge.latencyMs * -0.1 : 0);
    case "balanced": {
      const maxFee = 1;
      const maxLatency = 60000;
      const normalizedFee = Math.min(edge.fee / maxFee, 1);
      const normalizedLatency = Math.min(edge.latencyMs / maxLatency, 1);
      const weight = normalizedFee * 0.5 + normalizedLatency * 0.5;
      return weight + (options.preferProviders?.includes(edge.provider) ? weight * -0.1 : 0);
    }
  }
}

/**
 * Finds optimal cross-chain transfer paths using Dijkstra's algorithm.
 */
export class PathFinder {
  private readonly edges: Map<string, GraphEdge[]> = new Map();

  /**
   * Add an edge to the routing graph.
   */
  addEdge(edge: GraphEdge): void {
    const key = edge.sourceNode;
    const existing = this.edges.get(key) ?? [];
    existing.push(edge);
    this.edges.set(key, existing);
  }

  /**
   * Add multiple edges at once.
   */
  addEdges(edges: GraphEdge[]): void {
    for (const edge of edges) {
      this.addEdge(edge);
    }
  }

  /**
   * Build the graph from a list of edges (replaces all existing edges).
   */
  buildGraph(edges: GraphEdge[]): void {
    this.edges.clear();
    this.addEdges(edges);
  }

  /**
   * Get all routes originating from a node.
   */
  getRoutesFrom(nodeId: string): GraphEdge[] {
    return this.edges.get(nodeId) ?? [];
  }

  /**
   * Find the optimal path between two nodes using Dijkstra's algorithm.
   *
   * Returns the best path according to the selected strategy, or `null` if
   * no path exists within the given constraints.
   */
  findPath(
    sourceNodeId: string,
    targetNodeId: string,
    options: RoutingOptions = { strategy: "cheapest" },
  ): PathResult | null {
    const results = this.findPaths(sourceNodeId, targetNodeId, options, 1);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Find multiple paths between two nodes, ordered by score.
   */
  findPaths(
    sourceNodeId: string,
    targetNodeId: string,
    options: RoutingOptions = { strategy: "cheapest" },
    maxResults: number = 5,
  ): PathResult[] {
    const results: PathResult[] = [];
    const maxHops = options.maxHops ?? 5;

    // Dijkstra's algorithm
    const distances: Map<string, number> = new Map();
    const previousEdges: Map<string, GraphEdge> = new Map();
    const unvisited: Set<string> = new Set();
    const hops: Map<string, number> = new Map();

    distances.set(sourceNodeId, 0);
    hops.set(sourceNodeId, 0);
    unvisited.add(sourceNodeId);

    const pq: DistantNode[] = [{ nodeId: sourceNodeId, distance: 0, path: [], visited: new Set() }];

    while (pq.length > 0) {
      // Extract min (simple linear scan — swap for binary heap for large graphs)
      let minIdx = 0;
      for (let i = 1; i < pq.length; i++) {
        if (pq[i].distance < pq[minIdx].distance) {
          minIdx = i;
        }
      }
      const current = pq.splice(minIdx, 1)[0];

      if (current.nodeId === targetNodeId) {
        const path = current.path;
        const result = this.buildPathResult(path);
        results.push(result);
        if (results.length >= maxResults) {
          break;
        }
        continue;
      }

      if (current.visited.has(current.nodeId)) {
        continue;
      }
      current.visited.add(current.nodeId);

      const neighbors = this.edges.get(current.nodeId) ?? [];

      for (const edge of neighbors) {
        if (current.visited.has(edge.targetNode)) {
          continue;
        }
        if (options.excludeProviders?.includes(edge.provider)) {
          continue;
        }
        if (!edge.isActive) {
          continue;
        }
        if (edge.liquidity <= 0) {
          continue;
        }
        if ((hops.get(current.nodeId) ?? 0) >= maxHops) {
          continue;
        }

        const weight = edgeWeight(edge, options.strategy, options);
        const newDistance = current.distance + weight;

        if (!distances.has(edge.targetNode) || newDistance < distances.get(edge.targetNode)!) {
          distances.set(edge.targetNode, newDistance);
          previousEdges.set(edge.targetNode, edge);
          hops.set(edge.targetNode, (hops.get(current.nodeId) ?? 0) + 1);
          pq.push({
            nodeId: edge.targetNode,
            distance: newDistance,
            path: [...current.path, edge],
            visited: new Set(current.visited),
          });
        }
      }
    }

    return results;
  }

  /**
   * Convert a path of edges into a PathResult.
   */
  private buildPathResult(path: GraphEdge[]): PathResult {
    const totalFee = path.reduce((sum, e) => sum + e.fee, 0);
    const totalLatencyMs = path.reduce((sum, e) => sum + e.latencyMs, 0);
    const providers = [...new Set(path.map((e) => e.provider))];

    return {
      path,
      totalFee,
      totalLatencyMs,
      totalHops: path.length,
      providers,
      score: totalFee + totalLatencyMs / 60000,
    };
  }
}
