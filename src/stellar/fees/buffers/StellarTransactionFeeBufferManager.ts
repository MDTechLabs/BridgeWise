/**
 * Stellar Transaction Fee Buffer Manager
 *
 * Standalone component for applying configurable safety
 * buffers to estimated Stellar transaction fees.
 *
 * This file intentionally has no external dependencies
 * and does not modify existing application code.
 */

interface FeeBufferPolicy {
  network: string;
  percentageBuffer?: number;
  fixedBuffer?: number;
  maxFee: number;
}

interface BufferedFeeResult {
  readonly network: string;
  readonly estimatedFee: number;
  readonly percentageBuffer: number;
  readonly fixedBuffer: number;
  readonly bufferedFee: number;
  readonly maxFee: number;
  readonly capped: boolean;
}

const DEFAULT_POLICIES: FeeBufferPolicy[] = [
  {
    network: "mainnet",
    percentageBuffer: 10,
    fixedBuffer: 0,
    maxFee: 100,
  },
  {
    network: "testnet",
    percentageBuffer: 20,
    fixedBuffer: 0,
    maxFee: 100,
  },
];

export class StellarTransactionFeeBufferManager {
  private readonly policies: Map<
    string,
    FeeBufferPolicy
  >;

  constructor(
    policies: FeeBufferPolicy[] = DEFAULT_POLICIES,
  ) {
    this.validatePolicies(policies);

    this.policies = new Map(
      policies.map((policy) => [
        policy.network,
        { ...policy },
      ]),
    );
  }

  /**
   * Add or replace a network-specific fee policy.
   */
  setPolicy(policy: FeeBufferPolicy): void {
    this.validatePolicy(policy);

    this.policies.set(policy.network, {
      ...policy,
    });
  }

  /**
   * Remove a network-specific policy.
   */
  removePolicy(network: string): boolean {
    return this.policies.delete(network);
  }

  /**
   * Check whether a policy exists.
   */
  hasPolicy(network: string): boolean {
    return this.policies.has(network);
  }

  /**
   * Get a network-specific policy.
   */
  getPolicy(
    network: string,
  ): FeeBufferPolicy | undefined {
    const policy = this.policies.get(network);

    if (!policy) {
      return undefined;
    }

    return { ...policy };
  }

  /**
   * Calculate a buffered transaction fee.
   */
  calculateBufferedFee(
    estimatedFee: number,
    network: string,
  ): number {
    const policy = this.getRequiredPolicy(network);

    this.validateEstimatedFee(estimatedFee);

    const percentageAmount =
      estimatedFee *
      ((policy.percentageBuffer ?? 0) / 100);

    const fixedAmount =
      policy.fixedBuffer ?? 0;

    const bufferedFee =
      estimatedFee +
      percentageAmount +
      fixedAmount;

    return Math.min(
      bufferedFee,
      policy.maxFee,
    );
  }

  /**
   * Calculate the buffered fee and return
   * detailed information about the calculation.
   */
  calculate(
    estimatedFee: number,
    network: string,
  ): BufferedFeeResult {
    const policy = this.getRequiredPolicy(network);

    this.validateEstimatedFee(estimatedFee);

    const percentageBuffer =
      policy.percentageBuffer ?? 0;

    const fixedBuffer =
      policy.fixedBuffer ?? 0;

    const percentageAmount =
      estimatedFee *
      (percentageBuffer / 100);

    const calculatedFee =
      estimatedFee +
      percentageAmount +
      fixedBuffer;

    const bufferedFee = Math.min(
      calculatedFee,
      policy.maxFee,
    );

    return Object.freeze({
      network,
      estimatedFee,
      percentageBuffer,
      fixedBuffer,
      bufferedFee,
      maxFee: policy.maxFee,
      capped: calculatedFee > policy.maxFee,
    });
  }

  /**
   * Apply a percentage buffer without requiring
   * a configured network policy.
   */
  applyPercentageBuffer(
    estimatedFee: number,
    percentage: number,
    maxFee: number,
  ): number {
    this.validateEstimatedFee(estimatedFee);

    if (percentage < 0) {
      throw new Error(
        "Percentage buffer cannot be negative.",
      );
    }

    this.validateMaximumFee(maxFee);

    const bufferedFee =
      estimatedFee +
      estimatedFee * (percentage / 100);

    return Math.min(
      bufferedFee,
      maxFee,
    );
  }

  /**
   * Apply a fixed fee buffer without requiring
   * a configured network policy.
   */
  applyFixedBuffer(
    estimatedFee: number,
    fixedBuffer: number,
    maxFee: number,
  ): number {
    this.validateEstimatedFee(estimatedFee);

    if (fixedBuffer < 0) {
      throw new Error(
        "Fixed fee buffer cannot be negative.",
      );
    }

    this.validateMaximumFee(maxFee);

    const bufferedFee =
      estimatedFee + fixedBuffer;

    return Math.min(
      bufferedFee,
      maxFee,
    );
  }

  /**
   * Return all configured policies.
   */
  getPolicies(): FeeBufferPolicy[] {
    return [...this.policies.values()].map(
      (policy) => ({ ...policy }),
    );
  }

  /**
   * Validate all supplied policies.
   */
  private validatePolicies(
    policies: FeeBufferPolicy[],
  ): void {
    const networks = new Set<string>();

    for (const policy of policies) {
      this.validatePolicy(policy);

      if (networks.has(policy.network)) {
        throw new Error(
          `Duplicate fee policy for network: ${policy.network}`,
        );
      }

      networks.add(policy.network);
    }
  }

  /**
   * Validate one fee policy.
   */
  private validatePolicy(
    policy: FeeBufferPolicy,
  ): void {
    if (!policy.network.trim()) {
      throw new Error(
        "Network name is required.",
      );
    }

    if (
      policy.percentageBuffer !== undefined &&
      (!Number.isFinite(
        policy.percentageBuffer,
      ) ||
        policy.percentageBuffer < 0)
    ) {
      throw new Error(
        "Percentage buffer must be a non-negative finite number.",
      );
    }

    if (
      policy.fixedBuffer !== undefined &&
      (!Number.isFinite(policy.fixedBuffer) ||
        policy.fixedBuffer < 0)
    ) {
      throw new Error(
        "Fixed fee buffer must be a non-negative finite number.",
      );
    }

    this.validateMaximumFee(policy.maxFee);
  }

  /**
   * Validate the maximum allowed fee.
   */
  private validateMaximumFee(
    maxFee: number,
  ): void {
    if (
      !Number.isFinite(maxFee) ||
      maxFee <= 0
    ) {
      throw new Error(
        "Maximum fee must be a finite number greater than zero.",
      );
    }
  }

  /**
   * Validate the estimated transaction fee.
   */
  private validateEstimatedFee(
    estimatedFee: number,
  ): void {
    if (!Number.isFinite(estimatedFee)) {
      throw new Error(
        "Estimated fee must be a finite number.",
      );
    }

    if (estimatedFee < 0) {
      throw new Error(
        "Estimated fee cannot be negative.",
      );
    }
  }

  /**
   * Retrieve a required policy.
   */
  private getRequiredPolicy(
    network: string,
  ): FeeBufferPolicy {
    if (!network.trim()) {
      throw new Error(
        "Network name is required.",
      );
    }

    const policy = this.policies.get(network);

    if (!policy) {
      throw new Error(
        `No fee buffer policy configured for network: ${network}`,
      );
    }

    return policy;
  }
}