import type { SorobanInvocationStep } from '../../../soroban/planning/soroban-invocation-planner';
import type { SorobanSimulationResult } from '../../../soroban/simulation/soroban-simulation.adapter';
import type { StellarPreExecutionSafetyResult } from '../../validation/types';

export interface DryRunExecutionPlanRequest {
  transferId: string;
  sourceAccount: string;
  destinationAccount: string;
  asset: string;
  amount: string;
  bridgeContractAddress: string;
  memo?: string;
}

export interface DryRunPlanStep {
  stepId: string;
  invocation: SorobanInvocationStep;
  simulationResult: SorobanSimulationResult | null;
}

export interface DryRunSimulationSummary {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  estimatedCpuInstructions: number;
  estimatedMemoryBytes: number;
  estimatedFee: string;
}

export interface DryRunExecutionResult {
  transferId: string;
  dryRun: true;
  executionPlan: DryRunPlanStep[];
  simulationSummary: DryRunSimulationSummary;
  safetyResult: StellarPreExecutionSafetyResult;
  transactionSubmitted: false;
  executionHash: string;
  completedAt: Date;
}

export interface DryRunSafetyContextBuilder {
  quoteQuotedAt: number;
  quoteTtlMs: number;
  destinationExists: boolean;
  destinationFunded: boolean;
  availableTransferBalance: number;
  estimatedNetworkFee: number;
  availableFeeBalance: number;
  requiredTrustlines: Array<{ code: string; issuer: string }>;
  existingTrustlines: Array<{ code: string; issuer: string }>;
  quotedOutput: number;
  minimumOutput: number;
  resources: {
    cpuInstructions: number;
    memoryBytes: number;
    fee: number;
  };
  resourceLimits: {
    cpuInstructions: number;
    memoryBytes: number;
    fee: number;
  };
  contractCompatible: boolean;
  contractCompatibilityReasons?: string[];
}
