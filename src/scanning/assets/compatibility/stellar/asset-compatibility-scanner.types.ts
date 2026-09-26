export interface AssetCompatibilityResult {
  routeId: string;
  compatible: boolean;
  sourceAsset: StellarAsset | null;
  sourceAssetValid: boolean;
  destinationAsset: string | null;
  destinationAssetValid: boolean;
  issues: string[];
  scannedAt: Date;
}

export interface StellarAsset {
  code: string;
  issuer?: string;
}

export interface AssetCompatibilityScannerConfig {
  supportedSourceAssets?: StellarAsset[];
  supportedDestinationAssets?: string[];
}
