import { useState, useCallback, useEffect } from 'react';
import { useWalletConnections } from '../useWalletConnections';
import type { UseNetworkSwitcherReturn, ChainId, WalletError } from '../../wallet/types';

export function useNetworkSwitcher(): UseNetworkSwitcherReturn {
  const { activeWallet } = useWalletConnections();
  const [currentNetwork, setCurrentNetwork] = useState<ChainId | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<WalletError | null>(null);
  const [supportedNetworks, setSupportedNetworks] = useState<ChainId[]>([]);

  useEffect(() => {
    if (activeWallet) {
      setCurrentNetwork(
        activeWallet.accounts[activeWallet.activeAccountIndex]?.chainId || null
      );
      setSupportedNetworks(activeWallet.wallet.supportedChains);
    } else {
      setCurrentNetwork(null);
      setSupportedNetworks([]);
    }
  }, [activeWallet]);

  const switchNetwork = useCallback(
    async (targetChain: ChainId) => {
      setIsSwitching(true);
      setError(null);
      try {
        if (!activeWallet) throw { code: 'NOT_CONNECTED', message: 'No wallet connected' };
        if (!activeWallet.wallet.supportedChains.includes(targetChain)) {
          throw { code: 'NETWORK_NOT_SUPPORTED', message: 'Target chain not supported by wallet' };
        }
        await activeWallet.wallet.switchNetwork(targetChain);
        setCurrentNetwork(targetChain);
      } catch (err: any) {
        setError(err);
      } finally {
        setIsSwitching(false);
      }
    },
    [activeWallet]
  );

  return {
    currentNetwork,
    switchNetwork,
    isSwitching,
    error,
    supportedNetworks,
  };
}
