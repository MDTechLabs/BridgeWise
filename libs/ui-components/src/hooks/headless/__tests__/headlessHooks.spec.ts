import { renderHook, act } from '@testing-library/react-hooks';
import { useBridgeQuotes } from '../headless/useBridgeQuotes';
import { useBridgeValidation } from '../headless/useBridgeValidation';
import { useBridgeExecution } from '../headless/useBridgeExecution';

describe('Headless BridgeWise Hooks', () => {
  it('validates unsupported token', () => {
    const { result } = renderHook(() => useBridgeValidation('FAKE', 'stellar', 'ethereum'));
    expect(result.current.isValid).toBe(false);
    expect(result.current.errors.length).toBeGreaterThan(0);
  });

  it('fetches quotes (mock)', async () => {
    const { result } = renderHook(() => useBridgeQuotes({ initialParams: { sourceChain: 'stellar', destinationChain: 'ethereum', sourceToken: 'USDC', destinationToken: 'USDC', amount: '100' } }));
    expect(Array.isArray(result.current.quotes)).toBe(true);
  });

  it('executes bridge transaction (mock)', async () => {
    const { result } = renderHook(() => useBridgeExecution());
    act(() => {
      result.current.start({});
    });
    expect(result.current.status).toBe('pending');
    // Simulate time passing for confirmation
    await new Promise((r) => setTimeout(r, 1600));
    expect(result.current.status).toBe('confirmed');
  });
});
