import {
  AssetRelationship,
  AssetRef,
  AssetLookupResult,
  NativeAsset,
  WrappedAsset,
  RelationshipMetadata,
  RelationshipEngineStats,
  AssetChain,
} from './types';

export class CrossChainAssetRelationshipEngine {
  private readonly relationships = new Map<string, AssetRelationship>();

  register(
    native: NativeAsset,
    wrapped: WrappedAsset[],
    canonicalSymbol: string,
    metadata: Partial<RelationshipMetadata> = {},
  ): AssetRelationship {
    const id = `${native.chain}:${native.code}${native.issuer ? `:${native.issuer}` : ''}`;
    const now = new Date().toISOString();
    const existing = this.relationships.get(id);

    const relationship: AssetRelationship = {
      id,
      native,
      wrapped: existing ? this.mergeWrapped(existing.wrapped, wrapped) : wrapped,
      canonicalSymbol,
      metadata: {
        priceFeedId: metadata.priceFeedId,
        coingeckoId: metadata.coingeckoId,
        logoUrl: metadata.logoUrl,
        description: metadata.description,
        createdAt: existing?.metadata.createdAt ?? now,
        updatedAt: now,
      },
    };

    this.relationships.set(id, relationship);
    return relationship;
  }

  lookupByNative(chain: AssetChain, code: string, issuer?: string): AssetLookupResult {
    const id = `${chain}:${code}${issuer ? `:${issuer}` : ''}`;
    const relationship = this.relationships.get(id);

    if (relationship) {
      return { found: true, relationship, matchedOn: 'native' };
    }

    // Attempt partial match (no issuer)
    for (const rel of this.relationships.values()) {
      if (rel.native.chain === chain && rel.native.code === code) {
        return { found: true, relationship: rel, matchedOn: 'native' };
      }
    }

    return { found: false, matchedOn: null };
  }

  lookupByWrapped(chain: AssetChain, contractAddress: string): AssetLookupResult {
    for (const relationship of this.relationships.values()) {
      const match = relationship.wrapped.find(
        (w) => w.chain === chain && w.contractAddress.toLowerCase() === contractAddress.toLowerCase(),
      );
      if (match) {
        return { found: true, relationship, matchedOn: 'wrapped' };
      }
    }
    return { found: false, matchedOn: null };
  }

  lookupBySymbol(symbol: string): AssetRelationship[] {
    const upper = symbol.toUpperCase();
    return Array.from(this.relationships.values()).filter(
      (r) => r.canonicalSymbol.toUpperCase() === upper || r.native.code.toUpperCase() === upper,
    );
  }

  getAll(): AssetRelationship[] {
    return Array.from(this.relationships.values());
  }

  remove(id: string): boolean {
    return this.relationships.delete(id);
  }

  stats(): RelationshipEngineStats {
    const rels = this.getAll();
    const chains = new Set<AssetChain>();

    for (const rel of rels) {
      chains.add(rel.native.chain);
      for (const w of rel.wrapped) {
        chains.add(w.chain);
      }
    }

    const wrappedCount = rels.reduce((sum, r) => sum + r.wrapped.length, 0);

    return {
      totalRelationships: rels.length,
      chainCoverage: Array.from(chains),
      nativeAssetCount: rels.length,
      wrappedAssetCount: wrappedCount,
    };
  }

  private mergeWrapped(existing: WrappedAsset[], incoming: WrappedAsset[]): WrappedAsset[] {
    const map = new Map<string, WrappedAsset>();
    for (const w of existing) {
      map.set(`${w.chain}:${w.contractAddress.toLowerCase()}`, w);
    }
    for (const w of incoming) {
      map.set(`${w.chain}:${w.contractAddress.toLowerCase()}`, w);
    }
    return Array.from(map.values());
  }
}
