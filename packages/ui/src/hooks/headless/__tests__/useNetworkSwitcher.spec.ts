import { renderHook, act } from '@testing-library/react-hooks';
import { useNetworkSwitcher } from '../useNetworkSwitcher';

describe('useNetworkSwitcher', () => {
  it('returns null if no wallet', () => {
    const { result } = renderHook(() => useNetworkSwitcher());
    expect(result.current.currentNetwork).toBeNull();
    expect(Array.isArray(result.current.supportedNetworks)).toBe(true);
  });
  // Add more tests for switching, error handling, etc.
});
