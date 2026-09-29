/**
 * Soroban authorization test matrix.
 *
 * Authorization is the part of a Soroban contract most likely to fail in ways
 * unit tests miss, because the failure mode is a missing rejection rather than
 * a thrown error. This module builds an explicit grid of caller, operation and
 * authorization-mode combinations, each with the outcome it must produce, and
 * evaluates a policy against the whole grid so that gaps show up as failures.
 */

export type SorobanAuthorizationActor =
  | 'owner'
  | 'admin'
  | 'operator'
  | 'guardian'
  | 'unknown';

export type SorobanAuthorizationMode =
  | 'source-account'
  | 'signed-auth-entry'
  | 'no-auth'
  | 'expired-auth';

export type SorobanAuthorizationOperation =
  | 'deposit'
  | 'withdraw'
  | 'pause'
  | 'unpause'
  | 'upgrade'
  | 'set-admin'
  | 'rotate-guardian';

export type SorobanAuthorizationDecision = 'allow' | 'deny';

export type SorobanAuthorizationDenyReason =
  | 'UNKNOWN_CALLER'
  | 'INSUFFICIENT_ROLE'
  | 'MISSING_AUTH'
  | 'EXPIRED_AUTH'
  | 'PAUSED'
  | 'SELF_AUTHORIZATION';

export interface SorobanAuthorizationCase {
  id: string;
  actor: SorobanAuthorizationActor;
  operation: SorobanAuthorizationOperation;
  mode: SorobanAuthorizationMode;
  expected: SorobanAuthorizationDecision;
}

export interface SorobanAuthorizationContext {
  /** Roles held by the caller, resolved before the matrix runs. */
  roles: SorobanAuthorizationActor[];
  paused: boolean;
}

export interface SorobanAuthorizationOutcome {
  caseId: string;
  decision: SorobanAuthorizationDecision;
  reason?: SorobanAuthorizationDenyReason;
}

export interface SorobanAuthorizationCaseResult {
  scenario: SorobanAuthorizationCase;
  outcome: SorobanAuthorizationOutcome;
  passed: boolean;
  /** 'expected allow but denied' or 'expected deny but allowed'. */
  failure?: string;
}

export interface SorobanAuthorizationMatrixReport {
  total: number;
  passed: number;
  failed: number;
  results: SorobanAuthorizationCaseResult[];
  unsafeAllows: SorobanAuthorizationCaseResult[];
}

export interface SorobanAuthorizationMatrixOptions {
  actors?: SorobanAuthorizationActor[];
  operations?: SorobanAuthorizationOperation[];
  modes?: SorobanAuthorizationMode[];
}

const ALL_ACTORS: SorobanAuthorizationActor[] = [
  'owner',
  'admin',
  'operator',
  'guardian',
  'unknown',
];

const ALL_OPERATIONS: SorobanAuthorizationOperation[] = [
  'deposit',
  'withdraw',
  'pause',
  'unpause',
  'upgrade',
  'set-admin',
  'rotate-guardian',
];

const ALL_MODES: SorobanAuthorizationMode[] = [
  'source-account',
  'signed-auth-entry',
  'no-auth',
  'expired-auth',
];

/** Operations that change protocol configuration and require the strongest roles. */
const PRIVILEGED_OPERATIONS: SorobanAuthorizationOperation[] = [
  'pause',
  'unpause',
  'upgrade',
  'set-admin',
  'rotate-guardian',
];

const PRIVILEGED_ROLES: SorobanAuthorizationActor[] = ['owner', 'admin'];

/** Operations that are unsafe to execute while a contract is paused. */
const STATE_CHANGING_OPERATIONS: SorobanAuthorizationOperation[] = [
  'deposit',
  'withdraw',
  'upgrade',
  'set-admin',
  'rotate-guardian',
];

export function isPrivilegedOperation(
  operation: SorobanAuthorizationOperation,
): boolean {
  return PRIVILEGED_OPERATIONS.includes(operation);
}

/**
 * Default policy: unknown callers are always denied, privileged operations
 * require an owner or admin, and state-changing operations are denied while
 * the contract is paused. Authentication itself is checked first, so a caller
 * cannot reach a role check without valid auth.
 */
export function defaultSorobanAuthorizationPolicy(
  scenario: SorobanAuthorizationCase,
  context: SorobanAuthorizationContext,
): SorobanAuthorizationOutcome {
  const base: SorobanAuthorizationOutcome = {
    caseId: scenario.id,
    decision: 'deny',
  };

  if (scenario.actor === 'unknown') {
    return { ...base, reason: 'UNKNOWN_CALLER' };
  }

  if (scenario.mode === 'no-auth') {
    return { ...base, reason: 'MISSING_AUTH' };
  }

  if (scenario.mode === 'expired-auth') {
    return { ...base, reason: 'EXPIRED_AUTH' };
  }

  if (!context.roles.includes(scenario.actor)) {
    return { ...base, reason: 'SELF_AUTHORIZATION' };
  }

  if (isPrivilegedOperation(scenario.operation)) {
    const authorised = PRIVILEGED_ROLES.some((role) =>
      context.roles.includes(role),
    );
    if (!authorised) {
      return { ...base, reason: 'INSUFFICIENT_ROLE' };
    }
  }

  if (context.paused && STATE_CHANGING_OPERATIONS.includes(scenario.operation)) {
    return { ...base, reason: 'PAUSED' };
  }

  return { ...base, decision: 'allow' };
}

function caseId(
  actor: SorobanAuthorizationActor,
  operation: SorobanAuthorizationOperation,
  mode: SorobanAuthorizationMode,
): string {
  return `${actor}:${operation}:${mode}`;
}

/**
 * Expected outcome for a scenario, derived from the same policy shape as
 * {@link defaultSorobanAuthorizationPolicy} but without the paused state, so a
 * generated matrix always has an expectation to assert against.
 */
export function expectedOutcome(
  scenario: SorobanAuthorizationCase,
): SorobanAuthorizationDecision {
  if (scenario.actor === 'unknown') return 'deny';
  if (scenario.mode === 'no-auth' || scenario.mode === 'expired-auth') {
    return 'deny';
  }
  if (isPrivilegedOperation(scenario.operation)) {
    return PRIVILEGED_ROLES.includes(scenario.actor) ? 'allow' : 'deny';
  }
  return 'allow';
}

export class SorobanAuthorizationMatrix {
  constructor(private readonly options: SorobanAuthorizationMatrixOptions = {}) {}

  /** Build the cartesian product of actors, operations and modes. */
  generate(): SorobanAuthorizationCase[] {
    const actors = this.options.actors ?? ALL_ACTORS;
    const operations = this.options.operations ?? ALL_OPERATIONS;
    const modes = this.options.modes ?? ALL_MODES;
    const cases: SorobanAuthorizationCase[] = [];

    for (const actor of actors) {
      for (const operation of operations) {
        for (const mode of modes) {
          const scenario: SorobanAuthorizationCase = {
            id: caseId(actor, operation, mode),
            actor,
            operation,
            mode,
            expected: 'deny',
          };
          scenario.expected = expectedOutcome(scenario);
          cases.push(scenario);
        }
      }
    }

    return cases;
  }

  /**
   * Evaluate every scenario and compare the policy's decision with the
   * expectation. `unsafeAllows` collects denials that were wrongly allowed —
   * the failures that actually matter for authorization.
   */
  run(
    evaluator: (
      scenario: SorobanAuthorizationCase,
      context: SorobanAuthorizationContext,
    ) => SorobanAuthorizationOutcome = defaultSorobanAuthorizationPolicy,
    contextBuilder: (
      scenario: SorobanAuthorizationCase,
      index: number,
    ) => SorobanAuthorizationContext = (scenario) => ({
      roles: actorRoles(scenario.actor),
      paused: false,
    }),
  ): SorobanAuthorizationMatrixReport {
    const results = this.generate().map((scenario, index) => {
      const context = contextBuilder(scenario, index);
      const outcome = evaluator(scenario, context);
      const passed = outcome.decision === scenario.expected;

      return {
        scenario,
        outcome,
        passed,
        failure: passed
          ? undefined
          : `expected ${scenario.expected} but got ${outcome.decision}`,
      };
    });

    return {
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      results,
      unsafeAllows: results.filter(
        (result) =>
          !result.passed &&
          result.scenario.expected === 'deny' &&
          result.outcome.decision === 'allow',
      ),
    };
  }
}

/** Roles a given actor holds when acting as itself. */
export function actorRoles(
  actor: SorobanAuthorizationActor,
): SorobanAuthorizationActor[] {
  return actor === 'unknown' ? [] : [actor];
}
