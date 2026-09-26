export type AssetChain = 'stellar' | 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'solana';

export interface NativeAsset {
  chain: AssetChain;
  code: string;
  issuer?: string;
  decimals: number;
}

export interface WrappedAsset {
  chain: AssetChain;
  code: string;
  contractAddress: string;
  decimals: number;
  bridgeProtocol: string;
}

export type AssetRef = NativeAsset | WrappedAsset;

export interface AssetRelationship {
  id: string;
  native: NativeAsset;
  wrapped: WrappedAsset[];
  canonicalSymbol: string;
  metadata: RelationshipMetadata;
}

export interface RelationshipMetadata {
  priceFeedId?: string;
  coingeckoId?: string;
  logoUrl?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetLookupResult {
  found: boolean;
  relationship?: AssetRelationship;
  matchedOn: 'native' | 'wrapped' | 'symbol' | null;
}

export interface RelationshipEngineStats {
  totalRelationships: number;
  chainCoverage: AssetChain[];
  nativeAssetCount: number;
  wrappedAssetCount: number;
}
