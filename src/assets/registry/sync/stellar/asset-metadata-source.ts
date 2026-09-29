import { AssetMetadataSource, StellarAssetMetadataInput } from './types';

/**
 * A metadata source backed by an in-memory list of assets.
 *
 * Useful for configuration-driven setups and tests, and as a reference
 * implementation of `AssetMetadataSource`.
 */
export class StaticAssetMetadataSource implements AssetMetadataSource {
  constructor(
    public readonly name: string,
    private readonly assets: StellarAssetMetadataInput[],
  ) {}

  async fetchAssets(): Promise<StellarAssetMetadataInput[]> {
    return this.assets.map((asset) => ({
      ...asset,
      tags: asset.tags ? [...asset.tags] : undefined,
      metadata: asset.metadata ? { ...asset.metadata } : undefined,
    }));
  }
}

/**
 * A metadata source that delegates to a caller-provided async loader.
 */
export class HttpAssetMetadataSource implements AssetMetadataSource {
  constructor(
    public readonly name: string,
    private readonly loader: () => Promise<StellarAssetMetadataInput[]>,
  ) {}

  async fetchAssets(): Promise<StellarAssetMetadataInput[]> {
    return this.loader();
  }
}
