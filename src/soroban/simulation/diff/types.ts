import { SorobanSimulationResult } from '../soroban-simulation.adapter';

export interface SimulationEvent {
  type: string;
  topics?: string[];
  data?: unknown;
}

export interface ComparableSimulationSnapshot {
  resourceEstimates: SorobanSimulationResult['resourceEstimates'] & {
    cpuInstructions?: number;
    memoryBytes?: number;
    ledgerReadBytes?: number;
    ledgerWriteBytes?: number;
    fee?: string | number;
  };
  expectedOutput?: unknown;
  events?: SimulationEvent[];
  success?: boolean;
}

export interface MaterialDifferenceThresholds {
  cpuInstructions?: number;
  memoryBytes?: number;
  ledgerReadBytes?: number;
  ledgerWriteBytes?: number;
  fee?: number;
}

export const DEFAULT_MATERIAL_THRESHOLDS: Required<MaterialDifferenceThresholds> = {
  cpuInstructions: 1,
  memoryBytes: 1,
  ledgerReadBytes: 1,
  ledgerWriteBytes: 1,
  fee: 1,
};

export interface NumericChange {
  field: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  material: boolean;
}

export interface SimulationDiffResult {
  hasChanges: boolean;
  hasMaterialDifferences: boolean;
  resourceChanges: NumericChange[];
  outputChanged: boolean;
  outputBefore: unknown;
  outputAfter: unknown;
  eventChanges: {
    added: SimulationEvent[];
    removed: SimulationEvent[];
    unchangedCount: number;
  };
  summary: string[];
}
