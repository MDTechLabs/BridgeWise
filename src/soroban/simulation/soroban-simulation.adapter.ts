export interface SorobanSimulationRpc {
  simulateTransaction(transaction: string): Promise<any>;
}

export interface SorobanSimulationResult {
  success: boolean;
  error?: string;
  result?: unknown;
  resourceEstimates: {
    cpuInstructions?: number;
    memoryBytes?: number;
    ledgerReadBytes?: number;
    ledgerWriteBytes?: number;
    fee?: string;
  };
}

export class SorobanSimulationAdapter {
  constructor(private readonly rpc: SorobanSimulationRpc) {}

  async simulate(transaction: string): Promise<SorobanSimulationResult> {
    if (!transaction?.trim()) throw new Error('transaction is required');
    try {
      const response = await this.rpc.simulateTransaction(transaction);
      const result = response?.result ?? response;
      if (response?.error || result?.error || result?.errorResult) {
        return {
          success: false,
          error:
            response?.error?.message ?? result?.error ?? result?.errorResult,
          resourceEstimates: {},
        };
      }
      return {
        success: result?.status === undefined || result.status === 'SUCCESS',
        result: result?.retval ?? result?.result,
        resourceEstimates: result?.cost ?? result?.resourceEstimates ?? {},
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        resourceEstimates: {},
      };
    }
  }
}
