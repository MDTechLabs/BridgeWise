import {
  SorobanTimeoutManager,
  TimeoutPolicy,
} from '../../../src/soroban/timeouts';

describe('SorobanTimeoutManager', () => {
  let now = 1000;
  const clock = () => now;

  function createManager(defaultPolicy?: TimeoutPolicy) {
    return new SorobanTimeoutManager({
      now: clock,
      defaultPolicy,
    });
  }

  beforeEach(() => {
    now = 1000;
  });

  describe('policy management', () => {
    it('registers and retrieves a policy', () => {
      const manager = createManager();
      const policy: TimeoutPolicy = { id: 'fast', maxAgeMs: 5000 };
      manager.addPolicy(policy);
      expect(manager.getPolicy('fast')).toEqual(policy);
    });

    it('throws on empty policy id', () => {
      const manager = createManager();
      expect(() => manager.addPolicy({ id: '', maxAgeMs: 1000 })).toThrow(
        'Policy id is required',
      );
    });

    it('throws on non-positive maxAgeMs', () => {
      const manager = createManager();
      expect(() =>
        manager.addPolicy({ id: 'bad', maxAgeMs: 0 }),
      ).toThrow('Policy maxAgeMs must be positive');
    });

    it('removes a policy', () => {
      const manager = createManager();
      manager.addPolicy({ id: 'p1', maxAgeMs: 1000 });
      expect(manager.removePolicy('p1')).toBe(true);
      expect(manager.getPolicy('p1')).toBeUndefined();
    });
  });

  describe('transaction tracking', () => {
    it('tracks a new transaction', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      const tx = manager.trackTransaction('tx-1');
      expect(tx.transactionId).toBe('tx-1');
      expect(tx.policyId).toBe('default');
      expect(tx.status).toBe('pending');
      expect(tx.retryCount).toBe(0);
    });

    it('throws on empty transactionId', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      expect(() => manager.trackTransaction('')).toThrow('transactionId is required');
    });

    it('throws when no policy specified and no default', () => {
      const manager = createManager();
      expect(() => manager.trackTransaction('tx-1')).toThrow(
        'No policy specified and no default policy configured',
      );
    });

    it('throws on unknown policy', () => {
      const manager = createManager();
      manager.addPolicy({ id: 'fast', maxAgeMs: 1000 });
      expect(() => manager.trackTransaction('tx-1', 'unknown')).toThrow(
        'Policy "unknown" not found',
      );
    });

    it('throws on duplicate transaction', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.trackTransaction('tx-1');
      expect(() => manager.trackTransaction('tx-1')).toThrow(
        'Transaction "tx-1" is already tracked',
      );
    });

    it('uses specified policy over default', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.addPolicy({ id: 'fast', maxAgeMs: 1000 });
      const tx = manager.trackTransaction('tx-1', 'fast');
      expect(tx.policyId).toBe('fast');
    });
  });

  describe('status transitions', () => {
    it('confirms a pending transaction', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.trackTransaction('tx-1');
      const tx = manager.confirmTransaction('tx-1');
      expect(tx?.status).toBe('confirmed');
    });

    it('fails a pending transaction', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.trackTransaction('tx-1');
      const tx = manager.failTransaction('tx-1');
      expect(tx?.status).toBe('failed');
    });

    it('cancels a pending transaction', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.trackTransaction('tx-1');
      const tx = manager.cancelTransaction('tx-1');
      expect(tx?.status).toBe('cancelled');
    });

    it('ignores status change on already-confirmed transaction', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.trackTransaction('tx-1');
      manager.confirmTransaction('tx-1');
      const tx = manager.failTransaction('tx-1');
      expect(tx?.status).toBe('confirmed');
    });
  });

  describe('age tracking', () => {
    it('returns the age of a tracked transaction', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.trackTransaction('tx-1');
      now = 3500;
      expect(manager.getTransactionAge('tx-1')).toBe(2500);
    });

    it('returns undefined for unknown transaction', () => {
      const manager = createManager();
      expect(manager.getTransactionAge('unknown')).toBeUndefined();
    });
  });

  describe('expiry detection', () => {
    it('detects expired transactions by age', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.trackTransaction('tx-1');
      now = 6001;
      expect(manager.isExpired('tx-1')).toBe(true);
    });

    it('does not mark unexpired transactions', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.trackTransaction('tx-1');
      now = 4999;
      expect(manager.isExpired('tx-1')).toBe(false);
    });

    it('marks expired on checkExpired', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.trackTransaction('tx-1');
      now = 6001;
      const expired = manager.checkExpired();
      expect(expired).toHaveLength(1);
      expect(expired[0].transactionId).toBe('tx-1');
      expect(expired[0].status).toBe('expired');
    });

    it('only expires pending transactions', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.trackTransaction('tx-1');
      manager.confirmTransaction('tx-1');
      now = 6001;
      const expired = manager.checkExpired();
      expect(expired).toHaveLength(0);
    });

    it('expires by max retries exceeded', () => {
      const manager = createManager();
      manager.addPolicy({ id: 'limited', maxAgeMs: 60000, maxRetries: 2 });
      manager.trackTransaction('tx-1', 'limited');
      manager.retryTransaction('tx-1'); // retryCount = 1
      manager.retryTransaction('tx-1'); // retryCount = 2
      const tx = manager.retryTransaction('tx-1'); // retryCount = 3 > maxRetries
      expect(tx?.status).toBe('expired');
    });
  });

  describe('retry tracking', () => {
    it('increments retry count', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.trackTransaction('tx-1');
      manager.retryTransaction('tx-1');
      manager.retryTransaction('tx-1');
      expect(manager.getTransaction('tx-1')?.retryCount).toBe(2);
    });
  });

  describe('callbacks', () => {
    it('invokes policy-specific callback on expiry', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      const cb = jest.fn();
      manager.onTimeout('default', cb);
      manager.trackTransaction('tx-1');
      now = 6001;
      manager.checkExpired();
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: 'tx-1' }),
        expect.objectContaining({ id: 'default' }),
      );
    });

    it('invokes global callback on expiry', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      const cb = jest.fn();
      manager.onAnyTimeout(cb);
      manager.trackTransaction('tx-1');
      now = 6001;
      manager.checkExpired();
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('catches sync callback errors without crashing', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.onTimeout('default', () => {
        throw new Error('callback failed');
      });
      manager.trackTransaction('tx-1');
      now = 6001;
      expect(() => manager.checkExpired()).not.toThrow();
    });

    it('catches async callback errors without crashing', async () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.onTimeout('default', async () => {
        throw new Error('async callback failed');
      });
      manager.trackTransaction('tx-1');
      now = 6001;
      expect(() => manager.checkExpired()).not.toThrow();
    });
  });

  describe('timer-based checks', () => {
    it('starts and stops the periodic check', () => {
      let intervalFn: (() => void) | null = null;
      let cleared = false;

      const manager = new SorobanTimeoutManager({
        now: clock,
        defaultPolicy: { id: 'default', maxAgeMs: 5000 },
        checkIntervalMs: 500,
        setInterval: (fn) => {
          intervalFn = fn;
          return 42 as any;
        },
        clearInterval: () => {
          cleared = true;
        },
      });

      manager.start();
      expect(intervalFn).not.toBeNull();

      // Simulate timer tick
      manager.trackTransaction('tx-1');
      now = 6001;
      intervalFn!();
      expect(manager.getTransaction('tx-1')?.status).toBe('expired');

      manager.stop();
      expect(cleared).toBe(true);
    });

    it('does not start twice', () => {
      let startCount = 0;
      const manager = new SorobanTimeoutManager({
        now: clock,
        setInterval: () => {
          startCount++;
          return 1 as any;
        },
        clearInterval: () => {},
      });
      manager.start();
      manager.start();
      expect(startCount).toBe(1);
      manager.dispose();
    });
  });

  describe('untrack', () => {
    it('removes a confirmed transaction', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.trackTransaction('tx-1');
      manager.confirmTransaction('tx-1');
      expect(manager.untrackTransaction('tx-1')).toBe(true);
      expect(manager.getTransaction('tx-1')).toBeUndefined();
    });

    it('throws when removing a pending transaction', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.trackTransaction('tx-1');
      expect(() => manager.untrackTransaction('tx-1')).toThrow(
        'Cannot untrack a pending transaction',
      );
    });
  });

  describe('stats', () => {
    it('returns correct counts', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
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

  describe('getTransactions', () => {
    it('returns all transactions when no filter', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.trackTransaction('tx-1');
      manager.trackTransaction('tx-2');
      expect(manager.getTransactions()).toHaveLength(2);
    });

    it('filters by status', () => {
      const manager = createManager({ id: 'default', maxAgeMs: 5000 });
      manager.trackTransaction('tx-1');
      manager.trackTransaction('tx-2');
      manager.confirmTransaction('tx-2');
      expect(manager.getTransactions('confirmed')).toHaveLength(1);
      expect(manager.getTransactions('pending')).toHaveLength(1);
    });
  });

  describe('dispose', () => {
    it('clears all state and stops timer', () => {
      let cleared = false;
      const manager = new SorobanTimeoutManager({
        now: clock,
        defaultPolicy: { id: 'default', maxAgeMs: 5000 },
        setInterval: () => 1 as any,
        clearInterval: () => {
          cleared = true;
        },
      });
      manager.trackTransaction('tx-1');
      manager.start();
      manager.dispose();
      expect(cleared).toBe(true);
      expect(manager.getTransactions()).toHaveLength(0);
    });
  });
});
