import React from 'react';
import { useMultiWalletContext } from './MultiWalletProvider';

export const WalletConnector: React.FC = () => {
  const {
    wallets,
    connectWallet,
    disconnectWallet,
    switchAccount,
    activeAccount,
    activeWallet,
    error,
  } = useMultiWalletContext();

  // Placeholder UI for demo
  return (
    <div>
      <h3>Wallet Connections</h3>
      <ul>
        {wallets.map((w, i) => (
          <li key={w.walletType + i}>
            <strong>{w.walletType}</strong> - Connected: {w.connected ? 'Yes' : 'No'}
            <ul>
              {w.accounts.map((acc, idx) => (
                <li key={acc.address}>
                  {acc.address} {w.activeAccountIndex === idx ? '(Active)' : ''}
                  <button onClick={() => switchAccount(acc)}>Switch</button>
                </li>
              ))}
            </ul>
            <button onClick={() => disconnectWallet(w.walletType)}>Disconnect</button>
          </li>
        ))}
      </ul>
      <button onClick={() => connectWallet('metamask')}>Connect MetaMask</button>
      <button onClick={() => connectWallet('stellar')}>Connect Stellar</button>
      <div>Active Account: {activeAccount ? activeAccount.address : 'None'}</div>
      {error && <div style={{ color: 'red' }}>Error: {error.message}</div>}
    </div>
  );
};
