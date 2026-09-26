import {
  BridgeabilityParams,
  BridgeabilityResult,
  SupportedChain,
} from './stellar-bridgeability.types';
import { STELLAR_SUPPORTED_BRIDGE_MATRIX } from './stellar-bridgeability.config';

export class StellarBridgeabilityChecker {
  /**
   * Validates whether a given Stellar asset can be bridged between source and target chains.
   */
  public check(params: BridgeabilityParams): BridgeabilityResult {
    const { asset, sourceChain, targetChain } = params;

    // 1. Validate Source / Target chains are distinct
    if (sourceChain === targetChain) {
      return {
        isBridgeable: false,
        reason: 'Source and target chains must be different.',
      };
    }

    // 2. Validate Source is Stellar or Soroban
    if (sourceChain !== 'stellar' && sourceChain !== 'soroban') {
      return {
        isBridgeable: false,
        reason: `Unsupported source chain '${sourceChain}' for Stellar bridgeability checker.`,
      };
    }

    // 3. Lookup Asset in matrix
    const assetConfig = STELLAR_SUPPORTED_BRIDGE_MATRIX[asset.code.toUpperCase()];
    if (!assetConfig) {
      return {
        isBridgeable: false,
        reason: `Asset '${asset.code}' is not supported for bridging.`,
      };
    }

    // 4. Validate Issuer if asset is not native XLM
    if (asset.code.toUpperCase() !== 'XLM') {
      if (!asset.issuer) {
        return {
          isBridgeable: false,
          reason: `Issuer address is required for non-native asset '${asset.code}'.`,
        };
      }

      if (
        assetConfig.allowedIssuers &&
        !assetConfig.allowedIssuers.includes(asset.issuer)
      ) {
        return {
          isBridgeable: false,
          reason: `Issuer '${asset.issuer}' is not verified for bridging '${asset.code}'.`,
        };
      }
    }

    // 5. Check Target Chain Compatibility
    const isTargetSupported = assetConfig.targetChains.includes(targetChain);
    if (!isTargetSupported) {
      return {
        isBridgeable: false,
        reason: `Bridging '${asset.code}' from '${sourceChain}' to '${targetChain}' is not supported.`,
        supportedChains: assetConfig.targetChains,
      };
    }

    return {
      isBridgeable: true,
      supportedChains: assetConfig.targetChains,
    };
  }
}