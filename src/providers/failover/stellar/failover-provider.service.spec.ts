import { StellarBridgeFailoverProvider } from './failover-provider.service';

const providers = [
  { name: 'primary', url: 'https://primary.example/rpc', priority: 1 },
  { name: 'secondary', url: 'https://secondary.example/rpc', priority: 2 },
];

describe('StellarBridgeFailoverProvider', () => {
  it('uses the primary provider when it succeeds', async () => {
    const failover = new StellarBridgeFailoverProvider(providers);
    const result = await failover.execute(async (provider) => provider.name, {
      idempotent: true,
    });

    expect(result.provider.name).toBe('primary');
    expect(result.value).toBe('primary');
    expect(result.failedProviders).toEqual([]);
  });

  it('fails over after an idempotent request fails', async () => {
    const failover = new StellarBridgeFailoverProvider(providers, {
      failureThreshold: 1,
    });
    const calls: string[] = [];

    const result = await failover.execute(async (provider) => {
      calls.push(provider.name);
      if (provider.name === 'primary') throw new Error('primary unavailable');
      return 'ledger';
    }, { idempotent: true });

    expect(calls).toEqual(['primary', 'secondary']);
    expect(result.provider.name).toBe('secondary');
    expect(result.failedProviders).toEqual(['primary']);
    expect(failover.getCircuitStatuses()[0].state).toBe('open');
  });

  it('does not replay a non-idempotent operation on a secondary', async () => {
    const failover = new StellarBridgeFailoverProvider(providers);
    const calls: string[] = [];

    await expect(failover.execute(async (provider) => {
      calls.push(provider.name);
      throw new Error('submission response lost');
    }, { idempotent: false })).rejects.toThrow('submission response lost');

    expect(calls).toEqual(['primary']);
  });

  it('aborts a timed-out attempt and advances to the next provider', async () => {
    const failover = new StellarBridgeFailoverProvider(providers, {
      timeoutMs: 1,
      failureThreshold: 1,
    });
    let primarySignal: AbortSignal | undefined;

    const result = await failover.execute(async (provider, { signal }) => {
      if (provider.name === 'primary') {
        primarySignal = signal;
        return new Promise<string>(() => {});
      }
      return 'secondary response';
    }, { idempotent: true });

    expect(primarySignal?.aborted).toBe(true);
    expect(result.provider.name).toBe('secondary');
    expect(result.value).toBe('secondary response');
  });

  it('allows one recovery trial after the circuit cooldown', async () => {
    let now = 10;
    const failover = new StellarBridgeFailoverProvider(providers, {
      failureThreshold: 1,
      resetTimeoutMs: 100,
      now: () => now,
    });

    await failover.execute(async () => {
      throw new Error('provider unavailable');
    }, { idempotent: true });

    expect(failover.getCircuitStatuses()[0].state).toBe('open');
    now += 100;
    expect(failover.getCircuitStatuses()[0].state).toBe('half_open');
    const result = await failover.execute(async (provider) => provider.name, {
      idempotent: true,
    });

    expect(result.provider.name).toBe('primary');
    expect(failover.getCircuitStatuses()[0]).toMatchObject({
      consecutiveFailures: 0,
      state: 'closed',
      retryAt: null,
    });
  });
});