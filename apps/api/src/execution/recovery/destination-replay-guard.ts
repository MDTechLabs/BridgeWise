import { createHash } from 'node:crypto';

export type DestinationOutcome = 'executed' | 'failed_not_executed' | 'unknown';

export interface ReplayDecision {
  allowed: boolean;
  reason:
    | 'ok'
    | 'already_executed'
    | 'outcome_unknown'
    | 'payload_changed'
    | 'replay_limit'
    | 'not_failed'
    | 'contract_upgraded';
  replaysUsed: number;
}

interface AttemptRecord {
  payloadHash: string;
  outcome: DestinationOutcome;
  replays: number;
  /** Destination contract version/implementation hash in effect for this attempt (#1445). */
  contractVersion: string;
}

/** Idempotency key for a destination call: same execution, chain and payload always map to the same key. */
export function replayKey(executionId: string, destinationChain: string, payload: string): string {
  return createHash('sha256').update(`${executionId}|${destinationChain}|${payload}`).digest('hex');
}

/**
 * A failed destination call may be replayed only when it is proven not to have executed, the payload
 * is byte-identical, the destination contract has not been upgraded since the failed attempt, and the
 * replay limit is not reached. Executed or unknown outcomes are never replayed: unknown means the call
 * may have landed, so replaying could duplicate it.
 *
 * A failed attempt pins the destination contract's version/implementation identifier (#1445): if the
 * contract is upgraded before the replay is requested, the old attempt's semantics may no longer hold
 * (storage layout, logic, or authorization can all change), so the replay is denied rather than blindly
 * reused against new contract code.
 */
export class DestinationReplayGuard {
  private readonly attempts = new Map<string, AttemptRecord>();

  constructor(private readonly maxReplays = 3) {}

  recordAttempt(
    executionId: string,
    destinationChain: string,
    payload: string,
    outcome: DestinationOutcome,
    contractVersion: string,
  ): void {
    const key = `${executionId}|${destinationChain}`;
    const hash = replayKey(executionId, destinationChain, payload);
    const existing = this.attempts.get(key);
    this.attempts.set(key, { payloadHash: hash, outcome, contractVersion, replays: existing?.replays ?? 0 });
  }

  /** Checks and, when allowed, consumes one replay. */
  requestReplay(
    executionId: string,
    destinationChain: string,
    payload: string,
    contractVersion: string,
  ): ReplayDecision {
    const record = this.attempts.get(`${executionId}|${destinationChain}`);
    if (!record) return { allowed: false, reason: 'not_failed', replaysUsed: 0 };
    const deny = (reason: ReplayDecision['reason']): ReplayDecision => ({
      allowed: false,
      reason,
      replaysUsed: record.replays,
    });
    if (record.outcome === 'executed') return deny('already_executed');
    if (record.outcome === 'unknown') return deny('outcome_unknown');
    if (record.contractVersion !== contractVersion) return deny('contract_upgraded');
    if (record.payloadHash !== replayKey(executionId, destinationChain, payload)) return deny('payload_changed');
    if (record.replays >= this.maxReplays) return deny('replay_limit');
    record.replays += 1;
    return { allowed: true, reason: 'ok', replaysUsed: record.replays };
  }
}
