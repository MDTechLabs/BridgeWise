import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class LiquidityReservationModel {
  constructor(admin = '0xAdmin', nowProvider = () => Math.floor(Date.now() / 1000)) {
    this.admin = admin;
    this.nowProvider = nowProvider;
    this.routes = new Map();
    this.liquidity = new Map();
    this.reservations = new Map();
  }

  routeKey(src, dst, token) {
    return `${src}:${dst}:${token.toLowerCase()}`;
  }

  setRoute(caller, srcChain, dstChain, token, supported, maxSlippageBps, maxFeeBps, exposureLimit, reserveFloor, minDuration = 30, maxDuration = 3600) {
    if (caller.toLowerCase() !== this.admin.toLowerCase()) throw new Error('UNAUTHORIZED');
    if (!token || token === '0x0000000000000000000000000000000000000000') throw new Error('ZERO_ADDRESS');
    if (maxSlippageBps > 10000 || maxFeeBps > 10000) throw new Error('INVALID_BPS');
    if (exposureLimit > 0n && reserveFloor > exposureLimit) throw new Error('FLOOR_EXCEEDS_EXPOSURE');

    const key = this.routeKey(srcChain, dstChain, token);
    this.routes.set(key, {
      srcChain,
      dstChain,
      token: token.toLowerCase(),
      supported,
      maxSlippageBps,
      maxFeeBps,
      exposureLimit,
      reserveFloor,
      minReservationDuration: minDuration,
      maxReservationDuration: maxDuration,
    });

    if (!this.liquidity.has(key)) {
      this.liquidity.set(key, { totalLiquidity: 0n, reservedLiquidity: 0n, reserveFloor });
    } else {
      this.liquidity.get(key).reserveFloor = reserveFloor;
    }
  }

  updateLiquidity(caller, srcChain, dstChain, token, totalLiquidity) {
    if (caller.toLowerCase() !== this.admin.toLowerCase()) throw new Error('UNAUTHORIZED');
    const key = this.routeKey(srcChain, dstChain, token);
    const state = this.liquidity.get(key) || { totalLiquidity: 0n, reservedLiquidity: 0n, reserveFloor: 0n };
    if (totalLiquidity < state.reservedLiquidity + state.reserveFloor) throw new Error('INSOLVENT_LIQUIDITY');
    state.totalLiquidity = totalLiquidity;
    this.liquidity.set(key, state);
  }

  validateRoute(srcChain, dstChain, token, amount, expectedAmount, fee) {
    const key = this.routeKey(srcChain, dstChain, token);
    const rc = this.routes.get(key);
    if (!rc || !rc.supported) throw new Error('ROUTE_NOT_SUPPORTED');

    if (amount > 0n && expectedAmount < amount) {
      const slippage = ((amount - expectedAmount) * 10000n) / amount;
      if (slippage > BigInt(rc.maxSlippageBps)) throw new Error('SLIPPAGE_EXCEEDED');
    }
    if (amount > 0n) {
      const feeBps = (fee * 10000n) / amount;
      if (feeBps > BigInt(rc.maxFeeBps)) throw new Error('FEE_EXCEEDS_LIMIT');
    }

    const state = this.liquidity.get(key);
    if (state && state.totalLiquidity > 0n) {
      const available = state.totalLiquidity >= state.reservedLiquidity ? state.totalLiquidity - state.reservedLiquidity : 0n;
      if (available < amount || available - amount < rc.reserveFloor) throw new Error('RESERVE_FLOOR_BREACHED');
    }
    return true;
  }

  reserveLiquidity(requester, reservationId, srcChain, dstChain, token, amount, durationSeconds) {
    if (!reservationId || reservationId === '0x') throw new Error('INVALID_RESERVATION_ID');
    if (this.reservations.has(reservationId)) throw new Error('RESERVATION_ALREADY_EXISTS');
    if (amount <= 0n) throw new Error('ZERO_AMOUNT');

    const key = this.routeKey(srcChain, dstChain, token);
    const rc = this.routes.get(key);
    if (!rc || !rc.supported) throw new Error('ROUTE_NOT_SUPPORTED');
    if (durationSeconds < rc.minReservationDuration || durationSeconds > rc.maxReservationDuration) throw new Error('INVALID_DURATION');

    const state = this.liquidity.get(key);
    if (!state) throw new Error('LIQUIDITY_UNINITIALIZED');

    const available = state.totalLiquidity >= state.reservedLiquidity ? state.totalLiquidity - state.reservedLiquidity : 0n;
    if (available < amount || available - amount < rc.reserveFloor) throw new Error('LIQUIDITY_OVERSUBSCRIBED');

    state.reservedLiquidity += amount;
    const now = this.nowProvider();
    const reservation = {
      reservationId,
      requester,
      srcChain,
      dstChain,
      token: token.toLowerCase(),
      amount,
      createdAt: now,
      expiresAt: now + durationSeconds,
      completed: false,
      released: false,
    };
    this.reservations.set(reservationId, reservation);
    return reservation;
  }

  consumeReservation(caller, reservationId) {
    const res = this.reservations.get(reservationId);
    if (!res) throw new Error('RESERVATION_NOT_FOUND');
    if (res.completed) throw new Error('RESERVATION_ALREADY_COMPLETED');
    if (res.released) throw new Error('RESERVATION_ALREADY_RELEASED');

    const now = this.nowProvider();
    if (now > res.expiresAt) throw new Error('RESERVATION_EXPIRED');
    if (caller.toLowerCase() !== res.requester.toLowerCase() && caller.toLowerCase() !== this.admin.toLowerCase()) {
      throw new Error('UNAUTHORIZED');
    }

    const key = this.routeKey(res.srcChain, res.dstChain, res.token);
    const state = this.liquidity.get(key);
    res.completed = true;
    state.reservedLiquidity -= res.amount;
    state.totalLiquidity -= res.amount;
  }

  expireReservation(reservationId) {
    const res = this.reservations.get(reservationId);
    if (!res) throw new Error('RESERVATION_NOT_FOUND');
    if (res.completed || res.released) return false;

    const now = this.nowProvider();
    if (now <= res.expiresAt) throw new Error('RESERVATION_NOT_EXPIRED');

    res.released = true;
    const key = this.routeKey(res.srcChain, res.dstChain, res.token);
    const state = this.liquidity.get(key);
    state.reservedLiquidity -= res.amount;
    return true;
  }

  expireReservations(reservationIds) {
    let count = 0;
    for (const id of reservationIds) {
      try {
        if (this.expireReservation(id)) count++;
      } catch {}
    }
    return count;
  }

  reconcileLiquidity(caller, srcChain, dstChain, token, actualPhysicalBalance) {
    if (caller.toLowerCase() !== this.admin.toLowerCase()) throw new Error('UNAUTHORIZED');
    const key = this.routeKey(srcChain, dstChain, token);
    const state = this.liquidity.get(key);
    if (!state) throw new Error('LIQUIDITY_UNINITIALIZED');

    const minRequired = state.reservedLiquidity + state.reserveFloor;
    if (actualPhysicalBalance < minRequired) throw new Error('INSOLVENT_LIQUIDITY');

    const drift = actualPhysicalBalance - state.totalLiquidity;
    state.totalLiquidity = actualPhysicalBalance;
    return { drift, newTotal: actualPhysicalBalance };
  }
}

describe('Liquidity Reserve Floor, Route Reservation & Balance Reconciliation (#1478, #1479, #1480)', () => {
  let model;
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
    model.setRoute(admin, SRC, DST, token, true, 500, 100, 100_000n, 2000n, 30, 3600);
    model.updateLiquidity(admin, SRC, DST, token, 10_000n);
  });

  it('enforces reserve floor before route acceptance (#1478)', () => {
    assert.equal(model.validateRoute(SRC, DST, token, 5000n, 4900n, 10n), true);
    assert.throws(
      () => model.validateRoute(SRC, DST, token, 8500n, 8400n, 10n),
      /RESERVE_FLOOR_BREACHED/
    );
  });

  it('prevents concurrent reservations from oversubscribing liquidity (#1479)', () => {
    model.reserveLiquidity(user1, 'res-1', SRC, DST, token, 6000n, 120);
    assert.throws(
      () => model.reserveLiquidity(user2, 'res-2', SRC, DST, token, 3000n, 120),
      /LIQUIDITY_OVERSUBSCRIBED/
    );
  });

  it('expires abandoned reservations past TTL and reconciles balance (#1480)', () => {
    model.reserveLiquidity(user1, 'res-abandoned', SRC, DST, token, 5000n, 60);
    assert.throws(() => model.expireReservation('res-abandoned'), /RESERVATION_NOT_EXPIRED/);

    currentTime += 61;
    assert.equal(model.expireReservation('res-abandoned'), true);

    // Can reserve again after expiration
    const r2 = model.reserveLiquidity(user2, 'res-renewed', SRC, DST, token, 5000n, 60);
    assert.equal(r2.amount, 5000n);

    // Reconcile with surplus physical balance
    const rec = model.reconcileLiquidity(admin, SRC, DST, token, 12_000n);
    assert.equal(rec.drift, 2000n);
  });
});
