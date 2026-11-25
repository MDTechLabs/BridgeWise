import {
  LiquidityReservationModel,
  LIQUIDITY_RESERVATION_INVARIANTS,
} from './liquidity-reserve-reservation';

describe('Liquidity Reserve Floor, Route Reservation & Balance Reconciliation (#1478, #1479, #1480)', () => {
  let model: LiquidityReservationModel;
  let currentTime = 1700000000;
  const admin = '0xAdmin';
  const user1 = '0xUser1';
  const user2 = '0xUser2';
  const token = '0xTokenUSDC';
  const SRC = 1;
  const DST = 2;

  beforeEach(() => {
    currentTime = 1700000000;
    model = new LiquidityReservationModel(admin, () => currentTime);
  });

  describe('Reserve floor configuration and route validation (#1478, LR-1)', () => {
    it('sets route with reserve floor and checks available liquidity', () => {
      // 10,000 total liquidity, 2,000 reserve floor
      model.setRoute(admin, SRC, DST, token, true, 500, 100, 100_000n, 2000n, 30, 3600);
      model.updateLiquidity(admin, SRC, DST, token, 10_000n);

      // Route requesting 5,000 leaves 5,000 >= 2,000 -> accepted
      expect(model.validateRoute(SRC, DST, token, 5000n, 4900n, 10n)).toBe(true);

      // Route requesting 8,500 leaves 1,500 < 2,000 -> rejected with RESERVE_FLOOR_BREACHED
      expect(() => {
        model.validateRoute(SRC, DST, token, 8500n, 8400n, 10n);
      }).toThrow(/RESERVE_FLOOR_BREACHED/);
    });

    it('rejects unsupported route or unauthorized route update', () => {
      expect(() => {
        model.setRoute(user1, SRC, DST, token, true, 500, 100, 100_000n, 2000n);
      }).toThrow(/UNAUTHORIZED/);

      expect(() => {
        model.validateRoute(SRC, DST, '0xUnsupported', 1000n, 950n, 10n);
      }).toThrow(/ROUTE_NOT_SUPPORTED/);
    });
  });

  describe('Concurrent route reservations and oversubscription prevention (#1479, LR-2, LR-3)', () => {
    beforeEach(() => {
      model.setRoute(admin, SRC, DST, token, true, 500, 100, 100_000n, 2000n, 30, 3600);
      model.updateLiquidity(admin, SRC, DST, token, 10_000n);
    });

    it('allows sequential non-conflicting reservations', () => {
      // Res 1: 3,000. Free remaining: 10,000 - 3,000 = 7,000 (>= 2,000 floor)
      const r1 = model.reserveLiquidity(user1, 'res-1', SRC, DST, token, 3000n, 120);
      expect(r1.amount).toBe(3000n);

      const state1 = model.getPoolState(SRC, DST, token)!;
      expect(state1.reservedLiquidity).toBe(3000n);

      // Res 2: 4,000. Free remaining: 7,000 - 4,000 = 3,000 (>= 2,000 floor)
      const r2 = model.reserveLiquidity(user2, 'res-2', SRC, DST, token, 4000n, 120);
      expect(r2.amount).toBe(4000n);

      const state2 = model.getPoolState(SRC, DST, token)!;
      expect(state2.reservedLiquidity).toBe(7000n);
    });

    it('prevents concurrent oversubscription breaching floor (LR-2)', () => {
      // Total 10,000, Floor 2,000 -> Max reservable = 8,000
      model.reserveLiquidity(user1, 'res-1', SRC, DST, token, 6000n, 120);

      // Res 2 requests 3,000. 6,000 + 3,000 = 9,000. 10,000 - 9,000 = 1,000 < 2,000 floor. Reverts!
      expect(() => {
        model.reserveLiquidity(user2, 'res-2', SRC, DST, token, 3000n, 120);
      }).toThrow(/LIQUIDITY_OVERSUBSCRIBED/);

      // Pool state remains protected
      const state = model.getPoolState(SRC, DST, token)!;
      expect(state.reservedLiquidity).toBe(6000n);
    });

    it('rejects duplicate reservation IDs (replay defense)', () => {
      model.reserveLiquidity(user1, 'res-dup', SRC, DST, token, 1000n, 120);
      expect(() => {
        model.reserveLiquidity(user2, 'res-dup', SRC, DST, token, 1000n, 120);
      }).toThrow(/RESERVATION_ALREADY_EXISTS/);
    });

    it('rejects zero amount or invalid duration', () => {
      expect(() => {
        model.reserveLiquidity(user1, 'res-0', SRC, DST, token, 0n, 120);
      }).toThrow(/ZERO_AMOUNT/);

      expect(() => {
        model.reserveLiquidity(user1, 'res-dur', SRC, DST, token, 1000n, 5); // < min 30s
      }).toThrow(/INVALID_DURATION/);
    });

    it('consumes reservation correctly upon transaction execution (LR-5)', () => {
      model.reserveLiquidity(user1, 'res-consume', SRC, DST, token, 2000n, 120);

      model.consumeReservation(user1, 'res-consume');

      const res = model.getReservation('res-consume')!;
      expect(res.completed).toBe(true);

      const pool = model.getPoolState(SRC, DST, token)!;
      expect(pool.reservedLiquidity).toBe(0n);
      expect(pool.totalLiquidity).toBe(8000n); // 10,000 - 2,000 outflow
    });
  });

  describe('Expiration of abandoned reservations & balance reconciliation (#1480, LR-4, LR-6)', () => {
    beforeEach(() => {
      model.setRoute(admin, SRC, DST, token, true, 500, 100, 100_000n, 2000n, 30, 3600);
      model.updateLiquidity(admin, SRC, DST, token, 10_000n);
    });

    it('expires an abandoned reservation past TTL and restores reserved capacity', () => {
      model.reserveLiquidity(user1, 'res-abandoned', SRC, DST, token, 5000n, 60);

      // Cannot expire before TTL
      expect(() => {
        model.expireReservation('res-abandoned');
      }).toThrow(/RESERVATION_NOT_EXPIRED/);

      // Fast forward time past TTL (61 seconds)
      currentTime += 61;

      // Anyone (permissionless) can expire
      const expired = model.expireReservation('res-abandoned');
      expect(expired).toBe(true);

      const pool = model.getPoolState(SRC, DST, token)!;
      expect(pool.reservedLiquidity).toBe(0n);
      expect(pool.totalLiquidity).toBe(10_000n); // Funds returned to pool!

      // Now another user can reserve that liquidity again
      const newRes = model.reserveLiquidity(user2, 'res-new', SRC, DST, token, 5000n, 60);
      expect(newRes.amount).toBe(5000n);
    });

    it('batch expires multiple expired reservations', () => {
      model.reserveLiquidity(user1, 'res-batch-1', SRC, DST, token, 2000n, 60);
      model.reserveLiquidity(user2, 'res-batch-2', SRC, DST, token, 3000n, 60);

      currentTime += 100;
      const count = model.expireReservations(['res-batch-1', 'res-batch-2', 'res-nonexistent']);
      expect(count).toBe(2);

      const pool = model.getPoolState(SRC, DST, token)!;
      expect(pool.reservedLiquidity).toBe(0n);
    });

    it('reconciles physical balance with recorded liquidity and detects drift (LR-6)', () => {
      // Physical vault has 12,000 (surplus of 2,000)
      const res = model.reconcileLiquidity(admin, SRC, DST, token, 12_000n);
      expect(res.drift).toBe(2000n);
      expect(res.newTotal).toBe(12_000n);

      const pool = model.getPoolState(SRC, DST, token)!;
      expect(pool.totalLiquidity).toBe(12_000n);
    });

    it('reverts reconciliation if physical balance cannot cover reserved liquidity + floor (solvency breach)', () => {
      model.reserveLiquidity(user1, 'res-active', SRC, DST, token, 4000n, 120);
      // reserved = 4,000, floor = 2,000. Required min = 6,000.
      // Physical balance only 5,000 -> Insolvency!
      expect(() => {
        model.reconcileLiquidity(admin, SRC, DST, token, 5000n);
      }).toThrow(/INSOLVENT_LIQUIDITY/);
    });
  });
});
