import {
  TransactionLifecycleManager,
  TimeoutPolicy,
} from '../../../src/transactions/lifecycle';

describe('TransactionLifecycleManager', () => {
  let now = 1000;
  const clock = () => now;

  function createManager(policies?: TimeoutPolicy[]) {
    return new TransactionLifecycleManager({
      now: clock,
      policies: policies ?? [{ id: 'default', maxAgeMs: 5000 }],
      defaultPolicyId: 'default',
    });
  }

  beforeEach(() => {
    now = 1000;
  });

  describe('lifecycle tracking', () => {
    it('tracks a new transaction with creation event', () => {
      const manager = createManager();
      const lifecycle = manager.trackTransaction('tx-1');
      expect(lifecycle.transactionId).toBe('tx-1');
      expect(lifecycle.status).toBe('pending');
      expect(lifecycle.events).toHaveLength(1);
      expect(lifecycle.events[0].type).toBe('created');
    });

    it('records confirmation event', () => {
      const manager = createManager();
      manager.trackTransaction('tx-1');
      now = 2000;
      const lifecycle = manager.confirmTransaction('tx-1');
      expect(lifecycle?.status).toBe('confirmed');
      expect(lifecycle?.events).toHaveLength(2);
      expect(lifecycle?.events[1].type).toBe('confirmed');
    });

    it('records failure event with reason', () => {
      const manager = createManager();
      manager.trackTransaction('tx-1');
      const lifecycle = manager.failTransaction('tx-1', 'insufficient funds');
      expect(lifecycle?.status).toBe('failed');
      expect(lifecycle?.events[1].details).toBe('insufficient funds');
    });

    it('records cancellation event', () => {
      const manager = createManager();
      manager.trackTransaction('tx-1');
      const lifecycle = manager.cancelTransaction('tx-1', 'user cancelled');
      expect(lifecycle?.status).toBe('cancelled');
      expect(lifecycle?.events[1].details).toBe('user cancelled');
    });

    it('records retry event', () => {
      const manager = createManager();
      manager.trackTransaction('tx-1');
      const lifecycle = manager.retryTransaction('tx-1');
      expect(lifecycle?.events).toHaveLength(2);
      expect(lifecycle?.events[1].type).toBe('retried');
      expect(lifecycle?.events[1].details).toBe('Retry #1');
    });
  });

  describe('age and timeout', () => {
    it('calculates age correctly', () => {
      const manager = createManager();
      manager.trackTransaction('tx-1');
      now = 4000;
      const lifecycle = manager.getLifecycle('tx-1');
      expect(lifecycle?.ageMs).toBe(3000);
      expect(lifecycle?.hasTimedOut).toBe(false);
    });

    it('detects timed out transactions', () => {
      const manager = createManager();
      manager.trackTransaction('tx-1');
      now = 6001;
      const expired = manager.checkExpired();
      expect(expired).toHaveLength(1);
      expect(expired[0].hasTimedOut).toBe(true);
    });

    it('records expiry event on timeout', () => {
      const manager = createManager();
      manager.trackTransaction('tx-1');
      now = 6001;
      manager.checkExpired();
      const lifecycle = manager.getLifecycle('tx-1');
      const expiryEvent = lifecycle?.events.find((e) => e.type === 'expired');
      expect(expiryEvent).toBeDefined();
    });
  });

  describe('queries', () => {
    it('returns pending transactions', () => {
      const manager = createManager();
      manager.trackTransaction('tx-1');
      manager.trackTransaction('tx-2');
      manager.confirmTransaction('tx-2');
      expect(manager.getPendingTransactions()).toHaveLength(1);
    });

    it('returns expired transactions', () => {
      const manager = createManager();
      manager.trackTransaction('tx-1');
      manager.trackTransaction('tx-2');
      now = 6001;
      manager.checkExpired();
      expect(manager.getExpiredTransactions()).toHaveLength(2);
    });

    it('returns undefined for unknown lifecycle', () => {
      const manager = createManager();
      expect(manager.getLifecycle('unknown')).toBeUndefined();
    });
  });

  describe('callbacks', () => {
    it('invokes timeout callback and records expiry event', () => {
      const manager = createManager();
      const cb = jest.fn();
      manager.onTimeout('default', cb);
      manager.trackTransaction('tx-1');
      now = 6001;
      manager.checkExpired();
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('invokes global timeout callback', () => {
      const manager = createManager();
      const cb = jest.fn();
      manager.onAnyTimeout(cb);
      manager.trackTransaction('tx-1');
      now = 6001;
      manager.checkExpired();
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('timer control', () => {
    it('starts and stops', () => {
      let started = false;
      let stopped = false;
      const manager = new TransactionLifecycleManager({
        now: clock,
        policies: [{ id: 'default', maxAgeMs: 5000 }],
        defaultPolicyId: 'default',
        setInterval: () => {
          started = true;
          return 1 as any;
        },
        clearInterval: () => {
          stopped = true;
        },
      });
      manager.start();
      expect(started).toBe(true);
      manager.stop();
      expect(stopped).toBe(true);
    });
  });

  describe('stats', () => {
    it('returns correct stats', () => {
      const manager = createManager();
      manager.trackTransaction('tx-1');
      manager.trackTransaction('tx-2');
      manager.confirmTransaction('tx-2');
      expect(manager.getStats()).toEqual({
        pending: 1,
        confirmed: 1,
        expired: 0,
        failed: 0,
        cancelled: 0,
      });
    });
  });

  describe('dispose', () => {
    it('cleans up all resources', () => {
      const manager = createManager();
      manager.trackTransaction('tx-1');
      manager.dispose();
      expect(manager.getLifecycle('tx-1')).toBeUndefined();
    });
  });
});
