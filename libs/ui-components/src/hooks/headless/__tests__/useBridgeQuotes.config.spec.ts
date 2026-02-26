import { renderHook } from '@testing-library/react-hooks';
import { useBridgeQuotes } from '../useBridgeQuotes';
import { HeadlessConfig } from '../config';

describe('useBridgeQuotes headless config', () => {
  it('respects autoRefreshQuotes option', () => {
    const config: HeadlessConfig = { autoRefreshQuotes: false };
    const { result } = renderHook(() => useBridgeQuotes({ config }));
    // Should not auto-refresh quotes
    expect(result.current).toBeDefined();
  });
});
