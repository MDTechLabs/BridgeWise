/**
 * Executable reference model for Liquidity Reserve Floor Enforcement,
 * Concurrent Route Reservations, and Balance Reconciliation.
 *
 * Implements Issues:
 *  - #1478: Add liquidity reserve floor enforcement before route acceptance
 *  - #1479: Prevent concurrent route reservations from oversubscribing liquidity
 *  - #1480: Expire abandoned liquidity reservations and reconcile balances
 *
 * Specification: `docs/LIQUIDITY_RESERVE_FLOOR_AND_RESERVATION_SPEC.md`
 */

export const LIQUIDITY_RESERVATION_INVARIANTS = [
  'LR-1', // Reserve Floor Enforcement
  'LR-2', // Atomic Route Reservation & Non-Oversubscription
  'LR-3', // Strict Solvency Invariant
  'LR-4', // Deterministic Expiration
  'LR-5', // One-Time Consumption & Release
  'LR-6', // Balance Reconciliation & Drift Tracking
] as const;

export type LiquidityReservationInvariantId = (typeof LIQUIDITY_RESERVATION_INVARIANTS)[number];

export class LiquidityReservationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'LiquidityReservationError';
  }
}

export interface RouteLiquidityConfig {
  srcChain: number;
  dstChain: number;
  token: string;
  supported: boolean;
  maxSlippageBps: number;
  maxFeeBps: number;
  exposureLimit: bigint;
  reserveFloor: bigint;
  minReservationDuration: number;
  maxReservationDuration: number;
}

export interface StoredReservation {
  reservationId: string;
  requester: string;
  srcChain: number;
  dstChain: number;
  token: string;
  amount: bigint;
  createdAt: number;
  expiresAt: number;
  completed: boolean;
  released: boolean;
}

export interface PoolLiquidityState {
  totalLiquidity: bigint;
  reservedLiquidity: bigint;
  reserveFloor: bigint;
}

export class LiquidityReservationModel {
  // key: "src:dst:token" -> RouteLiquidityConfig
  private routes: Map<string, RouteLiquidityConfig> = new Map();

  // key: "src:dst:token" -> PoolLiquidityState
  private liquidity: Map<string, PoolLiquidityState> = new Map();

  // key: reservationId -> StoredReservation
  private reservations: Map<string, StoredReservation> = new Map();

  public admin: string;
  private nowProvider: () => number;

  constructor(admin: string = '0xAdmin', nowProvider: () => number = () => Math.floor(Date.now() / 1000)) {
    this.admin = admin;
    this.nowProvider = nowProvider;
  }

  private routeKey(src: number, dst: number, token: string): string {
    return `${src}:${dst}:${token.toLowerCase()}`;
  }

  public setRoute(
    caller: string,
    srcChain: number,
    dstChain: number,
    token: string,
    supported: boolean,
    maxSlippageBps: number,
    maxFeeBps: number,
    exposureLimit: bigint,
    reserveFloor: bigint,
    minDuration: number = 30,
    maxDuration: number = 3600
  ): void {
    if (caller.toLowerCase() !== this.admin.toLowerCase()) {
      throw new LiquidityReservationError('UNAUTHORIZED', 'Caller is not admin');
    }
    if (!token || token === '0x0000000000000000000000000000000000000000') {
      throw new LiquidityReservationError('ZERO_ADDRESS', 'Token address cannot be zero');
    }
    if (maxSlippageBps > 10000 || maxFeeBps > 10000) {
      throw new LiquidityReservationError('INVALID_BPS', 'Bps cannot exceed 10,000');
    }
    if (exposureLimit > 0n && reserveFloor > exposureLimit) {
      throw new LiquidityReservationError('FLOOR_EXCEEDS_EXPOSURE', 'Reserve floor cannot exceed exposure limit');
    }

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
      this.liquidity.set(key, {
        totalLiquidity: 0n,
        reservedLiquidity: 0n,
        reserveFloor,
      });
    } else {
      const state = this.liquidity.get(key)!;
      state.reserveFloor = reserveFloor;
    }
  }

  public updateLiquidity(caller: string, srcChain: number, dstChain: number, token: string, totalLiquidity: bigint): void {
    if (caller.toLowerCase() !== this.admin.toLowerCase()) {
      throw new LiquidityReservationError('UNAUTHORIZED', 'Caller is not admin');
    }
    const key = this.routeKey(srcChain, dstChain, token);
    const state = this.liquidity.get(key) ?? {
      totalLiquidity: 0n,
      reservedLiquidity: 0n,
      reserveFloor: 0n,
    };

    if (totalLiquidity < state.reservedLiquidity + state.reserveFloor) {
      throw new LiquidityReservationError(
        'INSOLVENT_LIQUIDITY',
        `New liquidity ${totalLiquidity} cannot cover reserved ${state.reservedLiquidity} and floor ${state.reserveFloor}`
      );
    }
    state.totalLiquidity = totalLiquidity;
    this.liquidity.set(key, state);
  }

  /**
   * Validates a route against slippage, fees, and reserve floor (Issue #1478).
   * Enforces LR-1.
   */
  public validateRoute(
    srcChain: number,
    dstChain: number,
    token: string,
    amount: bigint,
    expectedAmount: bigint,
    fee: bigint
  ): boolean {
    const key = this.routeKey(srcChain, dstChain, token);
    const rc = this.routes.get(key);
    if (!rc || !rc.supported) {
      throw new LiquidityReservationError('ROUTE_NOT_SUPPORTED', 'Route is not supported');
    }

    if (amount > 0n && expectedAmount < amount) {
      const slippage = ((amount - expectedAmount) * 10000n) / amount;
      if (slippage > BigInt(rc.maxSlippageBps)) {
        throw new LiquidityReservationError('SLIPPAGE_EXCEEDED', `Slippage ${slippage} bps exceeds max ${rc.maxSlippageBps}`);
      }
    }

    if (amount > 0n) {
      const feeBps = (fee * 10000n) / amount;
      if (feeBps > BigInt(rc.maxFeeBps)) {
        throw new LiquidityReservationError('FEE_EXCEEDS_LIMIT', `Fee ${feeBps} bps exceeds max ${rc.maxFeeBps}`);
      }
    }

    const state = this.liquidity.get(key);
    if (state && state.totalLiquidity > 0n) {
      const available = state.totalLiquidity >= state.reservedLiquidity ? state.totalLiquidity - state.reservedLiquidity : 0n;
      if (available < amount || available - amount < rc.reserveFloor) {
        throw new LiquidityReservationError(
          'RESERVE_FLOOR_BREACHED',
          `Available liquidity ${available} minus requested ${amount} breaches reserve floor ${rc.reserveFloor}`
        );
      }
    }

    return true;
  }

  /**
   * Atomically reserves liquidity for a route (Issue #1479).
   * Enforces LR-2, LR-3.
   */
  public reserveLiquidity(
    requester: string,
    reservationId: string,
    srcChain: number,
    dstChain: number,
    token: string,
    amount: bigint,
    durationSeconds: number
  ): StoredReservation {
    if (!reservationId || reservationId === '0x' || reservationId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      throw new LiquidityReservationError('INVALID_RESERVATION_ID', 'Reservation ID must be non-zero');
    }
    if (this.reservations.has(reservationId)) {
      throw new LiquidityReservationError('RESERVATION_ALREADY_EXISTS', `Reservation ${reservationId} already exists`);
    }
    if (amount <= 0n) {
      throw new LiquidityReservationError('ZERO_AMOUNT', 'Reservation amount must be positive');
    }

    const key = this.routeKey(srcChain, dstChain, token);
    const rc = this.routes.get(key);
    if (!rc || !rc.supported) {
      throw new LiquidityReservationError('ROUTE_NOT_SUPPORTED', 'Route is not supported');
    }

    if (durationSeconds < rc.minReservationDuration || durationSeconds > rc.maxReservationDuration) {
      throw new LiquidityReservationError(
        'INVALID_DURATION',
        `Duration ${durationSeconds}s outside allowed range [${rc.minReservationDuration}, ${rc.maxReservationDuration}]`
      );
    }

    const state = this.liquidity.get(key);
    if (!state) {
      throw new LiquidityReservationError('LIQUIDITY_UNINITIALIZED', 'Liquidity state not initialized');
    }

    const available = state.totalLiquidity >= state.reservedLiquidity ? state.totalLiquidity - state.reservedLiquidity : 0n;
    if (available < amount || available - amount < rc.reserveFloor) {
      throw new LiquidityReservationError(
        'LIQUIDITY_OVERSUBSCRIBED',
        `Available liquidity ${available} cannot satisfy reservation ${amount} while maintaining floor ${rc.reserveFloor}`
      );
    }

    // Atomically reserve
    state.reservedLiquidity += amount;
    const now = this.nowProvider();
    const reservation: StoredReservation = {
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

  /**
   * Consumes a reservation upon transfer execution.
   * Enforces LR-5.
   */
  public consumeReservation(caller: string, reservationId: string): void {
    const res = this.reservations.get(reservationId);
    if (!res) {
      throw new LiquidityReservationError('RESERVATION_NOT_FOUND', `Reservation ${reservationId} does not exist`);
    }
    if (res.completed) {
      throw new LiquidityReservationError('RESERVATION_ALREADY_COMPLETED', 'Reservation already completed');
    }
    if (res.released) {
      throw new LiquidityReservationError('RESERVATION_ALREADY_RELEASED', 'Reservation was already released or expired');
    }

    const now = this.nowProvider();
    if (now > res.expiresAt) {
      throw new LiquidityReservationError('RESERVATION_EXPIRED', `Reservation expired at ${res.expiresAt} (now: ${now})`);
    }

    if (caller.toLowerCase() !== res.requester.toLowerCase() && caller.toLowerCase() !== this.admin.toLowerCase()) {
      throw new LiquidityReservationError('UNAUTHORIZED', 'Caller is not authorized to consume reservation');
    }

    const key = this.routeKey(res.srcChain, res.dstChain, res.token);
    const state = this.liquidity.get(key)!;

    res.completed = true;
    state.reservedLiquidity -= res.amount;
    state.totalLiquidity -= res.amount; // Outflow executed
  }

  /**
   * Expires an abandoned reservation after TTL (Issue #1480).
   * Enforces LR-4, LR-5.
   */
  public expireReservation(reservationId: string): boolean {
    const res = this.reservations.get(reservationId);
    if (!res) {
      throw new LiquidityReservationError('RESERVATION_NOT_FOUND', `Reservation ${reservationId} not found`);
    }
    if (res.completed || res.released) {
      return false; // Already finished
    }

    const now = this.nowProvider();
    if (now <= res.expiresAt) {
      throw new LiquidityReservationError('RESERVATION_NOT_EXPIRED', `Reservation ${reservationId} is still active until ${res.expiresAt}`);
    }

    res.released = true;
    const key = this.routeKey(res.srcChain, res.dstChain, res.token);
    const state = this.liquidity.get(key)!;
    state.reservedLiquidity -= res.amount;
    return true;
  }

  /**
   * Batch expiration of expired reservations.
   */
  public expireReservations(reservationIds: string[]): number {
    let count = 0;
    for (const id of reservationIds) {
      try {
        if (this.expireReservation(id)) {
          count++;
        }
      } catch {
        // Skip unexpired or invalid in batch
      }
    }
    return count;
  }

  /**
   * Reconciles recorded liquidity with physical balance (Issue #1480).
   * Enforces LR-3, LR-6.
   */
  public reconcileLiquidity(
    caller: string,
    srcChain: number,
    dstChain: number,
    token: string,
    actualPhysicalBalance: bigint
  ): { drift: bigint; newTotal: bigint } {
    if (caller.toLowerCase() !== this.admin.toLowerCase()) {
      throw new LiquidityReservationError('UNAUTHORIZED', 'Caller is not admin');
    }

    const key = this.routeKey(srcChain, dstChain, token);
    const state = this.liquidity.get(key);
    if (!state) {
      throw new LiquidityReservationError('LIQUIDITY_UNINITIALIZED', 'Liquidity state not initialized');
    }

    const minRequired = state.reservedLiquidity + state.reserveFloor;
    if (actualPhysicalBalance < minRequired) {
      throw new LiquidityReservationError(
        'INSOLVENT_LIQUIDITY',
        `Physical balance ${actualPhysicalBalance} cannot cover reserved ${state.reservedLiquidity} and floor ${state.reserveFloor}`
      );
    }

    const drift = actualPhysicalBalance - state.totalLiquidity;
    state.totalLiquidity = actualPhysicalBalance;
    return { drift, newTotal: actualPhysicalBalance };
  }

  public getPoolState(srcChain: number, dstChain: number, token: string): PoolLiquidityState | undefined {
    return this.liquidity.get(this.routeKey(srcChain, dstChain, token));
  }

  public getReservation(reservationId: string): StoredReservation | undefined {
    return this.reservations.get(reservationId);
  }
}
