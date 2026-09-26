export interface StellarAssetMetadata {
  assetCode: string;
  issuer?: string;
  network: string;
  normalizedAsset: string;
  decimals?: number;
  source?: string;
}

export interface StellarAssetMetadataResolverConfig {
  cacheTtlMs?: number;
}

export class StellarAssetMetadataResolver {
  private readonly cache = new Map<string, StellarAssetMetadata>();
  private readonly config: Required<StellarAssetMetadataResolverConfig>;

  constructor(config: StellarAssetMetadataResolverConfig = {}) {
    this.config = {
      cacheTtlMs: config.cacheTtlMs ?? 5 * 60 * 1000,
    };
  }

  normalizeAssetIdentifier(
    assetCode: string,
    issuer?: string,
    network = 'public',
  ): string {
    return `${network}:${(assetCode ?? '').trim().toUpperCase()}:${(issuer ?? '').trim()}`;
  }

  resolve(
    assetCode: string,
    issuer?: string,
    network = 'public',
    overrides: Partial<StellarAssetMetadata> = {},
  ): StellarAssetMetadata {
    const normalizedCode = (assetCode ?? '').trim();
    if (!normalizedCode) {
      throw new Error('Asset code is required');
    }

    if (issuer && !this.isValidIssuer(issuer)) {
      throw new Error('Invalid issuer information');
    }

    const identifier = this.normalizeAssetIdentifier(
      normalizedCode,
      issuer,
      network,
    );
    const cached = this.cache.get(identifier);
    if (cached) {
      return { ...cached };
    }

    const metadata: StellarAssetMetadata = {
      assetCode: normalizedCode.toUpperCase(),
      issuer: issuer?.trim() || undefined,
      network,
      normalizedAsset: normalizedCode.toUpperCase(),
      decimals: overrides.decimals ?? 7,
      source: overrides.source ?? 'resolver',
      ...overrides,
    };

    this.cache.set(identifier, metadata);
    return { ...metadata };
  }

  getCached(
    assetCode: string,
    issuer?: string,
    network = 'public',
  ): StellarAssetMetadata | null {
    const identifier = this.normalizeAssetIdentifier(
      assetCode,
      issuer,
      network,
    );
    const metadata = this.cache.get(identifier);
    if (!metadata) {
      return null;
    }

    return { ...metadata };
  }

  clearCache(): void {
    this.cache.clear();
  }

  private isValidIssuer(issuer: string): boolean {
    const normalized = issuer.trim();
    return normalized.length > 0 && /^G[A-Z2-7]{55,64}$/.test(normalized);
  }
}
