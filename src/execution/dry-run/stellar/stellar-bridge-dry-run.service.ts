import { createHash } from 'crypto';
import {
  createSorobanInvocationPlan,
  SorobanInvocationStep,
} from '../../../soroban/planning/soroban-invocation-planner';
import {
  SorobanSimulationAdapter,
  SorobanSimulationRpc,
} from '../../../soroban/simulation/soroban-simulation.adapter';
import { StellarPreExecutionSafetyPipeline } from '../../safety/stellar/stellar-pre-execution-safety-pipeline';
import type { StellarPreExecutionSafetyContext } from '../../validation/types';
import {
  DryRunExecutionPlanRequest,
  DryRunExecutionResult,
  DryRunPlanStep,
  DryRunSafetyContextBuilder,
  DryRunSimulationSummary,
} from './types';

/**
 * Builds the Soroban invocation steps for a Stellar bridge transfer.
 *
 * Each step represents a contract invocation that would be executed
 * on-chain during a real transfer.
 */
function buildInvocationSteps(
  request: DryRunExecutionPlanRequest,
): SorobanInvocationStep[] {
  return [
    {
      id: 'lock-source-asset',
      invocation: {
        contractAddress: request.bridgeContractAddress,
        functionName: 'lock',
        args: [request.sourceAccount, request.asset, request.amount],
        description: 'Lock source-chain asset',
      },
      order: 0,
    },
    {
      id: 'initiate-bridge',
      invocation: {
        contractAddress: request.bridgeContractAddress,
        functionName: 'bridge',
        args: [
          request.sourceAccount,
          request.destinationAccount,
          request.asset,
          request.amount,
        ],
        dependsOn: ['lock-source-asset'],
        description: 'Initiate cross-chain bridge transfer',
      },
      order: 1,
    },
    {
      id: 'confirm-transfer',
      invocation: {
        contractAddress: request.bridgeContractAddress,
        functionName: 'confirm',
        args: [request.transferId],
        dependsOn: ['initiate-bridge'],
        description: 'Confirm bridge transfer completion',
      },
      order: 2,
    },
  ];
}

/**
 * Serialize an invocation step to a deterministic string representation
 * suitable for simulation RPC.
 */
function serializeInvocationForSimulation(step: SorobanInvocationStep): string {
  return JSON.stringify({
    contractAddress: step.invocation.contractAddress,
    functionName: step.invocation.functionName,
    args: step.invocation.args,
  });
}

/**
 * Deterministic, read-only execution engine for Stellar bridge transfers.
 *
 * Builds an execution plan, simulates each step via Soroban RPC,
 * runs the full safety pipeline, and returns expected results —
 * all without submitting a transaction to the network.
 */
export class StellarBridgeDryRunService {
  private readonly simulation: SorobanSimulationAdapter;
  private readonly safetyPipeline: StellarPreExecutionSafetyPipeline;
  private readonly now: () => number;

  constructor(rpc: SorobanSimulationRpc, options?: { now?: () => number }) {
    this.simulation = new SorobanSimulationAdapter(rpc);
    this.safetyPipeline = new StellarPreExecutionSafetyPipeline({
      now: options?.now,
    });
    this.now = options?.now ?? (() => Date.now());
  }

  /**
   * Execute a dry-run for a Stellar bridge transfer.
   *
   * Steps:
   * 1. Build the execution plan from the request.
   * 2. Validate the plan structure.
   * 3. Simulate each step via Soroban RPC.
   * 4. Run the pre-execution safety pipeline.
   * 5. Return results with `transactionSubmitted: false`.
   *
   * @throws {Error} If the execution plan cannot be built (empty steps,
   *   dependency cycle, etc.).
   */
  async execute(
    request: DryRunExecutionPlanRequest,
    safetyContext: DryRunSafetyContextBuilder,
  ): Promise<DryRunExecutionResult> {
    this.validateRequest(request);

    const invocationSteps = buildInvocationSteps(request);

    const planResult = createSorobanInvocationPlan(invocationSteps);
    if (!planResult.success) {
      const codes = planResult.errors.map((e) => e.code).join(', ');
      throw new Error(`Failed to build execution plan: ${codes}`);
    }

    const plan = planResult.plan!;

    const executionSteps: DryRunPlanStep[] = [];

    for (const step of plan.steps) {
      const serialized = serializeInvocationForSimulation(step);
      const simulationResult = await this.simulation.simulate(serialized);
      executionSteps.push({
        stepId: step.id,
        invocation: step,
        simulationResult,
      });
    }

    const simulationSummary = this.buildSimulationSummary(executionSteps);

    const fullSafetyContext: StellarPreExecutionSafetyContext = {
      quoteQuotedAt: safetyContext.quoteQuotedAt,
      quoteTtlMs: safetyContext.quoteTtlMs,
      destinationAccount: request.destinationAccount,
      destinationExists: safetyContext.destinationExists,
      destinationFunded: safetyContext.destinationFunded,
      transferAsset: request.asset,
      transferAmount: parseFloat(request.amount),
      availableTransferBalance: safetyContext.availableTransferBalance,
      estimatedNetworkFee: safetyContext.estimatedNetworkFee,
      availableFeeBalance: safetyContext.availableFeeBalance,
      requiredTrustlines: safetyContext.requiredTrustlines,
      existingTrustlines: safetyContext.existingTrustlines,
      quotedOutput: safetyContext.quotedOutput,
      minimumOutput: safetyContext.minimumOutput,
      resources: safetyContext.resources,
      resourceLimits: safetyContext.resourceLimits,
      contractCompatible: safetyContext.contractCompatible,
      contractCompatibilityReasons: safetyContext.contractCompatibilityReasons,
    };
    const safetyResult = this.safetyPipeline.run(fullSafetyContext);

    const executionHash = this.computeExecutionHash(request, executionSteps);

    return {
      transferId: request.transferId,
      dryRun: true,
      executionPlan: executionSteps,
      simulationSummary,
      safetyResult,
      transactionSubmitted: false,
      executionHash,
      completedAt: new Date(),
    };
  }

  private validateRequest(request: DryRunExecutionPlanRequest): void {
    if (!request.transferId?.trim()) {
      throw new Error('transferId is required');
    }
    if (!request.sourceAccount?.trim()) {
      throw new Error('sourceAccount is required');
    }
    if (!request.destinationAccount?.trim()) {
      throw new Error('destinationAccount is required');
    }
    if (!request.asset?.trim()) {
      throw new Error('asset is required');
    }
    const amountValue = parseFloat(request.amount);
    if (Number.isNaN(amountValue) || amountValue <= 0) {
      throw new Error('amount must be a positive numeric value');
    }
    if (!request.bridgeContractAddress?.trim()) {
      throw new Error('bridgeContractAddress is required');
    }
  }

  private buildSimulationSummary(
    steps: DryRunPlanStep[],
  ): DryRunSimulationSummary {
    let estimatedCpuInstructions = 0;
    let estimatedMemoryBytes = 0;
    let estimatedFeeTotal = 0;
    let successfulSteps = 0;
    let failedSteps = 0;

    for (const step of steps) {
      if (step.simulationResult?.success) {
        successfulSteps += 1;
        estimatedCpuInstructions +=
          step.simulationResult.resourceEstimates.cpuInstructions ?? 0;
        estimatedMemoryBytes +=
          step.simulationResult.resourceEstimates.memoryBytes ?? 0;
        const fee = parseFloat(
          step.simulationResult.resourceEstimates.fee ?? '0',
        );
        if (!Number.isNaN(fee)) {
          estimatedFeeTotal += fee;
        }
      } else {
        failedSteps += 1;
      }
    }

    return {
      totalSteps: steps.length,
      successfulSteps,
      failedSteps,
      estimatedCpuInstructions,
      estimatedMemoryBytes,
      estimatedFee: estimatedFeeTotal.toFixed(7),
    };
  }

  private computeExecutionHash(
    request: DryRunExecutionPlanRequest,
    steps: DryRunPlanStep[],
  ): string {
    const payload = JSON.stringify({
      transferId: request.transferId,
      sourceAccount: request.sourceAccount,
      destinationAccount: request.destinationAccount,
      asset: request.asset,
      amount: request.amount,
      bridgeContractAddress: request.bridgeContractAddress,
      stepIds: steps.map((s) => s.stepId),
    });
    return createHash('sha256').update(payload).digest('hex');
  }
}
