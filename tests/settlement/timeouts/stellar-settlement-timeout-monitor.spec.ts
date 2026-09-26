import { StellarSettlementTimeoutMonitor } from '../../../src/settlement/timeouts/stellar';

describe('StellarSettlementTimeoutMonitor', () => {
  let now = 1000;
  const clock = () => now;
  let delayed: string[];

  beforeEach(() => {
    now = 1000;
    delayed = [];
  });

  it('marks a transfer delayed once it exceeds the expected duration', () => {
    const monitor = new StellarSettlementTimeoutMonitor({
      now: clock,
      onDelayed: (id) => delayed.push(id),
    });
    monitor.addPolicy({ id: 'fast', expectedDurationMs: 5000 });
    monitor.track('s1', 'fast');

    now = 7000;
    const record = monitor.check('s1');

    expect(record?.status).toBe('delayed');
    expect(delayed).toEqual(['s1']);
  });

  it('keeps a transfer pending within the expected duration', () => {
    const monitor = new StellarSettlementTimeoutMonitor({ now: clock });
    monitor.addPolicy({ id: 'fast', expectedDurationMs: 5000 });
    monitor.track('s1', 'fast');

    now = 4000;
    const record = monitor.check('s1');

    expect(record?.status).toBe('pending');
  });

  it('checks policies are configurable', () => {
    const monitor = new StellarSettlementTimeoutMonitor({ now: clock });
    monitor.addPolicy({ id: 'slow', expectedDurationMs: 10000 });
    monitor.addPolicy({ id: 'fast', expectedDurationMs: 1000 });

    monitor.track('s1', 'slow');
    expect(() => monitor.track('s2', 'unknown')).toThrow(
      'Unknown timeout policy',
    );
  });

  it('returns null for an untracked settlement', () => {
    const monitor = new StellarSettlementTimeoutMonitor({ now: clock });
    expect(monitor.check('missing')).toBeNull();
  });
});
