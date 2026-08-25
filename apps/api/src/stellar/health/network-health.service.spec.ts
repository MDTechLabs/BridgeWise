import { NetworkHealthService } from './network-health.service';
import { HealthStatus, NetworkEndpoint } from './network-health.types';

const rpcA: NetworkEndpoint = { id: 'a', url: 'https://a.example' };
const rpcB: NetworkEndpoint = { id: 'b', url: 'https://b.example' };

describe('NetworkHealthService', () => {
  it('marks a fast endpoint HEALTHY and records latency', async () => {
    const svc = new NetworkHealthService(async () => 120, { degradedLatencyMs: 1000 });
    const h = await svc.check(rpcA);
    expect(h.status).toBe(HealthStatus.HEALTHY);
    expect(h.latencyMs).toBe(120);
    expect(svc.isHealthy('a')).toBe(true);
  });

  it('marks a slow endpoint DEGRADED', async () => {
    const svc = new NetworkHealthService(async () => 1500, { degradedLatencyMs: 1000 });
    const h = await svc.check(rpcA);
    expect(h.status).toBe(HealthStatus.DEGRADED);
  });

  it('marks a failing endpoint UNAVAILABLE and captures the error', async () => {
    const svc = new NetworkHealthService(async () => {
      throw new Error('ECONNREFUSED');
    });
    const h = await svc.check(rpcA);
    expect(h.status).toBe(HealthStatus.UNAVAILABLE);
    expect(h.latencyMs).toBeNull();
    expect(h.error).toMatch(/ECONNREFUSED/);
  });

  it('checkAll returns health for every endpoint and exposes usable ones', async () => {
    const probe = async (e: NetworkEndpoint) => {
      if (e.id === 'b') throw new Error('down');
      return 100;
    };
    const svc = new NetworkHealthService(probe);
    const results = await svc.checkAll([rpcA, rpcB]);
    expect(results).toHaveLength(2);
    const healthy = svc.getHealthyEndpoints();
    expect(healthy.map((h) => h.id)).toEqual(['a']);
  });
});
