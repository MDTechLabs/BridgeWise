import {
  EntityType,
  GraphEntity,
  GraphPath,
  GraphQuery,
  GraphRelationship,
  GraphStats,
  NeighborDirection,
  RelationshipType,
} from './bridge-knowledge-graph.types';

const ENTITY_TYPES: readonly EntityType[] = ['provider', 'asset', 'route', 'chain'] as const;
const RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  'PROVIDES_ROUTE',
  'SUPPORTS_ASSET',
  'ROUTES_ASSET',
  'BRIDGES_TO',
  'OPERATES_ON',
  'NATIVE_TO',
  'CONNECTS_CHAIN',
] as const;

// ─── Type-compatibility table for relationships ──────────────────────────────

const ALLOWED_PAIRS: Record<RelationshipType, [EntityType, EntityType][]> = {
  PROVIDES_ROUTE: [['provider', 'route']],
  SUPPORTS_ASSET: [['provider', 'asset']],
  ROUTES_ASSET: [['route', 'asset']],
  BRIDGES_TO: [['route', 'chain']],
  OPERATES_ON: [['provider', 'chain']],
  NATIVE_TO: [['asset', 'chain']],
  CONNECTS_CHAIN: [['route', 'chain']],
};

/**
 * Stellar Bridge Intelligence Knowledge Graph (#614).
 *
 * In-memory typed graph that models providers, assets, routes, and chains
 * and the relationships between them. Supports neighbor lookups, path
 * discovery (BFS with optional weight-aware Dijkstra), entity-type
 * queries, and attribute-based search.
 */
export class StellarBridgeKnowledgeGraph {
  private readonly entities = new Map<string, GraphEntity>();
  /** Outgoing edges keyed by source id. */
  private readonly outgoing = new Map<string, GraphRelationship[]>();
  /** Incoming edges keyed by target id. */
  private readonly incoming = new Map<string, GraphRelationship[]>();

  // ─── Entity CRUD ─────────────────────────────────────────────────────────

  addEntity(entity: GraphEntity): GraphEntity {
    if (!entity.id) {
      throw new Error('Entity must have a non-empty id');
    }
    if (!ENTITY_TYPES.includes(entity.type)) {
      throw new Error(`Invalid entity type "${entity.type}"`);
    }
    this.entities.set(entity.id, entity);
    if (!this.outgoing.has(entity.id)) this.outgoing.set(entity.id, []);
    if (!this.incoming.has(entity.id)) this.incoming.set(entity.id, []);
    return entity;
  }

  getEntity(id: string): GraphEntity | undefined {
    return this.entities.get(id);
  }

  hasEntity(id: string): boolean {
    return this.entities.has(id);
  }

  removeEntity(id: string): boolean {
    if (!this.entities.has(id)) return false;
    this.entities.delete(id);
    this.outgoing.delete(id);
    this.incoming.delete(id);
    // Also drop any edges referencing this id.
    for (const [from, list] of this.outgoing) {
      const filtered = list.filter((r) => r.toId !== id);
      if (filtered.length !== list.length) this.outgoing.set(from, filtered);
    }
    for (const [to, list] of this.incoming) {
      const filtered = list.filter((r) => r.fromId !== id);
      if (filtered.length !== list.length) this.incoming.set(to, filtered);
    }
    return true;
  }

  // ─── Relationship CRUD ──────────────────────────────────────────────────

  addRelationship(rel: GraphRelationship): GraphRelationship {
    const from = this.entities.get(rel.fromId);
    const to = this.entities.get(rel.toId);
    if (!from) throw new Error(`Source entity "${rel.fromId}" not found`);
    if (!to) throw new Error(`Target entity "${rel.toId}" not found`);
    if (!RELATIONSHIP_TYPES.includes(rel.type)) {
      throw new Error(`Invalid relationship type "${rel.type}"`);
    }
    const allowed = ALLOWED_PAIRS[rel.type];
    const ok = allowed.some(([a, b]) => a === from.type && b === to.type);
    if (!ok) {
      throw new Error(
        `Relationship ${rel.type} not allowed between ${from.type} and ${to.type}`,
      );
    }
    this.outgoing.get(rel.fromId)!.push(rel);
    this.incoming.get(rel.toId)!.push(rel);
    return rel;
  }

  removeRelationship(fromId: string, toId: string, type: RelationshipType): boolean {
    const list = this.outgoing.get(fromId);
    if (!list) return false;
    const before = list.length;
    const filtered = list.filter((r) => !(r.toId === toId && r.type === type));
    if (filtered.length === before) return false;
    this.outgoing.set(fromId, filtered);
    const incoming = this.incoming.get(toId) ?? [];
    this.incoming.set(
      toId,
      incoming.filter((r) => !(r.fromId === fromId && r.type === type)),
    );
    return true;
  }

  getRelationships(fromId?: string): GraphRelationship[] {
    if (fromId === undefined) {
      return [...this.outgoing.values()].flat();
    }
    return [...(this.outgoing.get(fromId) ?? [])];
  }

  // ─── Queries ────────────────────────────────────────────────────────────

  /**
   * Direct neighbours of a given entity. By default returns both directions.
   * Optionally filter by a specific relationship type.
   */
  neighborsOf(id: string, direction: NeighborDirection = 'both', type?: RelationshipType): GraphEntity[] {
    if (!this.entities.has(id)) return [];
    const out = (this.outgoing.get(id) ?? [])
      .filter((r) => !type || r.type === type)
      .map((r) => this.entities.get(r.toId))
      .filter((e): e is GraphEntity => Boolean(e));
    if (direction === 'outgoing') return out;
    const inc = (this.incoming.get(id) ?? [])
      .filter((r) => !type || r.type === type)
      .map((r) => this.entities.get(r.fromId))
      .filter((e): e is GraphEntity => Boolean(e));
    if (direction === 'incoming') return inc;
    // Deduplicate by id preserving order.
    const seen = new Set<string>();
    const merged: GraphEntity[] = [];
    for (const e of [...out, ...inc]) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        merged.push(e);
      }
    }
    return merged;
  }

  /**
   * Returns entities related to the given id through any (or a specific)
   * relationship type. Same as `neighborsOf` with direction='both' by default.
   */
  relatedEntities(id: string, type?: RelationshipType): GraphEntity[] {
    return this.neighborsOf(id, 'both', type);
  }

  /**
   * Find all simple paths between two entities up to `maxDepth` hops.
   * Returns up to `maxResults` paths, ordered by total weight ascending.
   */
  pathsBetween(fromId: string, toId: string, maxDepth = 5, maxResults = 10): GraphPath[] {
    if (!this.entities.has(fromId) || !this.entities.has(toId)) return [];
    const results: GraphPath[] = [];
    const visit = (
      current: string,
      target: string,
      depth: number,
      visited: Set<string>,
      pathNodes: GraphEntity[],
      pathRels: GraphRelationship[],
      weight: number,
    ): void => {
      if (results.length >= maxResults) return;
      if (current === target) {
        results.push({ nodes: [...pathNodes], relationships: [...pathRels], totalWeight: weight });
        return;
      }
      if (depth >= maxDepth) return;
      for (const rel of this.outgoing.get(current) ?? []) {
        if (visited.has(rel.toId)) continue;
        const next = this.entities.get(rel.toId);
        if (!next) continue;
        visited.add(rel.toId);
        pathNodes.push(next);
        pathRels.push(rel);
        visit(rel.toId, target, depth + 1, visited, pathNodes, pathRels, weight + (rel.weight ?? 0));
        pathRels.pop();
        pathNodes.pop();
        visited.delete(rel.toId);
        if (results.length >= maxResults) return;
      }
    };

    const start = this.entities.get(fromId)!;
    const initialVisited = new Set<string>([fromId]);
    visit(fromId, toId, 0, initialVisited, [start], [], 0);
    results.sort((a, b) => a.totalWeight - b.totalWeight);
    return results;
  }

  /**
   * Search entities by free-text and/or type and/or attribute match.
   */
  searchByType(query: GraphQuery = {}): GraphEntity[] {
    const limit = query.limit && query.limit > 0 ? query.limit : Infinity;
    const search = query.search?.toLowerCase();
    const out: GraphEntity[] = [];
    for (const entity of this.entities.values()) {
      if (query.type && entity.type !== query.type) continue;
      if (search) {
        const haystack = [
          entity.id,
          entity.label,
          ...Object.values(entity.attributes ?? {}).map((v) => String(v)),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) continue;
      }
      if (query.attributes) {
        const attrs = entity.attributes ?? {};
        const matches = Object.entries(query.attributes).every(([k, v]) => attrs[k] === v);
        if (!matches) continue;
      }
      out.push(entity);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Snapshot of all entities, for export. */
  exportEntities(): GraphEntity[] {
    return [...this.entities.values()];
  }

  /** Snapshot of all relationships, for export. */
  exportRelationships(): GraphRelationship[] {
    return [...this.outgoing.values()].flat();
  }

  /** Reset the graph to empty. */
  clear(): void {
    this.entities.clear();
    this.outgoing.clear();
    this.incoming.clear();
  }

  /** Graph-wide summary statistics. */
  getStats(): GraphStats {
    const entitiesByType: Record<EntityType, number> = {
      provider: 0,
      asset: 0,
      route: 0,
      chain: 0,
    };
    for (const e of this.entities.values()) entitiesByType[e.type]++;

    const relationshipsByType = RELATIONSHIP_TYPES.reduce((acc, t) => {
      acc[t] = 0;
      return acc;
    }, {} as Record<RelationshipType, number>);
    for (const rel of this.exportRelationships()) relationshipsByType[rel.type]++;

    return {
      totalEntities: this.entities.size,
      totalRelationships: this.exportRelationships().length,
      entitiesByType,
      relationshipsByType,
    };
  }
}
