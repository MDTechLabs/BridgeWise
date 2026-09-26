export type SupportedChain = 'stellar' | 'ethereum' | 'polygon' | 'solana' | 'soroban';

export interface AssetIdentifier {
  code: string; // e.g. 'XLM', 'USDC'
  issuer?: string; // Stellar public key for non-native assets, optional for native XLM
}

export interface BridgeabilityParams {
  asset: AssetIdentifier;
  sourceChain: SupportedChain;
  targetChain: SupportedChain;
}

export interface BridgeabilityResult {
  isBridgeable: boolean;
  reason?: string;
  supportedChains?: SupportedChain[];
}