export type ReserveSnapshot = {
  asset: string;
  chain: string;
  onchainLiability: bigint;
  attestedReserve: bigint;
  attestationTimestamp: number;
  blockNumber: number;
};

export type AttestationPolicy = {
  maxAgeSeconds: number;
  minCoverageBps: number; // 10000 = 100%
  nowSeconds: number;
};

export type AttestationDecision = { status: 'ok' | 'unknown' | 'undercollateralized'; reason: string };

export function evaluateReserveAttestation(s: ReserveSnapshot, p: AttestationPolicy): AttestationDecision {
  if (s.attestedReserve < 0n || s.onchainLiability < 0n) return { status: 'unknown', reason: 'invalid_value' };
  if (p.nowSeconds - s.attestationTimestamp > p.maxAgeSeconds) return { status: 'unknown', reason: 'stale_attestation' };
  if (s.onchainLiability === 0n) return { status: 'ok', reason: 'no_liability' };
  const coverageBps = (s.attestedReserve * 10000n) / s.onchainLiability;
  if (coverageBps < BigInt(p.minCoverageBps)) return { status: 'undercollateralized', reason: 'insufficient_reserve' };
  return { status: 'ok', reason: 'attestation_matches' };
}
