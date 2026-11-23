/**
 * Independent checklist for contract audit remediation closure.
 *
 * Every finding from the audit report must move through
 *   open -> remediated -> verified
 * before the audit can be closed. Independence is enforced in code:
 *  - remediators, verifiers and closers are disjoint reviewed principal sets;
 *  - a verifier can never be the remediator of the finding being verified;
 *  - verification must name the exact fix commit that was remediated;
 *  - closure requires every fix commit to be contained in the deployed commit,
 *    checked with a trusted local `isAncestor` predicate (not RPC data).
 *
 * Every rejected action leaves the checklist untouched, and replayed actions
 * (an already-applied transition) are rejected rather than re-applied.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational';
export type Disposition = 'fixed' | 'accepted-risk';
export type FindingStatus = 'open' | 'remediated' | 'verified';

export interface AuditFinding {
  id: string;
  severity: Severity;
  title: string;
}

export interface ClosureRoles {
  remediators: readonly string[];
  verifiers: readonly string[];
  closers: readonly string[];
}

export interface RemediationInput {
  findingId: string;
  disposition: Disposition;
  /** Required for `fixed`: the commit containing the fix. */
  fixCommit?: string;
  /** Required for `fixed`: references to the regression tests. */
  testRefs?: string[];
  /** Required for `accepted-risk`: reference to the signed risk acceptance. */
  riskAcceptanceRef?: string;
}

export interface VerificationInput {
  findingId: string;
  verdict: 'pass' | 'fail';
  /** Commit the verifier actually reviewed; must equal the remediated commit. */
  verifiedCommit?: string;
  evidenceRef: string;
}

export type ClosureErrorCode =
  | 'INVALID_INPUT'
  | 'UNKNOWN_FINDING'
  | 'UNAUTHORIZED'
  | 'INVALID_TRANSITION'
  | 'NOT_INDEPENDENT'
  | 'POLICY_VIOLATION'
  | 'COMMIT_MISMATCH'
  | 'NOT_CLOSABLE'
  | 'ALREADY_CLOSED';

export class ClosureError extends Error {
  constructor(
    readonly code: ClosureErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ClosureError';
  }
}

interface FindingState {
  finding: AuditFinding;
  status: FindingStatus;
  attempts: number;
  remediator?: string;
  disposition?: Disposition;
  fixCommit?: string;
  testRefs?: string[];
  riskAcceptanceRef?: string;
  verifier?: string;
  verificationEvidenceRef?: string;
}

export interface ChecklistItem {
  id: string;
  severity: Severity;
  status: FindingStatus;
  attempts: number;
  disposition?: Disposition;
  fixCommit?: string;
  remediator?: string;
  verifier?: string;
  blockers: string[];
}

export interface ClosureChecklist {
  closed: boolean;
  closable: boolean;
  items: ChecklistItem[];
  blockers: string[];
}

export interface ClosureEvent {
  seq: number;
  action: 'remediate' | 'verify' | 'reject' | 'close';
  actor: string;
  findingId?: string;
}

const SEVERITIES: readonly Severity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'informational',
];
/** Severities that must be fixed; they cannot be closed through risk acceptance. */
const MUST_FIX: readonly Severity[] = ['critical', 'high'];

export class AuditRemediationClosure {
  private readonly states = new Map<string, FindingState>();
  private readonly remediators: ReadonlySet<string>;
  private readonly verifiers: ReadonlySet<string>;
  private readonly closers: ReadonlySet<string>;
  private readonly log: ClosureEvent[] = [];
  private closedBy: string | undefined;

  constructor(
    findings: readonly AuditFinding[],
    roles: ClosureRoles,
  ) {
    if (!Array.isArray(findings) || findings.length === 0) {
      throw new ClosureError('INVALID_INPUT', 'At least one finding is required');
    }
    for (const finding of findings) {
      if (
        !finding ||
        typeof finding.id !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(finding.id) ||
        !SEVERITIES.includes(finding.severity) ||
        typeof finding.title !== 'string' ||
        finding.title.trim() === ''
      ) {
        throw new ClosureError('INVALID_INPUT', 'Finding is malformed');
      }
      if (this.states.has(finding.id)) {
        throw new ClosureError(
          'INVALID_INPUT',
          `Duplicate finding id: ${finding.id}`,
        );
      }
      this.states.set(finding.id, {
        finding: { ...finding },
        status: 'open',
        attempts: 0,
      });
    }

    this.remediators = principals(roles?.remediators, 'remediators');
    this.verifiers = principals(roles?.verifiers, 'verifiers');
    this.closers = principals(roles?.closers, 'closers');
    for (const [a, b, label] of [
      [this.remediators, this.verifiers, 'remediators and verifiers'],
      [this.remediators, this.closers, 'remediators and closers'],
    ] as const) {
      for (const principal of a) {
        if (b.has(principal)) {
          throw new ClosureError(
            'NOT_INDEPENDENT',
            `Roles must be independent: ${label} overlap`,
          );
        }
      }
    }
  }

  get isClosed(): boolean {
    return this.closedBy !== undefined;
  }

  events(): ClosureEvent[] {
    return this.log.map((event) => ({ ...event }));
  }

  recordRemediation(actor: string, input: unknown): void {
    this.assertOpenForChanges();
    const who = this.authorize(actor, this.remediators);
    const request = parseRemediation(input);
    const state = this.mustGet(request.findingId);

    if (state.status !== 'open') {
      throw new ClosureError(
        'INVALID_TRANSITION',
        `Finding ${state.finding.id} is ${state.status}; remediation was already recorded`,
      );
    }
    if (
      request.disposition === 'accepted-risk' &&
      MUST_FIX.includes(state.finding.severity)
    ) {
      throw new ClosureError(
        'POLICY_VIOLATION',
        `${state.finding.severity} findings must be fixed, not risk-accepted`,
      );
    }

    state.status = 'remediated';
    state.attempts += 1;
    state.remediator = who;
    state.disposition = request.disposition;
    state.fixCommit = request.fixCommit;
    state.testRefs = request.testRefs;
    state.riskAcceptanceRef = request.riskAcceptanceRef;
    state.verifier = undefined;
    state.verificationEvidenceRef = undefined;
    this.record('remediate', who, state.finding.id);
  }

  recordVerification(actor: string, input: unknown): void {
    this.assertOpenForChanges();
    const who = this.authorize(actor, this.verifiers);
    const request = parseVerification(input);
    const state = this.mustGet(request.findingId);

    if (state.status !== 'remediated') {
      throw new ClosureError(
        'INVALID_TRANSITION',
        `Finding ${state.finding.id} is ${state.status}; only remediated findings can be verified`,
      );
    }
    if (who === state.remediator) {
      throw new ClosureError(
        'NOT_INDEPENDENT',
        'The remediator cannot verify their own remediation',
      );
    }

    if (request.verdict === 'fail') {
      state.status = 'open';
      state.remediator = undefined;
      state.fixCommit = undefined;
      state.testRefs = undefined;
      state.riskAcceptanceRef = undefined;
      state.disposition = undefined;
      this.record('reject', who, state.finding.id);
      return;
    }

    if (
      state.disposition === 'fixed' &&
      request.verifiedCommit !== state.fixCommit
    ) {
      throw new ClosureError(
        'COMMIT_MISMATCH',
        'Verified commit does not match the remediated fix commit',
      );
    }

    state.status = 'verified';
    state.verifier = who;
    state.verificationEvidenceRef = request.evidenceRef;
    this.record('verify', who, state.finding.id);
  }

  /** Read-only view of what still blocks closure. */
  checklist(): ClosureChecklist {
    const items: ChecklistItem[] = [];
    const blockers: string[] = [];
    for (const state of this.states.values()) {
      const itemBlockers: string[] = [];
      if (state.status === 'open') itemBlockers.push('not remediated');
      if (state.status === 'remediated') itemBlockers.push('awaiting independent verification');
      for (const blocker of itemBlockers) {
        blockers.push(`${state.finding.id}: ${blocker}`);
      }
      items.push({
        id: state.finding.id,
        severity: state.finding.severity,
        status: state.status,
        attempts: state.attempts,
        disposition: state.disposition,
        fixCommit: state.fixCommit,
        remediator: state.remediator,
        verifier: state.verifier,
        blockers: itemBlockers,
      });
    }
    return {
      closed: this.isClosed,
      closable: !this.isClosed && blockers.length === 0,
      items,
      blockers,
    };
  }

  /**
   * Closes the audit. Fails closed if anything is unverified, or if a fix
   * commit cannot be shown to be contained in the deployed commit.
   */
  close(
    actor: string,
    deployment: {
      deployedCommit: string;
      isAncestor: (fixCommit: string, deployedCommit: string) => boolean;
    },
  ): void {
    this.assertOpenForChanges();
    const who = this.authorize(actor, this.closers);

    const { blockers } = this.checklist();
    if (blockers.length > 0) {
      throw new ClosureError(
        'NOT_CLOSABLE',
        `Audit cannot be closed: ${blockers.join('; ')}`,
      );
    }
    const deployedCommit = commit(deployment?.deployedCommit, 'deployedCommit');
    for (const state of this.states.values()) {
      if (state.disposition !== 'fixed') continue;
      let contained = false;
      try {
        contained = deployment.isAncestor(state.fixCommit!, deployedCommit) === true;
      } catch {
        contained = false;
      }
      if (!contained) {
        throw new ClosureError(
          'NOT_CLOSABLE',
          `Fix for ${state.finding.id} is not contained in the deployed commit`,
        );
      }
    }

    this.closedBy = who;
    this.record('close', who);
  }

  private assertOpenForChanges(): void {
    if (this.isClosed) {
      throw new ClosureError('ALREADY_CLOSED', 'Audit is already closed');
    }
  }

  private authorize(actor: string, allowed: ReadonlySet<string>): string {
    const who = typeof actor === 'string' ? actor.trim().toLowerCase() : '';
    if (who === '' || !allowed.has(who)) {
      throw new ClosureError('UNAUTHORIZED', 'Actor is not authorized for this action');
    }
    return who;
  }

  private mustGet(id: unknown): FindingState {
    const state = typeof id === 'string' ? this.states.get(id) : undefined;
    if (!state) throw new ClosureError('UNKNOWN_FINDING', 'Unknown finding');
    return state;
  }

  private record(
    action: ClosureEvent['action'],
    actor: string,
    findingId?: string,
  ): void {
    this.log.push({ seq: this.log.length, action, actor, findingId });
  }
}

function principals(value: unknown, field: string): ReadonlySet<string> {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== 'string' || item.trim() === '')
  ) {
    throw new ClosureError('INVALID_INPUT', `${field} must be a non-empty list of principals`);
  }
  return new Set(value.map((item: string) => item.trim().toLowerCase()));
}

function commit(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^([0-9a-f]{40}|[0-9a-f]{64})$/i.test(value)) {
    throw new ClosureError('INVALID_INPUT', `${field} must be a full hex commit id`);
  }
  return value.toLowerCase();
}

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 512) {
    throw new ClosureError('INVALID_INPUT', `${field} is required`);
  }
  return value.trim();
}

function parseRemediation(value: unknown): RemediationInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ClosureError('INVALID_INPUT', 'Remediation must be an object');
  }
  const input = value as Partial<RemediationInput>;
  if (input.disposition === 'fixed') {
    const refs = input.testRefs;
    if (!Array.isArray(refs) || refs.length === 0) {
      throw new ClosureError('INVALID_INPUT', 'A fix requires at least one test reference');
    }
    return {
      findingId: nonEmpty(input.findingId, 'findingId'),
      disposition: 'fixed',
      fixCommit: commit(input.fixCommit, 'fixCommit'),
      testRefs: refs.map((ref) => nonEmpty(ref, 'testRef')),
    };
  }
  if (input.disposition === 'accepted-risk') {
    return {
      findingId: nonEmpty(input.findingId, 'findingId'),
      disposition: 'accepted-risk',
      riskAcceptanceRef: nonEmpty(input.riskAcceptanceRef, 'riskAcceptanceRef'),
    };
  }
  throw new ClosureError('INVALID_INPUT', 'disposition must be fixed or accepted-risk');
}

function parseVerification(value: unknown): VerificationInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ClosureError('INVALID_INPUT', 'Verification must be an object');
  }
  const input = value as Partial<VerificationInput>;
  if (input.verdict !== 'pass' && input.verdict !== 'fail') {
    throw new ClosureError('INVALID_INPUT', 'verdict must be pass or fail');
  }
  return {
    findingId: nonEmpty(input.findingId, 'findingId'),
    verdict: input.verdict,
    verifiedCommit:
      input.verifiedCommit === undefined
        ? undefined
        : commit(input.verifiedCommit, 'verifiedCommit'),
    evidenceRef: nonEmpty(input.evidenceRef, 'evidenceRef'),
  };
}
