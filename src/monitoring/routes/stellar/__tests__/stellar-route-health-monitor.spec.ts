import { StellarRouteHealthMonitor } from '../stellar-route-health-monitor';

describe('StellarRouteHealthMonitor', () => {
  let monitor: StellarRouteHealthMonitor;

  beforeEach(() => {
    monitor = new StellarRouteHealthMonitor({
      timeoutMs: 10,
      unhealthyThreshold: 2,
      degradedAvailabilityThreshold: 0.7,
    });
  });

  afterEach(() => {
    monitor.reset();
  });

  it('registers routes and marks healthy probes as healthy', async () => {
    monitor.registerRoute('route-healthy', async () => ({
      available: true,
      availability: 0.95,
      latencyMs: 120,
    }));

    await monitor.checkAll();

    const state = monitor.getRouteHealth('route-healthy');
    expect(state).not.toBeNull();
    expect(state?.status).toBe('healthy');
    expect(state?.availability).toBe(0.95);
    expect(monitor.isRouteDisabled('route-healthy')).toBe(false);
  });

  it('marks a route as outage after repeated failures', async () => {
    monitor.registerRoute('route-unavailable', async () => ({
      available: false,
      errorMessage: 'route unreachable',
    }));

    await monitor.checkAll();
    expect(monitor.getRouteHealth('route-unavailable')?.status).toBe('unhealthy');

    await monitor.checkAll();
    expect(monitor.getRouteHealth('route-unavailable')?.status).toBe('outage');
    expect(monitor.isRouteDisabled('route-unavailable')).toBe(true);
  });

  it('emits outage and recovery events when route health changes', async () => {
    const events: string[] = [];

    monitor.on('outage', () => events.push('outage'));
    monitor.on('recovered', () => events.push('recovered'));

    let healthy = false;
    monitor.registerRoute('route-switch', async () => {
      return healthy
        ? { available: true, availability: 0.95 }
        : { available: false, errorMessage: 'temporary failure' };
    });

    await monitor.checkAll();
    await monitor.checkAll();
    expect(events).toContain('outage');

    healthy = true;
    await monitor.checkAll();
    expect(events).toContain('recovered');
  });

  it('detects degradation due to high latency', async () => {
    const monitorHighLatency = new StellarRouteHealthMonitor({
      latencyThresholdMs: 100,
    });

    monitorHighLatency.registerRoute('route-slow', async () => ({
      available: true,
      latencyMs: 150,
    }));

    await monitorHighLatency.checkAll();

    const state = monitorHighLatency.getRouteHealth('route-slow');
    expect(state?.status).toBe('degraded');
  });

  it('generates alerts and handles resolution', async () => {
    const alerts: any[] = [];
    const resolutions: any[] = [];

    monitor.on('alert', (a) => alerts.push(a));
    monitor.on('alert_resolved', (r) => resolutions.push(r));

    let healthy = false;
    monitor.registerRoute('route-alert-test', async () => {
      return healthy
        ? { available: true, latencyMs: 5 }
        : { available: false, errorMessage: 'failing' };
    });

    // Becomes unhealthy, then outage
    await monitor.checkAll();
    expect(alerts.length).toBe(1);
    expect(alerts[0].status).toBe('unhealthy');

    await monitor.checkAll();
    expect(alerts.length).toBe(2);
    expect(alerts[1].status).toBe('outage');

    // Recovers
    healthy = true;
    await monitor.checkAll();
    expect(resolutions.length).toBe(1);
    expect(resolutions[0].routeId).toBe('route-alert-test');
  });
});
