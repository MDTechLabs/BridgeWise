import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BURN_ADDRESSES,
  TREASURY_INVARIANTS,
  TREASURY_PARAMETER_SET,
  TreasuryAddressError,
  TreasuryChainPlan,
  TreasuryPlan,
  TreasuryReader,
  isBurnAddress,
  normalizeAddress,
  testChainPlan,
  testRolePlan,
  testTreasuryPlan,
  validateTreasuryPlan,
  verifyTreasuryAddresses,
} from './treasury-address-verification';

const SPEC_DOC = join(__dirname, '..', 'docs', 'TREASURY_ADDRESS_VERIFICATION.md');

function single(overrides: Partial<TreasuryChainPlan> = {}): TreasuryPlan {
  return testTreasuryPlan({ chains: [testChainPlan(overrides)] });
}

function reader(overrides: Partial<TreasuryReader> = {}): TreasuryReader {
  const chain = testChainPlan();
  return {
    getChainId: jest.fn().mockResolvedValue(1n),
    getBlockNumber: jest.fn().mockResolvedValue(100),
    getCode: jest.fn().mockResolvedValue('0x6000'),
    readRoles: jest.fn().mockResolvedValue({
      treasury: chain.roles.treasury,
      feeRecipient: chain.roles.feeRecipient,
    }),
    ...overrides,
  } as TreasuryReader;
}

function expectError(fn: () => unknown, code?: string): TreasuryAddressError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(TreasuryAddressError);
    if (code) expect((error as TreasuryAddressError).code).toBe(code);
    return error as TreasuryAddressError;
  }
  throw new Error(`expected TreasuryAddressError ${code ?? ''}`);
}

describe('treasury and fee recipient verification specification (#1524)', () => {
  it('documents every invariant and the parameter set in the normative spec', () => {
    const doc = readFileSync(SPEC_DOC, 'utf8');
    for (const id of TREASURY_INVARIANTS) expect(doc).toContain(`\`${id}\``);
    expect(doc).toContain(TREASURY_PARAMETER_SET);
    expect(doc).toContain('burn');
  });

  it('normalizes EVM and Stellar addresses and rejects malformed input', () => {
    expect(normalizeAddress(`0x${'AB'.repeat(20)}`, 'x')).toBe(`0x${'ab'.repeat(20)}`);
    expect(normalizeAddress(`G${'A'.repeat(55)}`, 'x')).toBe(`G${'A'.repeat(55)}`);
    expectError(() => normalizeAddress('0x123', 'x'), 'invalid-address');
    expect(normalizeAddress(`0x${'0'.repeat(40)}`, 'x')).toBe(`0x${'0'.repeat(40)}`);
    expect(isBurnAddress(`0x${'0'.repeat(40)}`)).toBe(true);
    expect(isBurnAddress(BURN_ADDRESSES[0])).toBe(true);
  });

  it('validates reviewed-plan boundaries', () => {
    const base = single();
    expect(validateTreasuryPlan(base).chains).toHaveLength(1);
    expectError(() => validateTreasuryPlan({ ...base, schemaVersion: 2 }), 'unsupported-schema');
    expectError(() => validateTreasuryPlan({ ...base, parameterSetVersion: 'x' }), 'unsupported-parameter-set');
    expectError(() => validateTreasuryPlan({ ...base, releaseId: 'bad' }), 'invalid-release');
    expectError(() => validateTreasuryPlan({ ...base, chains: [] }), 'invalid-chains');
    expectError(() => validateTreasuryPlan(single({ minConfirmations: 0 })), 'invalid-confirmations');
    expectError(() => validateTreasuryPlan(single({ chainId: 'evm:0' })), 'invalid-chain');
    expectError(
      () => validateTreasuryPlan(single({ roles: testRolePlan({ feeRecipient: testRolePlan().treasury }) })),
      'roles-not-distinct',
    );
    expectError(
      () => validateTreasuryPlan(single({ roles: testRolePlan({ treasury: `0x${'0'.repeat(40)}` }) })),
      'burn-address',
    );
    expectError(
      () => validateTreasuryPlan(single({ roles: testRolePlan({ reserved: [testRolePlan().treasury] }) })),
      'reserved-address',
    );
  });

  it('passes when on-chain roles match the reviewed plan', async () => {
    const report = await verifyTreasuryAddresses(single(), reader());
    expect(report.passed).toBe(true);
    expect(report.chains[0].checkedBlock).toBe(88);
    expect(report.chains[0].checks.every((c) => c.status === 'passed')).toBe(true);
  });

  it('fails closed when either on-chain recipient differs', async () => {
    const r = reader({
      readRoles: jest.fn().mockResolvedValue({
        treasury: testRolePlan().treasury,
        feeRecipient: `0x${'9'.repeat(40)}`,
      }),
    });
    const report = await verifyTreasuryAddresses(single(), r);
    expect(report.passed).toBe(false);
    expect(report.chains[0].checks.find((c) => c.id === 'onchain:fee-recipient')?.status).toBe('failed');
  });

  it('fails closed on a burn address or duplicate observed recipient', async () => {
    const r = reader({
      readRoles: jest.fn().mockResolvedValue({
        treasury: BURN_ADDRESSES[1],
        feeRecipient: BURN_ADDRESSES[1],
      }),
    });
    const report = await verifyTreasuryAddresses(single(), r);
    expect(report.passed).toBe(false);
    expect(report.chains[0].checks.find((c) => c.id === 'onchain:not-burn')?.status).toBe('failed');
    expect(report.chains[0].checks.find((c) => c.id === 'onchain:distinct')?.status).toBe('failed');
  });

  it('does not throw on malformed observed values', async () => {
    const r = reader({
      readRoles: jest.fn().mockResolvedValue({ treasury: 'not-an-address', feeRecipient: null }),
    });
    const report = await verifyTreasuryAddresses(single(), r);
    expect(report.passed).toBe(false);
    expect(report.chains[0].checks.find((c) => c.id === 'onchain:treasury')?.status).toBe('failed');
    expect(report.chains[0].checks.find((c) => c.id === 'onchain:fee-recipient')?.status).toBe('failed');
  });

  it('fails closed on chain mismatch without further RPC reads', async () => {
    const r = reader({ getChainId: jest.fn().mockResolvedValue(56n) });
    const report = await verifyTreasuryAddresses(single(), r);
    expect(report.passed).toBe(false);
    expect(report.chains[0].checkedBlock).toBeNull();
    expect(r.getBlockNumber).not.toHaveBeenCalled();
  });

  it('fails closed when the pinned block is too shallow', async () => {
    const r = reader({ getBlockNumber: jest.fn().mockResolvedValue(11) });
    const report = await verifyTreasuryAddresses(single(), r);
    expect(report.passed).toBe(false);
    expect(report.chains[0].checks.find((c) => c.id === 'pinned-block')?.status).toBe('failed');
    expect(r.readRoles).not.toHaveBeenCalled();
  });

  it('fails closed without leaking provider errors', async () => {
    const r = reader({
      getChainId: jest.fn().mockRejectedValue(new Error('rpc-secret-token')),
      getBlockNumber: jest.fn().mockRejectedValue(new Error('rpc-secret-token')),
      getCode: jest.fn().mockRejectedValue(new Error('rpc-secret-token')),
      readRoles: jest.fn().mockRejectedValue(new Error('rpc-secret-token')),
    });
    const report = await verifyTreasuryAddresses(single(), r);
    expect(report.passed).toBe(false);
    expect(JSON.stringify(report)).not.toContain('secret-token');
  });

  it('requires runtime code when the reviewed plan says the recipient is a contract', async () => {
    const r = reader({ getCode: jest.fn().mockResolvedValue('0x') });
    const report = await verifyTreasuryAddresses(single(), r);
    expect(report.passed).toBe(false);
    expect(report.chains[0].checks.find((c) => c.id === 'registry:contract-code')?.status).toBe('failed');
  });

  it('supports Stellar recipient formats and rejects cross-family formats', async () => {
    const stellar = testChainPlan({
      chainId: 'soroban:stellar',
      registryAddress: `G${'A'.repeat(55)}`,
      roles: testRolePlan({ treasury: `G${'A'.repeat(54)}B`, feeRecipient: `G${'A'.repeat(54)}C`, reserved: [] }),
    });
    const r = reader({
      getChainId: jest.fn().mockResolvedValue('soroban:stellar'),
      getCode: jest.fn().mockResolvedValue('0x6000'),
      readRoles: jest.fn().mockResolvedValue({ treasury: `G${'A'.repeat(54)}B`, feeRecipient: `G${'A'.repeat(54)}C` }),
    });
    expect((await verifyTreasuryAddresses(single(stellar), r)).passed).toBe(true);

    const mismatch = single({ ...stellar, roles: testRolePlan({
      treasury: `0x${'1'.repeat(40)}`,
      feeRecipient: `G${'A'.repeat(54)}C`,
      reserved: [],
    }) });
    const r2 = reader({
      getChainId: jest.fn().mockResolvedValue('soroban:stellar'),
      readRoles: jest.fn().mockResolvedValue({ treasury: `0x${'1'.repeat(40)}`, feeRecipient: `G${'A'.repeat(54)}C` }),
    });
    const report = await verifyTreasuryAddresses(mismatch, r2);
    expect(report.passed).toBe(false);
    expect(report.chains[0].checks.find((c) => c.id === 'plan:chain-format')?.status).toBe('failed');
  });

  it('fails closed across adversarial observed values without throwing', async () => {
    const values = [undefined, null, 0, [], {}, '0xzz', `0x${'0'.repeat(40)}`, `G${'A'.repeat(55)}`];
    for (const value of values) {
      const r = reader({
        readRoles: jest.fn().mockResolvedValue({ treasury: value, feeRecipient: value }),
      });
      const report = await verifyTreasuryAddresses(single(), r);
      expect(report.passed).toBe(false);
      expect(report.chains[0].checks.length).toBeGreaterThan(0);
    }
  });
});
