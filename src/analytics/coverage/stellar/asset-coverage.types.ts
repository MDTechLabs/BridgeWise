export interface Asset {
  id: string;
  name: string;
  // Add any other relevant asset properties here
}

export interface Route {
  sourceAsset: Asset;
  destinationAsset: Asset;
  // Add any other relevant route properties here
}

export interface CoverageReport {
  supportedAssets: Asset[];
  unsupportedAssets: Asset[];
  coveragePercentage: number;
}