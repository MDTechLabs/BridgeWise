/**
 * Unauthorized caller regression tests.
 *
 * Most access-control bugs are not exceptions — they are operations that were
 * supposed to be refused and were not. This module models access-control rules
 * as data, ships a regression suite of the caller/role combinations that must
 * be refused, and reports any case the guard wrongly allows. A handful of
 * authorized cases are included so the suite also catches over-blocking.
 */

export type AccessRole =
  | 'owner'
  | 'admin'
  | 'operator'
  | 'relayer'
  | 'guardian'
  | 'unknown';

export interface AccessControlRule {
  contract: string;
  function: string;
  allowedRoles: AccessRole[];
  /** Roles that are never allowed to call the function, regardless of role list. */
  deniedRoles?: AccessRole[];
}

export interface CallerContext {
  caller: string;
  roles: AccessRole[];
  /** Whether the transaction carried valid authentication. */
  authValid: boolean;
  paused?: boolean;
}

export type AccessDecisionCode =
  | 'ALLOWED'
  | 'UNKNOWN_CALLER'
  | 'ROLE_NOT_PERMITTED'
  | 'AUTH_REQUIRED'
  | 'EXPLICITLY_DENIED';

export interface AccessDecision {
  allowed: boolean;
  code: AccessDecisionCode;
  message: string;
}

export interface UnauthorizedCallerRegressionCase {
  id: string;
  description: string;
  rule: AccessControlRule;
  context: CallerContext;
  expected: 'allow' | 'deny';
}

export interface CallerRegressionResult {
  caseId: string;
  expected: 'allow' | 'deny';
  decision: AccessDecision;
  passed: boolean;
}

export interface CallerRegressionReport {
  total: number;
  passed: number;
  failed: number;
  /** Cases that were supposed to be refused but were allowed through. */
  unsafeAllows: CallerRegressionResult[];
  results: CallerRegressionResult[];
}

const CONTRACT = 'CBRIDGEWISE';

/** Rules used by the shipped regression cases. */
export const REGRESSION_RULES = {
  deposit: {
    contract: CONTRACT,
    function: 'deposit',
    allowedRoles: ['operator', 'admin', 'owner'],
  } as AccessControlRule,
  withdraw: {
    contract: CONTRACT,
    function: 'withdraw',
    allowedRoles: ['operator', 'admin', 'owner'],
  } as AccessControlRule,
  pause: {
    contract: CONTRACT,
    function: 'pause',
    allowedRoles: ['admin', 'owner'],
  } as AccessControlRule,
  upgrade: {
    contract: CONTRACT,
    function: 'upgrade',
    allowedRoles: ['admin', 'owner'],
  } as AccessControlRule,
  setAdmin: {
    contract: CONTRACT,
    function: 'set_admin',
    allowedRoles: ['owner'],
  } as AccessControlRule,
};

/**
 * The regression suite. Every `deny` case is a caller the guard must refuse;
 * the `allow` cases guard against a fix that blocks legitimate callers.
 */
export const UNAUTHORIZED_CALLER_REGRESSION_CASES: UnauthorizedCallerRegressionCase[] =
  [
    {
      id: 'unknown-caller-deposit',
      description: 'a caller holding no role cannot deposit',
      rule: REGRESSION_RULES.deposit,
      context: { caller: 'GUNKNOWN', roles: [], authValid: true },
      expected: 'deny',
    },
    {
      id: 'relayer-withdraw',
      description: 'a relayer cannot withdraw funds directly',
      rule: REGRESSION_RULES.withdraw,
      context: { caller: 'GRELAYER', roles: ['relayer'], authValid: true },
      expected: 'deny',
    },
    {
      id: 'operator-pause',
      description: 'an operator cannot pause the contract',
      rule: REGRESSION_RULES.pause,
      context: { caller: 'GOPERATOR', roles: ['operator'], authValid: true },
      expected: 'deny',
    },
    {
      id: 'guardian-upgrade',
      description: 'a guardian cannot upgrade the contract',
      rule: REGRESSION_RULES.upgrade,
      context: { caller: 'GGUARDIAN', roles: ['guardian'], authValid: true },
      expected: 'deny',
    },
    {
      id: 'admin-set-admin',
      description: 'an admin cannot replace the owner',
      rule: REGRESSION_RULES.setAdmin,
      context: { caller: 'GADMIN', roles: ['admin'], authValid: true },
      expected: 'deny',
    },
    {
      id: 'missing-auth-operator',
      description: 'a role without valid auth cannot deposit',
      rule: REGRESSION_RULES.deposit,
      context: { caller: 'GOPERATOR', roles: ['operator'], authValid: false },
      expected: 'deny',
    },
    {
      id: 'owner-deposit',
      description: 'the owner may deposit',
      rule: REGRESSION_RULES.deposit,
      context: { caller: 'GOWNER', roles: ['owner'], authValid: true },
      expected: 'allow',
    },
    {
      id: 'admin-upgrade',
      description: 'an admin with valid auth may upgrade',
      rule: REGRESSION_RULES.upgrade,
      context: { caller: 'GADMIN', roles: ['admin'], authValid: true },
      expected: 'allow',
    },
  ];

export class UnauthorizedCallerGuard {
  constructor(private readonly rules: AccessControlRule[] = []) {}

  ruleFor(contract: string, fn: string): AccessControlRule | undefined {
    return this.rules.find(
      (rule) => rule.contract === contract && rule.function === fn,
    );
  }

  evaluate(rule: AccessControlRule, context: CallerContext): AccessDecision {
    if (!context.authValid) {
      return {
        allowed: false,
        code: 'AUTH_REQUIRED',
        message: `${rule.function} requires valid authentication`,
      };
    }

    const roles = context.roles.filter((role) => role !== 'unknown');

    if (roles.length === 0) {
      return {
        allowed: false,
        code: 'UNKNOWN_CALLER',
        message: `Caller ${context.caller} holds no role`,
      };
    }

    if (rule.deniedRoles?.some((role) => roles.includes(role))) {
      return {
        allowed: false,
        code: 'EXPLICITLY_DENIED',
        message: `Caller ${context.caller} holds a role explicitly denied for ${rule.function}`,
      };
    }

    if (!roles.some((role) => rule.allowedRoles.includes(role))) {
      return {
        allowed: false,
        code: 'ROLE_NOT_PERMITTED',
        message: `Caller ${context.caller} lacks a role permitted for ${rule.function}`,
      };
    }

    return {
      allowed: true,
      code: 'ALLOWED',
      message: `Caller ${context.caller} is permitted to call ${rule.function}`,
    };
  }
}

export function runUnauthorizedCallerRegressionSuite(
  guard: UnauthorizedCallerGuard = new UnauthorizedCallerGuard(),
  cases: UnauthorizedCallerRegressionCase[] = UNAUTHORIZED_CALLER_REGRESSION_CASES,
): CallerRegressionReport {
  const results = cases.map((testCase) => {
    const decision = guard.evaluate(testCase.rule, testCase.context);

    return {
      caseId: testCase.id,
      expected: testCase.expected,
      decision,
      passed: (testCase.expected === 'allow') === decision.allowed,
    };
  });

  return {
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    unsafeAllows: results.filter(
      (result) =>
        !result.passed &&
        result.expected === 'deny' &&
        result.decision.allowed,
    ),
    results,
  };
}
