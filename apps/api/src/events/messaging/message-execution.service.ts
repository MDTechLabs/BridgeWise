import { Injectable, Logger } from '@nestjs/common';
import { TransferEventCorrelatorService } from '../correlation/soroban/transfer-event-correlator.service';

/** #1298: per-chain source event finality policy. */
export interface FinalityPolicy {
  /** Confirmations required on top of the event's block. */
  confirmations: number;
  /** If true, the event's block must also be at or below the chain's finalized block. */
  requireFinalizedBlock: boolean;
}

export const DEFAULT_FINALITY_POLICY: FinalityPolicy = { confirmations: 12, requireFinalizedBlock: false };

export const FINALITY_POLICIES: Record<string, FinalityPolicy> = {
  ethereum: { confirmations: 2, requireFinalizedBlock: true },
  polygon: { confirmations: 128, requireFinalizedBlock: false },
  stellar: { confirmations: 1, requireFinalizedBlock: false },
};

export function getFinalityPolicy(chain: string): FinalityPolicy {
  return FINALITY_POLICIES[chain.toLowerCase()] ?? DEFAULT_FINALITY_POLICY;
}

/** #1300: proof verification outcome. */
export type ProofStatus = 'verified' | 'failed' | 'pending';

export interface ProofOutcome {
  messageId: string;
  status: ProofStatus;
  reason?: string;
  timestamp: number;
}

/** #1299: error codes for destination execution preconditions. */
export type PreconditionErrorCode =
  | 'ALREADY_EXECUTED'
  | 'PROOF_NOT_VERIFIED'
  | 'NOT_FINAL'
  | 'MESSAGE_EXPIRED';

export class PreconditionError extends Error {
  constructor(readonly code: PreconditionErrorCode, message: string) {
    super(`${code}: ${message}`);
  }
}

export interface ExecutionCandidate {
  messageId: string;
  sourceChain: string;
  sourceBlock: number;
  /** Latest block observed on the source chain. */
  sourceHead: number;
  /** Latest finalized block on the source chain, if known. */
  sourceFinalizedBlock?: number;
  /** Unix ms expiry. */
  expiresAt?: number;
}

@Injectable()
export class MessageExecutionService {
  private readonly logger = new Logger(MessageExecutionService.name);
  private readonly proofs = new Map<string, ProofOutcome>();
  private readonly executed = new Set<string>();

  constructor(private readonly correlator: TransferEventCorrelatorService) {}

  recordProofOutcome(messageId: string, status: ProofStatus, reason?: string, now = Date.now()): ProofOutcome {
    const outcome: ProofOutcome = { messageId, status, reason, timestamp: now };
    this.proofs.set(messageId, outcome);
    return outcome;
  }

  getProofOutcome(messageId: string): ProofOutcome | undefined {
    return this.proofs.get(messageId);
  }

  markExecuted(messageId: string): void {
    this.executed.add(messageId);
  }

  /** Throws PreconditionError on the first failed precondition. */
  assertCanExecute(m: ExecutionCandidate, now = Date.now()): void {
    if (this.executed.has(m.messageId)) {
      throw new PreconditionError('ALREADY_EXECUTED', `message ${m.messageId} was already executed`);
    }
    const proof = this.proofs.get(m.messageId);
    if (proof?.status !== 'verified') {
      throw new PreconditionError('PROOF_NOT_VERIFIED', `proof status is ${proof?.status ?? 'unknown'}`);
    }
    const policy = getFinalityPolicy(m.sourceChain);
    const confirmed = m.sourceHead - m.sourceBlock >= policy.confirmations;
    const finalized = !policy.requireFinalizedBlock || (m.sourceFinalizedBlock ?? -1) >= m.sourceBlock;
    if (!confirmed || !finalized) {
      throw new PreconditionError('NOT_FINAL', `source event on ${m.sourceChain} does not satisfy finality policy`);
    }
    if (m.expiresAt !== undefined && now >= m.expiresAt) {
      throw new PreconditionError('MESSAGE_EXPIRED', `message ${m.messageId} expired`);
    }
  }

  /**
   * #1301: recover partially indexed messages. Events indexed before their
   * transfer was registered are left unmatched; reconcile them. Idempotent:
   * the correlator de-duplicates by txHash:eventIndex, so reruns are no-ops.
   */
  recoverPartiallyIndexed(): { recovered: number; stillUnmatched: number } {
    const recovered = this.correlator.reconcileUnmatched().length;
    const stillUnmatched = this.correlator.getUnmatchedEvents().length;
    this.logger.log(`Recovery: recovered=${recovered} stillUnmatched=${stillUnmatched}`);
    return { recovered, stillUnmatched };
  }
}
