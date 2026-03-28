import { PollingConfigService } from './polling-config.service';

// ---------------------------------------------------------------------------
// Minimal ConfigService stub
// ---------------------------------------------------------------------------

const makeConfigService = (env: Record<string, string | undefined> = {}) => ({
  get: (key: string) => env[key],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PollingConfigService', () => {
  it('should return default values when no env vars are set', () => {
    const service = new PollingConfigService(makeConfigService() as any);

    expect(service.get('quoteRefreshMs')).toBe(10_000);
    expect(service.get('statusPollMs')).toBe(5_000);
    expect(service.get('benchmarkAggregationMs')).toBe(60_000);
    expect(service.get('staleTransactionCheckMs')).toBe(30_000);
  });

  it('should use env var values when provided', () => {
    const service = new PollingConfigService(
      makeConfigService({
        POLLING_QUOTE_REFRESH_MS: '3000',
        POLLING_STATUS_POLL_MS: '1500',
        POLLING_BENCHMARK_AGGREGATION_MS: '120000',
        POLLING_STALE_TRANSACTION_MS: '45000',
      }) as any,
    );

    expect(service.get('quoteRefreshMs')).toBe(3_000);
    expect(service.get('statusPollMs')).toBe(1_500);
    expect(service.get('benchmarkAggregationMs')).toBe(120_000);
    expect(service.get('staleTransactionCheckMs')).toBe(45_000);
  });

  it('should fall back to default when env var is not a valid number', () => {
    const service = new PollingConfigService(
      makeConfigService({ POLLING_QUOTE_REFRESH_MS: 'not-a-number' }) as any,
    );

    expect(service.get('quoteRefreshMs')).toBe(10_000);
  });

  it('should fall back to default when env var is zero or negative', () => {
    const service = new PollingConfigService(
      makeConfigService({ POLLING_STATUS_POLL_MS: '0' }) as any,
    );

    expect(service.get('statusPollMs')).toBe(5_000);
  });

  it('getAll() should return a frozen snapshot of all intervals', () => {
    const service = new PollingConfigService(makeConfigService() as any);
    const all = service.getAll();

    expect(Object.isFrozen(all)).toBe(true);
    expect(all).toHaveProperty('quoteRefreshMs');
    expect(all).toHaveProperty('statusPollMs');
    expect(all).toHaveProperty('benchmarkAggregationMs');
    expect(all).toHaveProperty('staleTransactionCheckMs');
  });

  it('getAll() snapshot should not mutate the service state', () => {
    const service = new PollingConfigService(makeConfigService() as any);
    const snapshot = service.getAll() as any;

    expect(() => {
      snapshot.quoteRefreshMs = 999;
    }).toThrow();

    expect(service.get('quoteRefreshMs')).toBe(10_000);
  });
});