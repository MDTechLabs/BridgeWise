import { SupportedChain } from './stellar-bridgeability.types';

// Map of asset codes to destination chain capabilities
export const STELLAR_SUPPORTED_BRIDGE_MATRIX: Record<
  string,
  { allowedIssuers?: string[]; targetChains: SupportedChain[] }
> = {
  XLM: {
    targetChains: ['ethereum', 'polygon', 'solana', 'soroban'],
  },
  USDC: {
    // Circle USDC Stellar Issuer ID
    allowedIssuers: ['GA5ZSEJYB37JRC5AVCI5M4GE323A5452364455533333333333333333'],
    targetChains: ['ethereum', 'polygon', 'solana'],
  },
};