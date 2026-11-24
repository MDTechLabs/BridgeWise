/**
 * Fail-closed gate that requires a successful transaction simulation before a
 * privileged contract operation is submitted. Chain parameters are supplied by
 * governance configuration only; nothing security-critical is inferred from an
 * RPC endpoint, a relayer, or the simulator response itself.
 */

export interface SimulationRequest {
  operationId: string;
  chainId: number;
  from: string;
  target: string;
  calldata: string;
}

export interface SimulationOutcome {
  ok: boolean;
  chainId: number;
  from: string;
  target: string;
  calldata: string;
  blockNumber: number;
  observedAtMs: number;
  gasUsed?: number;
  error?: string;
}

export interface SimulationPort {
  simulate(request: SimulationRequest): Promise<SimulationOutcome>;
}

export interface ChainSimulationPolicy {
  requiredConfirmations: number;
  maxAgeMs: number;
  maxSimulationsPerOperation: number;
}

export interface PrivilegedOperation {
  id: string;
  chainId: number;
  from: string;
  target: string;
  calldata: string;
  requiresSimulation: boolean;
}

export type SimulationDenyReason =
  | 'CHAIN_POLICY_MISSING'
  | 'SIMULATION_UNAVAILABLE'
  | 'SIMULATION_REVERTED'
  | 'SIMULATION_MISMATCH'
  | 'SIMULATION_STALE'
  | 'CONFIRMATIONS_NOT_MET'
  | 'SIMULATION_BUDGET_EXCEEDED'
  | 'OPERATION_REPLAYED';

export interface SimulationDecision {
  operationId: string;
  chainId: number;
  allowed: boolean;
  reason?: SimulationDenyReason;
  simulatedAtMs?: number;
  simulatedBlock?: number;
}

export class SimulationGateError extends Error {
  readonly reason: SimulationDenyReason;

  constructor(reason: SimulationDenyReason, message: string) {
    super(message);
    this.name = 'SimulationGateError';
    this.reason = reason;
  }
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sameCalldata(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export class PrivilegedOperationSimulationGate {
  private readonly attempts = new Map<string, number>();
  private readonly completed = new Set<string>();

  constructor(
    private readonly simulator: SimulationPort,
    private readonly policies: Readonly<Record<number, ChainSimulationPolicy>>,
    private readonly now: () => number = () => Date.now(),
    private readonly onDecision: (decision: SimulationDecision) => void = () =>
      undefined,
  ) {}

  async run<T>(
    operation: PrivilegedOperation,
    execute: () => Promise<T>,
    currentBlock: number | undefined,
  ): Promise<T> {
    if (this.completed.has(operation.id)) {
      this.deny(operation, 'OPERATION_REPLAYED');
    }

    if (operation.requiresSimulation) {
      await this.verifySimulation(operation, currentBlock);
    }

    const result = await execute();
    this.completed.add(operation.id);
    this.onDecision({
      operationId: operation.id,
      chainId: operation.chainId,
      allowed: true,
    });
    return result;
  }

  private async verifySimulation(
    operation: PrivilegedOperation,
    currentBlock: number | undefined,
  ): Promise<void> {
    const policy = this.policies[operation.chainId];
    if (!policy) {
      this.deny(operation, 'CHAIN_POLICY_MISSING');
    }

    const count = this.attempts.get(operation.id) ?? 0;
    if (count >= policy.maxSimulationsPerOperation) {
      this.deny(operation, 'SIMULATION_BUDGET_EXCEEDED');
    }
    this.attempts.set(operation.id, count + 1);

    let outcome: SimulationOutcome;
    try {
      outcome = await this.simulator.simulate({
        operationId: operation.id,
        chainId: operation.chainId,
        from: operation.from,
        target: operation.target,
        calldata: operation.calldata,
      });
    } catch {
      this.deny(operation, 'SIMULATION_UNAVAILABLE');
    }

    if (!outcome.ok) this.deny(operation, 'SIMULATION_REVERTED');
    if (
      outcome.chainId !== operation.chainId ||
      !sameAddress(outcome.from, operation.from) ||
      !sameAddress(outcome.target, operation.target) ||
      !sameCalldata(outcome.calldata, operation.calldata)
    ) {
      this.deny(operation, 'SIMULATION_MISMATCH');
    }

    const now = this.now();
    if (
      !Number.isFinite(now) ||
      !Number.isFinite(outcome.observedAtMs) ||
      now < outcome.observedAtMs ||
      now - outcome.observedAtMs > policy.maxAgeMs
    ) {
      this.deny(operation, 'SIMULATION_STALE');
    }

    const block = currentBlock ?? NaN;
    if (
      !Number.isInteger(block) ||
      !Number.isInteger(outcome.blockNumber) ||
      block < outcome.blockNumber ||
      block - outcome.blockNumber < policy.requiredConfirmations
    ) {
      this.deny(operation, 'CONFIRMATIONS_NOT_MET');
    }

    this.onDecision({
      operationId: operation.id,
      chainId: operation.chainId,
      allowed: true,
      simulatedAtMs: outcome.observedAtMs,
      simulatedBlock: outcome.blockNumber,
    });
  }

  private deny(
    operation: PrivilegedOperation,
    reason: SimulationDenyReason,
  ): never {
    this.onDecision({
      operationId: operation.id,
      chainId: operation.chainId,
      allowed: false,
      reason,
    });
    throw new SimulationGateError(
      reason,
      `Privileged operation ${operation.id} denied: ${reason}`,
    );
  }
}
