export class SlippageExceededError extends Error {
  constructor(message = 'Simulation failed: Slippage threshold exceeded') {
    super(message);
    this.name = 'SlippageExceededError';
  }
}

export class InsufficientFootprintError extends Error {
  constructor(message = 'Simulation failed: Insufficient ledger footprint key authorization') {
    super(message);
    this.name = 'InsufficientFootprintError';
  }
}

export class SimulationRevertError extends Error {
  public readonly revertCode?: string | number;
  constructor(message = 'Simulation reverted', revertCode?: string | number) {
    super(message);
    this.name = 'SimulationRevertError';
    this.revertCode = revertCode;
  }
}

export interface SorobanSimOptions {
  rpcUrl: string;
  expectedMinOutput?: string;
  maxSlippagePercent?: number;
  expectedFootprintKeys?: string[];
}

export interface SorobanSimulationResult {
  successful: boolean;
  minResourceFee: string;
  sorobanData?: {
    auth?: any[];
    resources?: {
      footprint?: {
        readOnly?: string[];
        readWrite?: string[];
      };
    };
  };
  simulatedOutput?: string;
  error?: string;
}
