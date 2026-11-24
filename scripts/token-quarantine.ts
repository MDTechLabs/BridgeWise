export type TokenObservation = { token: string; chainId: number; codeHash: string; behaviorOk: boolean };
export type ApprovedToken = { token: string; chainId: number; approvedCodeHash: string };

export function shouldQuarantine(obs: TokenObservation, approved: ApprovedToken | undefined) {
  if (!approved) return { quarantine: true, reason: 'unapproved_token' };
  if (approved.approvedCodeHash.toLowerCase() !== obs.codeHash.toLowerCase()) return { quarantine: true, reason: 'code_hash_mismatch' };
  if (!obs.behaviorOk) return { quarantine: true, reason: 'behavior_probe_failed' };
  return { quarantine: false, reason: 'ok' };
}
