/**
 * Chain Configuration for BridgeWise
 * Now uses dynamic loading from configuration files and environment variables
 */

export { ChainConfig } from './chain-config-schema';
export { DynamicChainConfigLoader } from './dynamic-chain-loader';

import { DynamicChainConfigLoader } from './dynamic-chain-loader';
import { ChainConfig } from './chain-config-schema';

/**
 * Get all supported chains
 * Dynamically loaded from config files and environment variables
 */
export function getAllChains(): ChainConfig[] {
  return DynamicChainConfigLoader.loadChains({
    fromJson: true,
    fromEnv: true,
    skipValidation: false,
  });
}

/**
 * Get chain by ID
 */
export function getChainById(chainId: string): ChainConfig | undefined {
  return DynamicChainConfigLoader.getChainById(chainId);
}

/**
 * Get EVM chain by numeric chainId
 */
export function getEVMChainByChainId(numericChainId: number): ChainConfig | undefined {
  return DynamicChainConfigLoader.getEVMChainByChainId(numericChainId);
}

/**
 * Check if chain is EVM
 */
export function isEVMChain(chainId: string): boolean {
  const chain = DynamicChainConfigLoader.getChainById(chainId);
  return chain ? chain.type === 'EVM' : false;
}

/**
 * Check if chain is Stellar
 */
export function isStellarChain(chainId: string): boolean {
  const chain = DynamicChainConfigLoader.getChainById(chainId);
  return chain ? chain.type === 'Stellar' : false;
}

/**
 * Get supported source chains for bridging
 */
export function getSupportedSourceChains(): ChainConfig[] {
  return getAllChains().filter(chain => chain.features.supportsBridging);
}

/**
 * Get supported destination chains for a given source chain
 */
export function getSupportedDestinationChains(sourceChainId: string): ChainConfig[] {
  const sourceChain = getChainById(sourceChainId);
  if (!sourceChain) {
    return [];
  }
  
  // For now, all chains can bridge to each other
  // In production, you may want to restrict certain combinations
  return getAllChains().filter(
    chain => chain.id !== sourceChainId && chain.features.supportsBridging
  );
}

/**
 * Validate chain combination
 */
export function isValidBridgePair(
  sourceChainId: string,
  destinationChainId: string
): { valid: boolean; error?: string } {
  const sourceChain = getChainById(sourceChainId);
  const destChain = getChainById(destinationChainId);
  
  if (!sourceChain) {
    return {
      valid: false,
      error: `Unsupported source chain: ${sourceChainId}`,
    };
  }
  
  if (!destChain) {
    return {
      valid: false,
      error: `Unsupported destination chain: ${destinationChainId}`,
    };
  }
  
  if (!sourceChain.features.supportsBridging) {
    return {
      valid: false,
      error: `Source chain ${sourceChainId} does not support bridging`,
    };
  }
  
  if (!destChain.features.supportsBridging) {
    return {
      valid: false,
      error: `Destination chain ${destinationChainId} does not support bridging`,
    };
  }
  
  if (sourceChainId === destinationChainId) {
    return {
      valid: false,
      error: 'Source and destination chains must be different',
    };
  }
  
  return { valid: true };
}

/**
 * Get chain RPC URL
 */
export function getChainRpcUrl(chainId: string): string | undefined {
  const chain = getChainById(chainId);
  return chain?.rpcUrl;
}

/**
 * Get chain explorer URL
 */
export function getChainExplorerUrl(chainId: string): string | undefined {
  const chain = getChainById(chainId);
  return chain?.explorerUrl;
}

/**
 * Build explorer URL for transaction
 */
export function getTransactionExplorerUrl(
  chainId: string,
  txHash: string
): string | undefined {
  const chain = getChainById(chainId);
  if (!chain) {
    return undefined;
  }
  
  return `${chain.explorerUrl}/tx/${txHash}`;
}

/**
 * Build explorer URL for address
 */
export function getAddressExplorerUrl(
  chainId: string,
  address: string
): string | undefined {
  const chain = getChainById(chainId);
  if (!chain) {
    return undefined;
  }
  
  if (chain.type === 'EVM') {
    return `${chain.explorerUrl}/address/${address}`;
  } else if (chain.type === 'Stellar') {
    return `${chain.explorerUrl}/account/${address}`;
  }
  
  return undefined;
}
