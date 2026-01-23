/**
 * @bridgewise/stellar-adapter
 * Stellar/Soroban bridge adapter with Freighter wallet integration
 */

import { FreighterProvider } from './wallet/FreighterProvider';
import { BridgeContract } from './contracts/BridgeContract';
import { StellarBridgeExecutor } from './executor/BridgeExecutor';

// Wallet exports
export { FreighterProvider } from './wallet/FreighterProvider';
export type {
  WalletConnection,
  SignedTransaction,
  AccountBalance,
} from './wallet/FreighterProvider';

// Contract exports
export { BridgeContract } from './contracts/BridgeContract';
export type {
  BridgeContractConfig,
  BridgeOperationParams,
  BridgeOperationResult,
} from './contracts/BridgeContract';

// Executor exports
export { StellarBridgeExecutor } from './executor/BridgeExecutor';
export type {
  BridgeTransactionDetails,
  TransferExecutionResult,
  TransferOptions,
} from './executor/BridgeExecutor';

/**
 * Create a complete Stellar bridge adapter instance
 * @param rpcUrl Soroban RPC endpoint URL
 * @param horizonUrl Horizon API endpoint URL
 * @param contractId Bridge contract address
 * @param network Target network
 * @returns Configured bridge executor ready for use
 */
export function createStellarAdapter(
  rpcUrl: string = 'https://soroban-rpc.mainnet.stellar.org',
  horizonUrl: string = 'https://horizon.stellar.org',
  contractId: string,
  network: 'mainnet' | 'testnet' = 'mainnet'
) {
  const wallet = new FreighterProvider(rpcUrl, horizonUrl);

  const bridgeContract = new BridgeContract({
    contractId,
    rpcUrl,
    networkPassphrase: network === 'mainnet' ? 'Public Global Stellar Network ; September 2015' : 'Test SDF Network ; September 2015',
  });

  return new StellarBridgeExecutor(wallet, bridgeContract, horizonUrl);
}

// Version export
export const version = '0.1.0';
