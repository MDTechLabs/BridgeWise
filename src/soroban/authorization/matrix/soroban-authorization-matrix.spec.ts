import {
  actorRoles,
  defaultSorobanAuthorizationPolicy,
  SorobanAuthorizationCase,
  SorobanAuthorizationMatrix,
} from './soroban-authorization-matrix';

describe('SorobanAuthorizationMatrix', () => {
  it('generates the full actor × operation × mode grid', () => {
    const matrix = new SorobanAuthorizationMatrix();
    const cases = matrix.generate();

    expect(cases).toHaveLength(5 * 7 * 4);
    expect(cases.every((scenario) => scenario.id.includes(':'))).toBe(true);
  });

  it('passes the default policy across the whole grid', () => {
    const report = new SorobanAuthorizationMatrix().run();

    expect(report.total).toBeGreaterThan(0);
    expect(report.failed).toBe(0);
    expect(report.unsafeAllows).toHaveLength(0);
  });

  it('denies unknown callers regardless of authorization mode', () => {
    const matrix = new SorobanAuthorizationMatrix({ actors: ['unknown'] });
    const report = matrix.run();

    expect(report.results.every((r) => r.outcome.decision === 'deny')).toBe(true);
    expect(
      report.results.every((r) => r.outcome.reason === 'UNKNOWN_CALLER'),
    ).toBe(true);
  });

  it('denies privileged operations to an operator holding only its own role', () => {
    const matrix = new SorobanAuthorizationMatrix({
      actors: ['operator'],
      operations: ['pause'],
      modes: ['signed-auth-entry'],
    });

    const scenario = matrix.generate()[0];
    const outcome = defaultSorobanAuthorizationPolicy(scenario, {
      roles: ['operator'],
      paused: false,
    });

    expect(outcome.decision).toBe('deny');
    expect(outcome.reason).toBe('INSUFFICIENT_ROLE');
  });

  it('allows an owner to perform a privileged operation', () => {
    const scenario: SorobanAuthorizationCase = {
      id: 'owner:upgrade:signed-auth-entry',
      actor: 'owner',
      operation: 'upgrade',
      mode: 'signed-auth-entry',
      expected: 'allow',
    };

    const outcome = defaultSorobanAuthorizationPolicy(scenario, {
      roles: ['owner'],
      paused: false,
    });

    expect(outcome.decision).toBe('allow');
  });

  it('denies state-changing operations while the contract is paused', () => {
    const scenario: SorobanAuthorizationCase = {
      id: 'operator:deposit:source-account',
      actor: 'operator',
      operation: 'deposit',
      mode: 'source-account',
      expected: 'allow',
    };

    const outcome = defaultSorobanAuthorizationPolicy(scenario, {
      roles: ['operator'],
      paused: true,
    });

    expect(outcome.decision).toBe('deny');
    expect(outcome.reason).toBe('PAUSED');
  });

  it('treats a missing or expired auth entry as a denial', () => {
    const matrix = new SorobanAuthorizationMatrix({
      actors: ['owner'],
      operations: ['withdraw'],
      modes: ['no-auth', 'expired-auth'],
    });

    const report = matrix.run();

    expect(report.results.every((r) => r.outcome.decision === 'deny')).toBe(true);
    expect(report.results.map((r) => r.outcome.reason)).toEqual([
      'MISSING_AUTH',
      'EXPIRED_AUTH',
    ]);
  });

  it('flags an unsafe allow when a custom evaluator is too permissive', () => {
    const report = new SorobanAuthorizationMatrix({
      actors: ['unknown'],
      operations: ['withdraw'],
      modes: ['no-auth'],
    }).run(() => ({ caseId: 'x', decision: 'allow' }));

    expect(report.failed).toBe(1);
    expect(report.unsafeAllows).toHaveLength(1);
  });

  it('maps an actor to the role it holds', () => {
    expect(actorRoles('admin')).toEqual(['admin']);
    expect(actorRoles('unknown')).toEqual([]);
  });
});
