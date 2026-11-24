export type LiquidityState = { available: bigint; minReserve: bigint; depletionWindow: bigint; maxDepletion: bigint };

export function evaluateCircuitBreaker(s: LiquidityState) {
  if (s.available < 0n || s.minReserve < 0n || s.depletionWindow < 0n || s.maxDepletion < 0n) return { open: true, reason: 'invalid_state' };
  if (s.available < s.minReserve) return { open: true, reason: 'min_reserve_breached' };
  if (s.depletionWindow > s.maxDepletion) return { open: true, reason: 'depletion_rate_breached' };
  return { open: false, reason: 'ok' };
}
