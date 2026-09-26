import { StellarPreExecutionSafetyPipeline } from '../../../src/execution/safety/stellar';
import type { StellarPreExecutionSafetyContext } from '../../../src/execution/validation';

function validContext(
  overrides: Partial<StellarPreExecutionSafetyContext> = {},
): StellarPreExecutionSafetyContext {
  return {
    quoteQuotedAt: 1_000,
    quoteTtlMs: 5_000,
    destinationAccount: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    destinationExists: true,
    destinationFunded: true,
    transferAsset: 'USDC',
    transferAmount: 100,
    availableTransferBalance: 150,
    estimatedNetworkFee: 1,
    availableFeeBalance: 10,
    requiredTrustlines: [{ code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' }],
    existingTrustlines: [{ code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' }],
    quotedOutput: 98,
    minimumOutput: 95,
    resources: { cpuInstructions: 100, memoryBytes: 50, fee: 20 },
    resourceLimits: { cpuInstructions: 1000, memoryBytes: 500, fee: 100 },
    contractCompatible: true,
    ...overrides,
  };
}

describe('StellarPreExecutionSafetyPipeline (#999)', () => {
  const pipeline = new StellarPreExecutionSafetyPipeline({ now: () => 2_000 });

  it('passes when every check succeeds', () => {
    const result = pipeline.run(validContext());
    expect(result.safe).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.checks).toHaveLength(7);
    expect(result.failures).toEqual([]);
  });

  it('blocks stale quotes with an actionable reason', () => {
    const result = pipeline.run(validContext({ quoteQuotedAt: 0, quoteTtlMs: 500 }));
    expect(result.blocked).toBe(true);
    expect(result.failures.some((f) => f.code === 'QUOTE_STALE')).toBe(true);
    expect(result.failures.find((f) => f.code === 'QUOTE_STALE')?.action).toMatch(/Refresh the quote/);
  });

  it('blocks missing trustlines, low output, and incompatible contracts', () => {
    const result = pipeline.run(
      validContext({
        existingTrustlines: [],
        quotedOutput: 10,
        minimumOutput: 95,
        contractCompatible: false,
        contractCompatibilityReasons: ['missing bridge()'],
      }),
    );
    expect(result.safe).toBe(false);
    expect(result.failures.map((f) => f.code)).toEqual(
      expect.arrayContaining(['TRUSTLINE_MISSING', 'OUTPUT_BELOW_MINIMUM', 'CONTRACT_INCOMPATIBLE']),
    );
  });

  it('blocks insufficient balances and resource overruns', () => {
    const result = pipeline.run(
      validContext({
        availableTransferBalance: 1,
        availableFeeBalance: 0,
        resources: { cpuInstructions: 9_000, memoryBytes: 9_000, fee: 9_000 },
      }),
    );
    expect(result.blocked).toBe(true);
    expect(result.failures.map((f) => f.code)).toEqual(
      expect.arrayContaining([
        'INSUFFICIENT_TRANSFER_BALANCE',
        'INSUFFICIENT_FEE_BALANCE',
        'CPU_LIMIT_EXCEEDED',
        'MEMORY_LIMIT_EXCEEDED',
        'FEE_LIMIT_EXCEEDED',
      ]),
    );
  });
});
