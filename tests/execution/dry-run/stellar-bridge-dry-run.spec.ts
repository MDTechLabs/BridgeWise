import { StellarBridgeDryRunService } from '../../../src/execution/dry-run/stellar/stellar-bridge-dry-run.service';
import type {
  DryRunExecutionPlanRequest,
  DryRunSafetyContextBuilder,
} from '../../../src/execution/dry-run/stellar/types';

function validRequest(
  overrides: Partial<DryRunExecutionPlanRequest> = {},
): DryRunExecutionPlanRequest {
  return {
    transferId: 'transfer-001',
    sourceAccount: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    destinationAccount:
      'GBCDEFGHJKLMNPQRSTUVWXYZBCDEFGHJKLMNPQRSTUVWXYZBCDEFGHJK',
    asset: 'USDC',
    amount: '100',
    bridgeContractAddress:
      'CBRIDGE2ABC34567890ABCDEFGHJKLMNPQRSTUVWXYZ1234567890ABC',
    ...overrides,
  };
}

function validSafetyContext(
  overrides: Partial<DryRunSafetyContextBuilder> = {},
): DryRunSafetyContextBuilder {
  return {
    quoteQuotedAt: 1_000,
    quoteTtlMs: 5_000,
    destinationExists: true,
    destinationFunded: true,
    availableTransferBalance: 150,
    estimatedNetworkFee: 1,
    availableFeeBalance: 10,
    requiredTrustlines: [
      {
        code: 'USDC',
        issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      },
    ],
    existingTrustlines: [
      {
        code: 'USDC',
        issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      },
    ],
    quotedOutput: 98,
    minimumOutput: 95,
    resources: { cpuInstructions: 100, memoryBytes: 50, fee: 20 },
    resourceLimits: { cpuInstructions: 1000, memoryBytes: 500, fee: 100 },
    contractCompatible: true,
    ...overrides,
  };
}

function mockRpc() {
  return {
    simulateTransaction: jest.fn().mockResolvedValue({
      result: {
        status: 'SUCCESS',
        cost: {
          cpuInstructions: 50,
          memoryBytes: 25,
          fee: '0.00001',
        },
        retval: 'ok',
      },
    }),
  };
}

describe('StellarBridgeDryRunService', () => {
  it('should build an execution plan and return dry-run results', async () => {
    const rpc = mockRpc();
    const service = new StellarBridgeDryRunService(rpc, { now: () => 2_000 });

    const result = await service.execute(validRequest(), validSafetyContext());

    expect(result.dryRun).toBe(true);
    expect(result.transactionSubmitted).toBe(false);
    expect(result.transferId).toBe('transfer-001');
    expect(result.executionPlan).toHaveLength(3);
    expect(result.executionPlan.map((s) => s.stepId)).toEqual([
      'lock-source-asset',
      'initiate-bridge',
      'confirm-transfer',
    ]);
  });

  it('should simulate each step via the RPC adapter', async () => {
    const rpc = mockRpc();
    const service = new StellarBridgeDryRunService(rpc);

    await service.execute(validRequest(), validSafetyContext());

    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(3);
  });

  it('should compute a deterministic execution hash', async () => {
    const rpc = mockRpc();
    const service = new StellarBridgeDryRunService(rpc);

    const result1 = await service.execute(validRequest(), validSafetyContext());
    const result2 = await service.execute(validRequest(), validSafetyContext());

    expect(result1.executionHash).toBe(result2.executionHash);
    expect(result1.executionHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should aggregate simulation summaries from successful steps', async () => {
    const rpc = mockRpc();
    const service = new StellarBridgeDryRunService(rpc);

    const result = await service.execute(validRequest(), validSafetyContext());

    expect(result.simulationSummary.totalSteps).toBe(3);
    expect(result.simulationSummary.successfulSteps).toBe(3);
    expect(result.simulationSummary.failedSteps).toBe(0);
    expect(result.simulationSummary.estimatedCpuInstructions).toBe(150);
    expect(result.simulationSummary.estimatedMemoryBytes).toBe(75);
  });

  it('should run safety checks and return safe when all pass', async () => {
    const rpc = mockRpc();
    const service = new StellarBridgeDryRunService(rpc, { now: () => 2_000 });

    const result = await service.execute(validRequest(), validSafetyContext());

    expect(result.safetyResult.safe).toBe(true);
    expect(result.safetyResult.blocked).toBe(false);
    expect(result.safetyResult.failures).toHaveLength(0);
  });

  it('should block when safety checks fail', async () => {
    const rpc = mockRpc();
    const service = new StellarBridgeDryRunService(rpc, { now: () => 2_000 });

    const result = await service.execute(
      validRequest(),
      validSafetyContext({
        contractCompatible: false,
        contractCompatibilityReasons: ['missing bridge()'],
      }),
    );

    expect(result.safetyResult.safe).toBe(false);
    expect(result.safetyResult.blocked).toBe(true);
    expect(
      result.safetyResult.failures.some(
        (f) => f.code === 'CONTRACT_INCOMPATIBLE',
      ),
    ).toBe(true);
  });

  it('should report failed steps when simulation fails', async () => {
    const rpc = {
      simulateTransaction: jest.fn().mockResolvedValue({
        error: { message: 'simulation failed' },
      }),
    };
    const service = new StellarBridgeDryRunService(rpc);

    const result = await service.execute(validRequest(), validSafetyContext());

    expect(result.simulationSummary.failedSteps).toBe(3);
    expect(result.simulationSummary.successfulSteps).toBe(0);
  });

  it('should throw for missing transferId', async () => {
    const rpc = mockRpc();
    const service = new StellarBridgeDryRunService(rpc);

    await expect(
      service.execute(validRequest({ transferId: '' }), validSafetyContext()),
    ).rejects.toThrow('transferId is required');
  });

  it('should throw for invalid amount', async () => {
    const rpc = mockRpc();
    const service = new StellarBridgeDryRunService(rpc);

    await expect(
      service.execute(validRequest({ amount: '0' }), validSafetyContext()),
    ).rejects.toThrow('amount must be a positive numeric value');
  });

  it('should throw for missing bridgeContractAddress', async () => {
    const rpc = mockRpc();
    const service = new StellarBridgeDryRunService(rpc);

    await expect(
      service.execute(
        validRequest({ bridgeContractAddress: '' }),
        validSafetyContext(),
      ),
    ).rejects.toThrow('bridgeContractAddress is required');
  });

  it('should include completedAt timestamp in the result', async () => {
    const rpc = mockRpc();
    const now = 1_700_000_000_000;
    const service = new StellarBridgeDryRunService(rpc, { now: () => now });

    const result = await service.execute(validRequest(), validSafetyContext());

    expect(result.completedAt).toBeInstanceOf(Date);
  });
});
