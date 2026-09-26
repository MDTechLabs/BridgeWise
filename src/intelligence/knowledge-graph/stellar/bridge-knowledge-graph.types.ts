/**
 * Stellar Bridge Intelligence Knowledge Graph (#614).
 *
 * Models the relationships between providers, assets, routes, and chains
 * in the Stellar/Soroban bridge ecosystem as a typed graph that supports
 * neighbour lookups, path discovery, and entity-type searches.
 */

export type EntityType = 'provider' | 'asset' | 'route' | 'chain';

/** A node in the knowledge graph. */
export interface GraphEntity {
  id: string;
  type: EntityType;
  /** Human-readable label. */
  label: string;
  /** Free-form attributes (chain ids, tickers, etc.). */
  attributes?: Record<string, unknown>;
}

/**
 * Typed relationships between entities. Each relationship type restricts
 * which (source, target) entity-type pairs are valid.
 */
export type RelationshipType =
  | 'PROVIDES_ROUTE'     // provider -> route
  | 'SUPPORTS_ASSET'     // provider -> asset
  | 'ROUTES_ASSET'       // route -> asset
  | 'BRIDGES_TO'         // route -> chain
  | 'OPERATES_ON'        // provider -> chain
  | 'NATIVE_TO'          // asset -> chain
  | 'CONNECTS_CHAIN';    // route -> chain (alias for source/destination)

/** A directed edge in the graph. */
export interface GraphRelationship {
  fromId: string;
  toId: string;
  type: RelationshipType;
  /** Optional weight/cost/score metadata. */
  weight?: number;
  attributes?: Record<string, unknown>;
}

/** A path between two entities (sequence of entity ids and relationships). */
export interface GraphPath {
  nodes: GraphEntity[];
  relationships: GraphRelationship[];
  /** Sum of relationship weights (when present); lower is "closer". */
  totalWeight: number;
}

/** A small structured query for the graph. */
export interface GraphQuery {
  type?: EntityType;
  /** Free-text substring match against id, label, and attribute values. */
  search?: string;
  /** Optional attribute matcher: any key whose value matches is included. */
  attributes?: Record<string, unknown>;
  limit?: number;
}

/** Graph-wide summary stats. */
export interface GraphStats {
  totalEntities: number;
  totalRelationships: number;
  entitiesByType: Record<EntityType, number>;
  relationshipsByType: Record<RelationshipType, number>;
}

/** Direction for neighbour lookups. */
export type NeighborDirection = 'incoming' | 'outgoing' | 'both';

// ─── Factories ──────────────────────────────────────────────────────────────

export function buildProviderNode(
  id: string,
  label: string,
  attributes?: Record<string, unknown>,
): GraphEntity {
  return { id, type: 'provider', label, attributes };
}

export function buildAssetNode(
  id: string,
  label: string,
  attributes?: Record<string, unknown>,
): GraphEntity {
  return { id, type: 'asset', label, attributes };
}

export function buildRouteNode(
  id: string,
  label: string,
  attributes?: Record<string, unknown>,
): GraphEntity {
  return { id, type: 'route', label, attributes };
}

export function buildChainNode(
  id: string,
  label: string,
  attributes?: Record<string, unknown>,
): GraphEntity {
  return { id, type: 'chain', label, attributes };
}
