export interface StellarAsset {
  symbol: string;
  name: string;
  issuer: string | null;
  decimals: number;
  isNative: boolean;
  supportedChains: string[];
  logoUrl: string | null;
}
