import { ProviderRateLimitService } from './provider-rate-limit.service';

describe('ProviderRateLimitService', () => {
  let clock: number;
  let svc: ProviderRateLimitService;
  beforeEach(() => {
    clock = 1000;
    svc = new ProviderRateLimitService(() => clock);
  });

  it('treats unconfigured providers as unlimited', () => {
    const r = svc.tryAcquire('anon');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(Infinity);
  });

  it('allows requests up to the configured limit', () => {
    svc.configure('p', { limit: 2, windowMs: 1000 });
    expect(svc.tryAcquire('p').allowed).toBe(true);
    expect(svc.tryAcquire('p').allowed).toBe(true);
    const third = svc.tryAcquire('p');
    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });

  it('resets after the window elapses', () => {
    svc.configure('p', { limit: 1, windowMs: 1000 });
    expect(svc.tryAcquire('p').allowed).toBe(true);
    expect(svc.tryAcquire('p').allowed).toBe(false);
    clock += 1000; // advance past the window
    expect(svc.tryAcquire('p').allowed).toBe(true);
  });

  it('backs off immediately when a provider reports rate limiting', () => {
    svc.configure('p', { limit: 5, windowMs: 1000 });
    svc.registerRateLimited('p');
    expect(svc.tryAcquire('p').allowed).toBe(false);
    expect(svc.remaining('p')).toBe(0);
  });

  it('rejects invalid configuration', () => {
    expect(() => svc.configure('p', { limit: 0, windowMs: 1000 })).toThrow();
  });
});
