import { renderHook, act } from '@testing-library/react-hooks';
import { useWalletConnections } from '../useWalletConnections';

describe('useWalletConnections', () => {
  it('should initialize with empty wallets', () => {
    const { result } = renderHook(() => useWalletConnections());
    expect(result.current.wallets).toEqual([]);
    expect(result.current.activeAccount).toBeNull();
    expect(result.current.error).toBeNull();
  });

  // Add more tests for connectWallet, disconnectWallet, switchAccount, error handling, etc.
});
