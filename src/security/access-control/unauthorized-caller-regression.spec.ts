import {
  AccessDecision,
  CallerContext,
  REGRESSION_RULES,
  UnauthorizedCallerGuard,
  UNAUTHORIZED_CALLER_REGRESSION_CASES,
  runUnauthorizedCallerRegressionSuite,
} from './unauthorized-caller-regression';

function context(overrides: Partial<CallerContext> = {}): CallerContext {
  return { caller: 'GCALLER', roles: [], authValid: true, ...overrides };
}

describe('UnauthorizedCallerGuard', () => {
  const guard = new UnauthorizedCallerGuard();

  it('rejects a caller that holds no role', () => {
    const decision = guard.evaluate(REGRESSION_RULES.deposit, context());

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('UNKNOWN_CALLER');
  });

  it('rejects a caller whose role is not permitted', () => {
    const decision = guard.evaluate(
      REGRESSION_RULES.pause,
      context({ roles: ['operator'] }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('ROLE_NOT_PERMITTED');
  });

  it('rejects a caller without valid authentication before checking the role', () => {
    const decision = guard.evaluate(
      REGRESSION_RULES.deposit,
      context({ roles: ['operator'], authValid: false }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('AUTH_REQUIRED');
  });

  it('rejects a role that is explicitly denied even if otherwise permitted', () => {
    const rule = {
      ...REGRESSION_RULES.deposit,
      deniedRoles: ['operator' as const],
    };
    const decision = guard.evaluate(rule, context({ roles: ['operator'] }));

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('EXPLICITLY_DENIED');
  });

  it('allows a permitted role with valid auth', () => {
    const decision = guard.evaluate(
      REGRESSION_RULES.upgrade,
      context({ roles: ['admin'] }),
    );

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('ALLOWED');
  });
});

describe('runUnauthorizedCallerRegressionSuite', () => {
  it('passes every shipped case', () => {
    const report = runUnauthorizedCallerRegressionSuite(
      new UnauthorizedCallerGuard(),
    );

    expect(report.total).toBe(UNAUTHORIZED_CALLER_REGRESSION_CASES.length);
    expect(report.failed).toBe(0);
    expect(report.unsafeAllows).toHaveLength(0);
    expect(report.passed).toBe(report.total);
  });

  it('covers both refused and permitted callers', () => {
    const expected = new Set(
      UNAUTHORIZED_CALLER_REGRESSION_CASES.map((testCase) => testCase.expected),
    );

    expect(expected.has('deny')).toBe(true);
    expect(expected.has('allow')).toBe(true);
  });

  it('surfaces an unsafe allow when a guard is too permissive', () => {
    class PermissiveGuard extends UnauthorizedCallerGuard {
      evaluate(): AccessDecision {
        return { allowed: true, code: 'ALLOWED', message: 'permissive' };
      }
    }

    const report = runUnauthorizedCallerRegressionSuite(new PermissiveGuard());
    const deniedCases = UNAUTHORIZED_CALLER_REGRESSION_CASES.filter(
      (testCase) => testCase.expected === 'deny',
    ).length;

    expect(report.unsafeAllows).toHaveLength(deniedCases);
    expect(report.failed).toBe(deniedCases);
  });
});
