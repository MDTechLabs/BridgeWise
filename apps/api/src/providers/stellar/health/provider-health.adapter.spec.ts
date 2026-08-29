import {
  GenericProviderHealthAdapter,
  ProviderHealthService,
  ProviderAvailability,
} from './provider-health.adapter';

describe('GenericProviderHealthAdapter', () => {
  it('normalizes an available provider response', async () => {
    const adapter = new GenericProviderHealthAdapter(
      'stellarx',
      async () => ({ ok: true }),
      (raw) => ({ available: raw.ok }),
    );
    const h = await adapter.checkHealth();
    expect(h.providerId).toBe('stellarx');
    expect(h.availability).toBe(ProviderAvailability.AVAILABLE);
    expect(h.latencyMs).not.toBeNull();
  });

  it('normalizes an unavailable provider response', async () => {
    const adapter = new GenericProviderHealthAdapter(
      'p',
      async () => ({ status: 'down' }),
      (raw) => ({ available: raw.status === 'up' }),
    );
    expect((await adapter.checkHealth()).availability).toBe(ProviderAvailability.UNAVAILABLE);
  });

  it('captures failures safely as UNAVAILABLE', async () => {
    const adapter = new GenericProviderHealthAdapter(
      'p',
      async () => {
        throw new Error('network');
      },
      () => ({ available: true }),
    );
    const h = await adapter.checkHealth();
    expect(h.availability).toBe(ProviderAvailability.UNAVAILABLE);
    expect(h.error).toMatch(/network/);
  });

  it('marks a provider DEGRADED when the normalizer flags it', async () => {
    const adapter = new GenericProviderHealthAdapter(
      'p',
      async () => ({}),
      () => ({ available: true, degraded: true }),
    );
    expect((await adapter.checkHealth()).availability).toBe(ProviderAvailability.DEGRADED);
  });
});

describe('ProviderHealthService', () => {
  it('aggregates adapter results and exposes available providers', async () => {
    const svc = new ProviderHealthService();
    svc.register(new GenericProviderHealthAdapter('up', async () => ({}), () => ({ available: true })));
    svc.register(new GenericProviderHealthAdapter('down', async () => ({}), () => ({ available: false })));

    const results = await svc.checkAll();
    expect(results).toHaveLength(2);
    expect(svc.getAvailableProviders()).toEqual(['up']);
    expect(svc.getStatus('down')?.availability).toBe(ProviderAvailability.UNAVAILABLE);
  });
});
