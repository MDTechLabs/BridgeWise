import { Injectable, Logger } from '@nestjs/common';
import {
  Asset,
  assetId,
  PathResolutionCode,
  PathResolutionResult,
  TransferPath,
} from './asset-path.types';

export interface AssetPathResolverConfig {
  /** Maximum number of hops (edges) a resolved path may contain. */
  maxHops?: number;
  /** Maximum number of candidate paths to return, best (shortest) first. */
  maxPaths?: number;
}

/**
 * Resolves candidate asset paths for Soroban-based bridge transfers by walking a
 * directed graph of supported asset conversions. Only supported (registered)
 * intermediary assets are traversed; unsupported endpoints are rejected.
 */
@Injectable()
export class AssetPathResolverService {
  private readonly logger = new Logger(AssetPathResolverService.name);

  private readonly supported = new Set<string>();
  private readonly edges = new Map<string, Set<string>>();
  private readonly nodeByIdentity = new Map<string, Asset>();

  private readonly maxHops: number;
  private readonly maxPaths: number;

  constructor(config: AssetPathResolverConfig = {}) {
    this.maxHops = config.maxHops ?? 3;
    this.maxPaths = config.maxPaths ?? 5;
  }

  /** Register a supported asset that may act as a path endpoint or intermediary. */
  registerAsset(asset: Asset): void {
    const id = assetId(asset);
    this.supported.add(id);
    this.nodeByIdentity.set(id, asset);
    if (!this.edges.has(id)) this.edges.set(id, new Set());
  }

  /** Register a directed conversion edge from one supported asset to another. */
  registerEdge(from: Asset, to: Asset): void {
    this.registerAsset(from);
    this.registerAsset(to);
    this.edges.get(assetId(from))!.add(assetId(to));
  }

  isSupported(asset: Asset): boolean {
    return this.supported.has(assetId(asset));
  }

  /**
   * Discover candidate transfer paths from `source` to `destination`, shortest
   * first, traversing only supported intermediary assets.
   */
  resolvePaths(source: Asset, destination: Asset): PathResolutionResult {
    if (!this.isSupported(source)) {
      return { resolved: false, paths: [], reason: PathResolutionCode.UNSUPPORTED_SOURCE };
    }
    if (!this.isSupported(destination)) {
      return { resolved: false, paths: [], reason: PathResolutionCode.UNSUPPORTED_DESTINATION };
    }

    const sourceId = assetId(source);
    const destId = assetId(destination);
    const results: TransferPath[] = [];

    // BFS over paths (shortest first), bounded by maxHops and maxPaths.
    const queue: string[][] = [[sourceId]];
    while (queue.length > 0 && results.length < this.maxPaths) {
      const current = queue.shift()!;
      const tail = current[current.length - 1];

      if (tail === destId && current.length > 1) {
        results.push({
          path: current.map((id) => this.nodeByIdentity.get(id)!),
          hops: current.length - 1,
        });
        continue;
      }
      if (current.length - 1 >= this.maxHops) continue;

      for (const next of this.edges.get(tail) ?? []) {
        if (current.includes(next)) continue; // no cycles
        queue.push([...current, next]);
      }
    }

    // Handle the trivial "source already equals destination" case.
    if (sourceId === destId) {
      results.unshift({ path: [source], hops: 0 });
    }

    if (results.length === 0) {
      this.logger.debug(`No path from ${sourceId} to ${destId}`);
      return { resolved: false, paths: [], reason: PathResolutionCode.NO_PATH };
    }

    results.sort((a, b) => a.hops - b.hops);
    return { resolved: true, paths: results.slice(0, this.maxPaths) };
  }
}
