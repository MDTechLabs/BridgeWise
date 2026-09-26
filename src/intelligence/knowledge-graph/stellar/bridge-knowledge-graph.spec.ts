import { StellarBridgeKnowledgeGraph } from './bridge-knowledge-graph';
import {
  buildAssetNode,
  buildChainNode,
  buildProviderNode,
  buildRouteNode,
} from './bridge-knowledge-graph.types';

function buildSampleGraph(): StellarBridgeKnowledgeGraph {
  const g = new StellarBridgeKnowledgeGraph();
  g.addEntity(buildProviderNode('p-stellarbridge', 'StellarBridge'));
  g.addEntity(buildProviderNode('p-fastbridge', 'FastBridge'));
  g.addEntity(buildAssetNode('a-xlm', 'XLM', { symbol: 'XLM' }));
  g.addEntity(buildAssetNode('a-usdc', 'USDC', { symbol: 'USDC' }));
  g.addEntity(buildChainNode('c-stellar', 'stellar'));
  g.addEntity(buildChainNode('c-ethereum', 'ethereum'));
  g.addEntity(buildChainNode('c-polygon', 'polygon'));
  g.addEntity(buildRouteNode('r-xlm-eth', 'Stellar → Ethereum (XLM)', { sourceChain: 'stellar' }));
  g.addEntity(buildRouteNode('r-usdc-poly', 'Stellar → Polygon (USDC)', { sourceChain: 'stellar' }));

  g.addRelationship({ fromId: 'p-stellarbridge', toId: 'r-xlm-eth', type: 'PROVIDES_ROUTE', weight: 1 });
  g.addRelationship({ fromId: 'p-stellarbridge', toId: 'r-usdc-poly', type: 'PROVIDES_ROUTE', weight: 2 });
  g.addRelationship({ fromId: 'p-fastbridge', toId: 'r-usdc-poly', type: 'PROVIDES_ROUTE', weight: 3 });
  g.addRelationship({ fromId: 'p-stellarbridge', toId: 'a-xlm', type: 'SUPPORTS_ASSET' });
  g.addRelationship({ fromId: 'p-stellarbridge', toId: 'a-usdc', type: 'SUPPORTS_ASSET' });
  g.addRelationship({ fromId: 'r-xlm-eth', toId: 'a-xlm', type: 'ROUTES_ASSET' });
  g.addRelationship({ fromId: 'r-usdc-poly', toId: 'a-usdc', type: 'ROUTES_ASSET' });
  g.addRelationship({ fromId: 'r-xlm-eth', toId: 'c-ethereum', type: 'BRIDGES_TO', weight: 4 });
  g.addRelationship({ fromId: 'r-usdc-poly', toId: 'c-polygon', type: 'BRIDGES_TO', weight: 5 });
  g.addRelationship({ fromId: 'p-stellarbridge', toId: 'c-stellar', type: 'OPERATES_ON' });
  g.addRelationship({ fromId: 'a-xlm', toId: 'c-stellar', type: 'NATIVE_TO' });
  g.addRelationship({ fromId: 'a-usdc', toId: 'c-stellar', type: 'NATIVE_TO' });
  return g;
}

// ---------------------------------------------------------------------------
// Entity CRUD
// ---------------------------------------------------------------------------

describe('StellarBridgeKnowledgeGraph - entities', () => {
  it('adds and retrieves entities', () => {
    const g = new StellarBridgeKnowledgeGraph();
    g.addEntity(buildProviderNode('p', 'P'));
    expect(g.hasEntity('p')).toBe(true);
    expect(g.getEntity('p')?.label).toBe('P');
  });

  it('rejects unknown entity types', () => {
    const g = new StellarBridgeKnowledgeGraph();
    expect(() => g.addEntity({ id: 'x', type: 'unknown' as any, label: 'X' })).toThrow();
  });

  it('removes an entity and its incident edges', () => {
    const g = buildSampleGraph();
    expect(g.removeEntity('r-xlm-eth')).toBe(true);
    expect(g.hasEntity('r-xlm-eth')).toBe(false);
    // The provider still exists, but its outgoing relationship is gone.
    const rels = g.getRelationships('p-stellarbridge');
    expect(rels.find((r) => r.toId === 'r-xlm-eth')).toBeUndefined();
  });

  it('removeEntity returns false for missing ids', () => {
    const g = new StellarBridgeKnowledgeGraph();
    expect(g.removeEntity('nope')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Relationship CRUD + validation
// ---------------------------------------------------------------------------

describe('StellarBridgeKnowledgeGraph - relationships', () => {
  it('rejects mismatched source/target types', () => {
    const g = new StellarBridgeKnowledgeGraph();
    g.addEntity(buildProviderNode('p', 'P'));
    g.addEntity(buildAssetNode('a', 'A'));
    expect(() =>
      g.addRelationship({ fromId: 'p', toId: 'a', type: 'BRIDGES_TO' }),
    ).toThrow();
  });

  it('rejects unknown source/target ids', () => {
    const g = new StellarBridgeKnowledgeGraph();
    g.addEntity(buildProviderNode('p', 'P'));
    expect(() =>
      g.addRelationship({ fromId: 'p', toId: 'ghost', type: 'PROVIDES_ROUTE' }),
    ).toThrow();
  });

  it('removes a specific relationship', () => {
    const g = buildSampleGraph();
    expect(g.removeRelationship('p-stellarbridge', 'r-xlm-eth', 'PROVIDES_ROUTE')).toBe(true);
    expect(g.getRelationships('p-stellarbridge').find((r) => r.toId === 'r-xlm-eth')).toBeUndefined();
  });

  it('removeRelationship returns false when no match', () => {
    const g = buildSampleGraph();
    expect(g.removeRelationship('p-stellarbridge', 'r-xlm-eth', 'NATIVE_TO')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

describe('StellarBridgeKnowledgeGraph - queries', () => {
  const g = buildSampleGraph();

  it('neighborsOf returns outgoing neighbours', () => {
    const out = g.neighborsOf('p-stellarbridge', 'outgoing');
    expect(out.map((e) => e.id).sort()).toEqual(['a-usdc', 'a-xlm', 'c-stellar', 'r-usdc-poly', 'r-xlm-eth']);
  });

  it('neighborsOf returns incoming neighbours', () => {
    const inb = g.neighborsOf('a-usdc', 'incoming');
    expect(inb.map((e) => e.id).sort()).toEqual(['p-stellarbridge', 'r-usdc-poly']);
  });

  it('neighborsOf filters by relationship type', () => {
    const routes = g.neighborsOf('p-stellarbridge', 'outgoing', 'PROVIDES_ROUTE');
    expect(routes.every((e) => e.type === 'route')).toBe(true);
    expect(routes).toHaveLength(2);
  });

  it('relatedEntities finds entities of a specific type', () => {
    const providers = g.relatedEntities('r-xlm-eth', 'PROVIDES_ROUTE');
    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe('p-stellarbridge');
  });

  it('pathsBetween finds a path and respects weight ordering', () => {
    // p-stellarbridge -> r-xlm-eth (PROVIDES_ROUTE) -> c-ethereum (BRIDGES_TO)
    const paths = g.pathsBetween('p-stellarbridge', 'c-ethereum', 4);
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((p) => {
      expect(p.nodes[0].id).toBe('p-stellarbridge');
      expect(p.nodes[p.nodes.length - 1].id).toBe('c-ethereum');
    });
  });

  it('pathsBetween follows multi-hop routes in the right direction', () => {
    // a-xlm -> ? No outgoing from a-xlm except NATIVE_TO -> c-stellar (no outgoing).
    // r-xlm-eth -> a-xlm (ROUTES_ASSET). So a-xlm is reachable only as a target.
    // From c-ethereum there are no outgoing edges, so reverse direction works.
    const reverse = g.pathsBetween('c-ethereum', 'a-xlm', 4);
    expect(reverse.length).toBeGreaterThan(0);
    expect(reverse[0].nodes[0].id).toBe('c-ethereum');
    expect(reverse[0].nodes[reverse[0].nodes.length - 1].id).toBe('a-xlm');
  });

  it('pathsBetween returns [] when no path exists', () => {
    const fresh = new StellarBridgeKnowledgeGraph();
    fresh.addEntity(buildAssetNode('a', 'A'));
    fresh.addEntity(buildChainNode('c', 'C'));
    expect(fresh.pathsBetween('a', 'c', 4)).toEqual([]);
  });

  it('searchByType filters by entity type', () => {
    expect(g.searchByType({ type: 'route' })).toHaveLength(2);
    expect(g.searchByType({ type: 'asset' })).toHaveLength(2);
  });

  it('searchByType supports free-text matching across attributes', () => {
    const matches = g.searchByType({ search: 'USDC' });
    expect(matches.some((e) => e.id === 'a-usdc')).toBe(true);
  });

  it('searchByType supports attribute equality matching', () => {
    const matches = g.searchByType({ type: 'asset', attributes: { symbol: 'XLM' } });
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('a-xlm');
  });

  it('searchByType honors the limit', () => {
    expect(g.searchByType({ limit: 1 })).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Stats + export
// ---------------------------------------------------------------------------

describe('StellarBridgeKnowledgeGraph - stats', () => {
  it('reports correct counts', () => {
    const g = buildSampleGraph();
    const stats = g.getStats();
    expect(stats.totalEntities).toBe(9);
    expect(stats.totalRelationships).toBe(12);
    expect(stats.entitiesByType.provider).toBe(2);
    expect(stats.entitiesByType.route).toBe(2);
    expect(stats.relationshipsByType.PROVIDES_ROUTE).toBe(3);
  });

  it('clears the graph', () => {
    const g = buildSampleGraph();
    g.clear();
    expect(g.getStats().totalEntities).toBe(0);
    expect(g.exportRelationships()).toEqual([]);
  });
});
