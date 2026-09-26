import {
  PreSigningBlockedError,
  PreSigningCheckError,
  PreSigningSafetyGate,
  PRE_SIGNING_CHECKS,
  type PreSigningCheckSet,
} from './pre-signing-safety-gate';

const CONTEXT = { intentId: 'intent-1' };

function passingChecks(
  overrides: Partial<PreSigningCheckSet<typeof CONTEXT>> = {},
): PreSigningCheckSet<typeof CONTEXT> {
  return {
    balance: jest.fn().mockResolvedValue(undefined),
    allowance: jest.fn().mockResolvedValue(undefined),
    routeValidity: jest.fn().mockResolvedValue(undefined),
    limits: jest.fn().mockResolvedValue(undefined),
    providerHealth: jest.fn().mockResolvedValue(undefined),
    quoteFreshness: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('PreSigningSafetyGate', () => {
  it('runs every required check before calling the signer', async () => {
    const order: string[] = [];
    const checks = passingChecks({
      balance: jest.fn(async () => void order.push('balance')),
      allowance: jest.fn(async () => void order.push('allowance')),
      routeValidity: jest.fn(async () => void order.push('route')),
      limits: jest.fn(async () => void order.push('limits')),
      providerHealth: jest.fn(async () => void order.push('provider')),
      quoteFreshness: jest.fn(async () => void order.push('quote')),
    });
    const signer = jest.fn(async () => {
      order.push('sign');
      return 'signed-payload';
    });
    const gate = new PreSigningSafetyGate(checks, { now: () => 123 });

    const result = await gate.sign(CONTEXT, signer);

    expect(result).toMatchObject({
      signed: 'signed-payload',
      checkedAt: 123,
      checks: PRE_SIGNING_CHECKS.map((check) => ({ check, passed: true })),
    });
    expect(order).toEqual([
      'balance',
      'allowance',
      'route',
      'limits',
      'provider',
      'quote',
      'sign',
    ]);
  });

  it.each(PRE_SIGNING_CHECKS)(
    'does not sign when the %s check fails',
    async (failedCheck) => {
      const checks = passingChecks();
      const checkMethods = {
        balance: 'balance',
        allowance: 'allowance',
        route_validity: 'routeValidity',
        limits: 'limits',
        provider_health: 'providerHealth',
        quote_freshness: 'quoteFreshness',
      } as const;
      const method = checkMethods[failedCheck];
      checks[method] = jest
        .fn()
        .mockRejectedValue(new PreSigningCheckError('PRECONDITION_FAILED'));
      const signer = jest.fn().mockResolvedValue('must-not-be-signed');
      const gate = new PreSigningSafetyGate(checks);

      await expect(gate.sign(CONTEXT, signer)).rejects.toMatchObject({
        name: 'PreSigningBlockedError',
        failures: [{ check: failedCheck, code: 'PRECONDITION_FAILED' }],
      });
      expect(signer).not.toHaveBeenCalled();
    },
  );

  it('fails closed when a provider check is unavailable without exposing its error', async () => {
    const checks = passingChecks({
      providerHealth: jest
        .fn()
        .mockRejectedValue(new Error('private account and provider response')),
    });
    const signer = jest.fn();
    const gate = new PreSigningSafetyGate(checks);

    let thrown: unknown;
    try {
      await gate.sign(CONTEXT, signer);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PreSigningBlockedError);
    expect(thrown).toMatchObject({
      failures: [{ check: 'provider_health', code: 'CHECK_UNAVAILABLE' }],
    });
    expect(String(thrown)).not.toContain('private account');
    expect(signer).not.toHaveBeenCalled();
  });

  it('normalizes unsafe failure codes before exposing them to metrics or callers', async () => {
    const checks = passingChecks({
      balance: jest
        .fn()
        .mockRejectedValue(
          new PreSigningCheckError('wallet-GSECRET-amount-123'),
        ),
    });
    const gate = new PreSigningSafetyGate(checks);

    await expect(
      gate.sign(CONTEXT, async () => 'signed'),
    ).rejects.toMatchObject({
      failures: [{ check: 'balance', code: 'PRECONDITION_FAILED' }],
    });
  });

  it('does not let a metrics callback failure interrupt successful validation', async () => {
    const gate = new PreSigningSafetyGate(passingChecks(), {
      onCheckComplete: () => {
        throw new Error('metrics backend unavailable');
      },
    });

    await expect(
      gate.sign(CONTEXT, async () => 'signed'),
    ).resolves.toMatchObject({
      signed: 'signed',
    });
  });

  it('does not let an observer mutate a failed check into a passing check', async () => {
    const checks = passingChecks({
      allowance: jest
        .fn()
        .mockRejectedValue(new PreSigningCheckError('LOW_ALLOWANCE')),
    });
    const gate = new PreSigningSafetyGate(checks, {
      onCheckComplete: (event) => {
        event.passed = true;
      },
    });
    const signer = jest.fn();

    await expect(gate.sign(CONTEXT, signer)).rejects.toMatchObject({
      failures: [{ check: 'allowance', passed: false, code: 'LOW_ALLOWANCE' }],
    });
    expect(signer).not.toHaveBeenCalled();
  });

  it('rejects an invalid clock before checks or signing', async () => {
    const checks = passingChecks();
    const signer = jest.fn();
    const gate = new PreSigningSafetyGate(checks, { now: () => Number.NaN });

    await expect(gate.sign(CONTEXT, signer)).rejects.toThrow(RangeError);
    expect(checks.balance).not.toHaveBeenCalled();
    expect(signer).not.toHaveBeenCalled();
  });
});
