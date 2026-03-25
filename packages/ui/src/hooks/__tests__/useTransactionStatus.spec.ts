import { renderHook, act } from '@testing-library/react-hooks';
import { useTransactionStatus, UseTransactionStatusOptions } from '../useTransactionStatus';
import type { BridgeTransactionStatus } from '../../transaction-history/types';

describe('useTransactionStatus', () => {
  let originalEventSource: any;
  let eventSources: any[];

  beforeEach(() => {
    // capture the original so we can restore later
    originalEventSource = (global as any).EventSource;
    eventSources = [];

    // simple fake EventSource implementation
    class FakeEventSource {
      onmessage: ((evt: any) => void) | null = null;
      onerror: ((evt: any) => void) | null = null;
      constructor(public url: string) {
        eventSources.push(this);
      }
      close() {
        // nothing
      }
    }

    (global as any).EventSource = FakeEventSource;

    // default fetch mock
    (global as any).fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'pending' }) }),
    );
  });

  afterEach(() => {
    (global as any).EventSource = originalEventSource;
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  it('returns null status initially and does not crash on server', () => {
    const { result } = renderHook(() => useTransactionStatus(null));
    expect(result.current.status).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('is SSR-safe when window is undefined', () => {
    const prev = (global as any).window;
    // @ts-ignore remove window
    delete (global as any).window;
    const { result } = renderHook(() => useTransactionStatus('tx', {}));
    expect(result.current.status).toBeNull();
    expect(result.current.loading).toBe(false);
    (global as any).window = prev;
  });

  it('subscribes to SSE and updates status on message', () => {
    const { result } = renderHook(() => useTransactionStatus('tx123'));

    expect(eventSources.length).toBe(1);
    act(() => {
      eventSources[0].onmessage({ data: JSON.stringify({ status: 'confirmed' }) });
    });
    expect(result.current.status).toBe('confirmed');
    expect(result.current.loading).toBe(false);
  });

  it('calls onStatusChange callback and notifications handler', () => {
    const changes: BridgeTransactionStatus[] = [];
    const notifs: BridgeTransactionStatus[] = [];
    const options: UseTransactionStatusOptions = {
      onStatusChange: (s) => changes.push(s),
      notifications: (s) => notifs.push(s),
    };
    renderHook(() => useTransactionStatus('txABC', options));
    act(() => {
      eventSources[0].onmessage({ data: JSON.stringify({ status: 'failed' }) });
    });
    expect(changes).toEqual(['failed']);
    expect(notifs).toEqual(['failed']);
  });

  it('maps unknown statuses to pending', () => {
    const { result } = renderHook(() => useTransactionStatus('txUnknown'));
    act(() => {
      eventSources[0].onmessage({ data: JSON.stringify({ status: 'in-progress' }) });
    });
    expect(result.current.status).toBe('pending');
  });

  it('updates history storage when status changes', () => {
    const backend = {
      saveTransaction: jest.fn(() => Promise.resolve()),
      getTransactionsByAccount: jest.fn(() => Promise.resolve([])),
    } as any;
    const { result } = renderHook(() =>
      useTransactionStatus('txHistory', {
        historyConfig: { backend },
        account: 'acct1',
      }),
    );

    act(() => {
      eventSources[0].onmessage({ data: JSON.stringify({ status: 'confirmed' }) });
    });

    // storage should have been called with at least the status and account
    expect(backend.saveTransaction).toHaveBeenCalled();
  });

  it('falls back to polling when SSE errors', async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useTransactionStatus('txpoll', { pollingIntervalMs: 100 }));
    // trigger error to force polling
    act(() => {
      eventSources[0].onerror && eventSources[0].onerror(new Event('error'));
    });

    // verify fetch gets called immediately and eventually
    expect((global as any).fetch).toHaveBeenCalledWith('/transactions/txpoll/poll');
    // make fetch return confirmed status next time
    (global as any).fetch.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'confirmed' }) }),
    );
    // advance timers to run polling interval
    await act(async () => {
      jest.advanceTimersByTime(150);
      // wait for promise resolution
      await Promise.resolve();
    });

    expect(result.current.status).toBe('confirmed');
  });
});
