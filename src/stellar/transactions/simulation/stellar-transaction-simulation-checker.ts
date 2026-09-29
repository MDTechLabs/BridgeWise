/**
 * Stellar transaction simulation checks.
 *
 * A simulation is the last cheap opportunity to notice that a transaction will
 * fail, cost more than planned, or demand an authorization the wallet cannot
 * produce. These checks turn a raw simulation response into a clear
 * submit-or-not decision with a reason for every rejection.
 */

export type SimulationCheckCode =
  | 'SIMULATION_SUCCEEDED'
  | 'SIMULATION_FAILED'
  | 'FEE_WITHIN_LIMIT'
  | 'FEE_EXCEEDS_LIMIT'
  | 'CPU_WITHIN_LIMIT'
  | 'CPU_EXCEEDS_LIMIT'
  | 'MEMORY_WITHIN_LIMIT'
  | 'MEMORY_EXCEEDS_LIMIT'
  | 'READ_BYTES_WITHIN_LIMIT'
  | 'READ_BYTES_EXCEEDS_LIMIT'
  | 'WRITE_BYTES_WITHIN_LIMIT'
  | 'WRITE_BYTES_EXCEEDS_LIMIT'
  | 'FOOTPRINT_WITHIN_LIMIT'
  | 'FOOTPRINT_TOO_LARGE'
  | 'AUTH_MISSING'
  | 'AUTH_UNEXPECTED';

export type SimulationCheckStatus = 'passed' | 'failed' | 'warning';

export interface SorobanResourceUsage {
  cpuInstructions: number;
  memoryBytes: number;
  readBytes: number;
  writeBytes: number;
}

export interface StellarSimulationResponse {
  /** Whether the host reported the invocation would succeed. */
  success: boolean;
  /** Host error name when `success` is false, e.g. 'HostError'. */
  error?: string;
  /** Fee the simulation predicts, in stroops. */
  feeCharged: number;
  /** Minimum resource fee, in stroops. */
  minResourceFee?: number;
  resourceUsage: SorobanResourceUsage;
  /** Authorization entries the transaction requires. */
  authRequired?: string[];
  /** Authorization entries the prepared transaction actually carries. */
  authProvided?: string[];
  /** Ledger entries the transaction reads and writes. */
  footprintEntries?: number;
  events?: unknown[];
}

export interface StellarSimulationBudget {
  /** Maximum total fee in stroops. */
  maxFeeStroops: number;
  maxCpuInstructions: number;
  maxMemoryBytes: number;
  maxReadBytes: number;
  maxWriteBytes: number;
  /** Maximum ledger entries touched. */
  maxFootprintEntries: number;
}

export interface SimulationCheck {
  code: SimulationCheckCode;
  status: SimulationCheckStatus;
  message: string;
}

export interface SimulationCheckResult {
  safeToSubmit: boolean;
  checks: SimulationCheck[];
}

export const DEFAULT_SIMULATION_BUDGET: StellarSimulationBudget = {
  maxFeeStroops: 10_000_000,
  maxCpuInstructions: 100_000_000,
  maxMemoryBytes: 40 * 1024 * 1024,
  maxReadBytes: 200_000,
  maxWriteBytes: 100_000,
  maxFootprintEntries: 40,
};

function budgetCheck(
  code: SimulationCheckCode,
  exceedCode: SimulationCheckCode,
  label: string,
  actual: number,
  limit: number,
): SimulationCheck {
  if (actual > limit) {
    return {
      code: exceedCode,
      status: 'failed',
      message: `${label} ${actual} exceeds budget ${limit}`,
    };
  }

  return {
    code,
    status: 'passed',
    message: `${label} ${actual} is within budget ${limit}`,
  };
}

export class StellarTransactionSimulationChecker {
  private readonly budget: StellarSimulationBudget;

  constructor(budget: Partial<StellarSimulationBudget> = {}) {
    this.budget = { ...DEFAULT_SIMULATION_BUDGET, ...budget };
  }

  getBudget(): StellarSimulationBudget {
    return { ...this.budget };
  }

  check(response: StellarSimulationResponse): SimulationCheckResult {
    const checks: SimulationCheck[] = [];

    if (!response.success) {
      checks.push({
        code: 'SIMULATION_FAILED',
        status: 'failed',
        message: response.error
          ? `Simulation reported a failure: ${response.error}`
          : 'Simulation reported a failure',
      });

      return { safeToSubmit: false, checks };
    }

    checks.push({
      code: 'SIMULATION_SUCCEEDED',
      status: 'passed',
      message: 'Simulation reported success',
    });

    checks.push(
      budgetCheck(
        'FEE_WITHIN_LIMIT',
        'FEE_EXCEEDS_LIMIT',
        'Simulated fee',
        response.feeCharged,
        this.budget.maxFeeStroops,
      ),
      budgetCheck(
        'CPU_WITHIN_LIMIT',
        'CPU_EXCEEDS_LIMIT',
        'CPU instructions',
        response.resourceUsage.cpuInstructions,
        this.budget.maxCpuInstructions,
      ),
      budgetCheck(
        'MEMORY_WITHIN_LIMIT',
        'MEMORY_EXCEEDS_LIMIT',
        'Memory bytes',
        response.resourceUsage.memoryBytes,
        this.budget.maxMemoryBytes,
      ),
      budgetCheck(
        'READ_BYTES_WITHIN_LIMIT',
        'READ_BYTES_EXCEEDS_LIMIT',
        'Read bytes',
        response.resourceUsage.readBytes,
        this.budget.maxReadBytes,
      ),
      budgetCheck(
        'WRITE_BYTES_WITHIN_LIMIT',
        'WRITE_BYTES_EXCEEDS_LIMIT',
        'Write bytes',
        response.resourceUsage.writeBytes,
        this.budget.maxWriteBytes,
      ),
    );

    if (response.footprintEntries !== undefined) {
      checks.push(
        budgetCheck(
          'FOOTPRINT_WITHIN_LIMIT',
          'FOOTPRINT_TOO_LARGE',
          'Footprint entries',
          response.footprintEntries,
          this.budget.maxFootprintEntries,
        ),
      );
    }

    const required = response.authRequired ?? [];
    const provided = response.authProvided ?? [];
    const missing = required.filter((entry) => !provided.includes(entry));

    if (missing.length > 0) {
      checks.push({
        code: 'AUTH_MISSING',
        status: 'failed',
        message: `Missing required authorization entries: ${missing.join(', ')}`,
      });
    }

    const unexpected = provided.filter((entry) => !required.includes(entry));
    if (unexpected.length > 0) {
      checks.push({
        code: 'AUTH_UNEXPECTED',
        status: 'warning',
        message: `Simulation carried authorization entries it did not require: ${unexpected.join(', ')}`,
      });
    }

    return {
      safeToSubmit: checks.every((check) => check.status !== 'failed'),
      checks,
    };
  }
}
