```ts
/**
 * Stellar Bridge Route Snapshot
 *
 * Standalone component for capturing an immutable snapshot
 * of a selected Stellar bridge route before execution.
 *
 * This file is intentionally self-contained and does not
 * modify or depend on existing application code.
 */

interface BridgeProvider {
  id: string;
  name: string;
}

interface RouteAsset {
  id: string;
  symbol: string;
}

interface QuotedAmount {
  amount: number;
  asset: string;
}

interface RouteFee {
  amount: number;
  asset: string;
}

interface SelectedBridgeRoute {
  provider: BridgeProvider;
  sourceAsset: RouteAsset;
  destinationAsset: RouteAsset;
  quotedInput: QuotedAmount;
  quotedOutput: QuotedAmount;
  fees: RouteFee[];
  estimatedExecutionTime: number;
}

interface StellarBridgeRouteSnapshotData {
  readonly snapshotId: string;
  readonly executionId: string;
  readonly capturedAt: string;
  readonly provider: Readonly<BridgeProvider>;
  readonly sourceAsset: Readonly<RouteAsset>;
  readonly destinationAsset: Readonly<RouteAsset>;
  readonly quotedInput: Readonly<QuotedAmount>;
  readonly quotedOutput: Readonly<QuotedAmount>;
  readonly fees: readonly Readonly<RouteFee>[];
  readonly estimatedExecutionTime: number;
}

/**
 * Generate a unique snapshot identifier.
 */
function createSnapshotId(): string {
  return `snapshot-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 10)}`;
}

/**
 * Deep-freeze an object so that nested values
 * cannot be changed after the snapshot is created.
 */
function deepFreeze<T>(value: T): T {
  if (
    value !== null &&
    typeof value === "object" &&
    !Object.isFrozen(value)
  ) {
    Object.freeze(value);

    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }

  return value;
}

/**
 * Immutable snapshot of a selected Stellar bridge route.
 */
export class StellarBridgeRouteSnapshot {
  private readonly data: StellarBridgeRouteSnapshotData;

  constructor(
    executionId: string,
    route: SelectedBridgeRoute,
  ) {
    this.validate(executionId, route);

    const snapshot: StellarBridgeRouteSnapshotData = {
      snapshotId: createSnapshotId(),
      executionId,
      capturedAt: new Date().toISOString(),

      provider: {
        id: route.provider.id,
        name: route.provider.name,
      },

      sourceAsset: {
        id: route.sourceAsset.id,
        symbol: route.sourceAsset.symbol,
      },

      destinationAsset: {
        id: route.destinationAsset.id,
        symbol: route.destinationAsset.symbol,
      },

      quotedInput: {
        amount: route.quotedInput.amount,
        asset: route.quotedInput.asset,
      },

      quotedOutput: {
        amount: route.quotedOutput.amount,
        asset: route.quotedOutput.asset,
      },

      fees: route.fees.map((fee) => ({
        amount: fee.amount,
        asset: fee.asset,
      })),

      estimatedExecutionTime:
        route.estimatedExecutionTime,
    };

    /**
     * Freeze the complete snapshot.
     *
     * This guarantees that the captured route remains
     * unchanged after execution.
     */
    this.data = deepFreeze(snapshot);
  }

  /**
   * Validate snapshot input.
   */
  private validate(
    executionId: string,
    route: SelectedBridgeRoute,
  ): void {
    if (!executionId.trim()) {
      throw new Error("Execution ID is required.");
    }

    if (!route.provider.id.trim()) {
      throw new Error("Provider ID is required.");
    }

    if (!route.provider.name.trim()) {
      throw new Error("Provider name is required.");
    }

    if (!route.sourceAsset.id.trim()) {
      throw new Error("Source asset ID is required.");
    }

    if (!route.destinationAsset.id.trim()) {
      throw new Error(
        "Destination asset ID is required.",
      );
    }

    if (route.quotedInput.amount < 0) {
      throw new Error(
        "Quoted input amount cannot be negative.",
      );
    }

    if (route.quotedOutput.amount < 0) {
      throw new Error(
        "Quoted output amount cannot be negative.",
      );
    }

    if (route.estimatedExecutionTime < 0) {
      throw new Error(
        "Estimated execution time cannot be negative.",
      );
    }

    for (const fee of route.fees) {
      if (fee.amount < 0) {
        throw new Error(
          "Route fee cannot be negative.",
        );
      }
    }
  }

  /**
   * Get the snapshot identifier.
   */
  getSnapshotId(): string {
    return this.data.snapshotId;
  }

  /**
   * Get the execution identifier associated
   * with this snapshot.
   */
  getExecutionId(): string {
    return this.data.executionId;
  }

  /**
   * Get the time at which the snapshot was captured.
   */
  getCapturedAt(): string {
    return this.data.capturedAt;
  }

  /**
   * Get provider information.
   */
  getProvider(): Readonly<BridgeProvider> {
    return this.data.provider;
  }

  /**
   * Get source asset.
   */
  getSourceAsset(): Readonly<RouteAsset> {
    return this.data.sourceAsset;
  }

  /**
   * Get destination asset.
   */
  getDestinationAsset(): Readonly<RouteAsset> {
    return this.data.destinationAsset;
  }

  /**
   * Get quoted input.
   */
  getQuotedInput(): Readonly<QuotedAmount> {
    return this.data.quotedInput;
  }

  /**
   * Get quoted output.
   */
  getQuotedOutput(): Readonly<QuotedAmount> {
    return this.data.quotedOutput;
  }

  /**
   * Get route fees.
   */
  getFees(): readonly Readonly<RouteFee>[] {
    return this.data.fees;
  }

  /**
   * Get estimated execution time in seconds.
   */
  getEstimatedExecutionTime(): number {
    return this.data.estimatedExecutionTime;
  }

  /**
   * Return the complete immutable snapshot.
   */
  getSnapshot(): StellarBridgeRouteSnapshotData {
    return this.data;
  }

  /**
   * Calculate total fees grouped by asset.
   */
  getTotalFees(): Record<string, number> {
    return this.data.fees.reduce(
      (totals, fee) => {
        totals[fee.asset] =
          (totals[fee.asset] ?? 0) + fee.amount;

        return totals;
      },
      {} as Record<string, number>,
    );
  }

  /**
   * Serialize the snapshot for storage,
   * debugging, or auditing.
   */
  toJSON(): string {
    return JSON.stringify(this.data);
  }
}

/**
 * --------------------------------------------------------------------------
 * Example
 * --------------------------------------------------------------------------
 *
 * This example is intentionally commented out.
 * It demonstrates how the component could be used later
 * without executing anything automatically.
 */

/*
const route: SelectedBridgeRoute = {
  provider: {
    id: "stellar-bridge",
    name: "Example Stellar Bridge",
  },

  sourceAsset: {
    id: "USDC",
    symbol: "USDC",
  },

  destinationAsset: {
    id: "EURC",
    symbol: "EURC",
  },

  quotedInput: {
    amount: 100,
    asset: "USDC",
  },

  quotedOutput: {
    amount: 98.5,
    asset: "EURC",
  },

  fees: [
    {
      amount: 0.5,
      asset: "USDC",
    },
    {
      amount: 0.1,
      asset: "XLM",
    },
  ],

  estimatedExecutionTime: 30,
};

const snapshot = new StellarBridgeRouteSnapshot(
  "execution-123",
  route,
);

console.log(snapshot.getSnapshot());
console.log(snapshot.getTotalFees());
console.log(snapshot.toJSON());
*/
```
