export interface Asset {
  /** Asset code, e.g. "USDC" or "XLM". */
  code: string;
  /** Issuer account for non-native assets. Omitted for the native asset. */
  issuer?: string;
}

/** Canonical identity for an asset, used as a graph node key. */
export function assetId(asset: Asset): string {
  return asset.issuer ? `${asset.code}:${asset.issuer}` : `${asset.code}`;
}

export interface TransferPath {
  path: Asset[];
  hops: number;
}

export enum PathResolutionCode {
  UNSUPPORTED_SOURCE = 'UNSUPPORTED_SOURCE',
  UNSUPPORTED_DESTINATION = 'UNSUPPORTED_DESTINATION',
  NO_PATH = 'NO_PATH',
}

export interface PathResolutionResult {
  resolved: boolean;
  paths: TransferPath[];
  reason?: PathResolutionCode;
}
