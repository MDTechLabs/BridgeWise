export type ExposureConfig = { globalCap: bigint; chainCap: bigint; inflightCap: bigint };
export type ExposureState = { global: bigint; chain: bigint; inflight: bigint };

export function canAcceptExposure(state: ExposureState, cfg: ExposureConfig, amount: bigint) {
  if (amount < 0n) return { ok: false, reason: 'invalid_amount' };
  if (state.global + amount > cfg.globalCap) return { ok: false, reason: 'global_cap' };
  if (state.chain + amount > cfg.chainCap) return { ok: false, reason: 'chain_cap' };
  if (state.inflight + amount > cfg.inflightCap) return { ok: false, reason: 'inflight_cap' };
  return { ok: true, reason: 'ok' };
}
