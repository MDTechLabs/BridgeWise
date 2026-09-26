export type SorobanTransactionFailure =
  | "STALE"
  | "SEQUENCE_ERROR"
  | "RESOURCE_ERROR"
  | "QUOTE_EXPIRED"
  | "NON_RECOVERABLE";

export interface SorobanResourceEstimate {
  cpuInstructions: bigint;
  readBytes: bigint;
  writeBytes: bigint;
}

export interface SorobanUserIntent {
  source: string;
  destination: string;
  amount: bigint;
  asset: string;
}

export interface SorobanTransaction {
  transactionId: string;
  intent: SorobanUserIntent;
  sequenceNumber: bigint;
  resourceEstimate: SorobanResourceEstimate;
  quoteId?: string;
  failure?: SorobanTransactionFailure;
}

export interface SorobanRebuildData {
  sequenceNumber: bigint;
  resourceEstimate: SorobanResourceEstimate;
  quoteId?: string;
}

export class NonRecoverableTransactionError extends Error {
  constructor(transactionId: string) {
    super(
      `Transaction ${transactionId} cannot be rebuilt because the failure is non-recoverable.`,
    );

    this.name = "NonRecoverableTransactionError";
  }
}

export const isTransactionRebuildable = (
  transaction: SorobanTransaction,
): boolean => {
  return transaction.failure !== "NON_RECOVERABLE";
};

export const rebuildSorobanTransaction = (
  transaction: SorobanTransaction,
  refreshedData: SorobanRebuildData,
): SorobanTransaction => {
  if (!isTransactionRebuildable(transaction)) {
    throw new NonRecoverableTransactionError(
      transaction.transactionId,
    );
  }

  return {
    ...transaction,

    // Preserve the user's original transfer intent.
    intent: {
      ...transaction.intent,
    },

    // Refresh stale network-dependent values.
    sequenceNumber: refreshedData.sequenceNumber,
    resourceEstimate: {
      ...refreshedData.resourceEstimate,
    },
    quoteId: refreshedData.quoteId,

    // The rebuilt transaction should no longer retain the previous failure.
    failure: undefined,
  };
};