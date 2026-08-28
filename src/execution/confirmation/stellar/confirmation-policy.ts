export interface StellarConfirmationPolicy {
  minimumConfirmations: number;
}

export interface StellarConfirmationState {
  confirmations: number;
  minimumConfirmations: number;
  finalized: boolean;
}

export const createConfirmationPolicy = (
  minimumConfirmations: number,
): StellarConfirmationPolicy => {
  if (
    !Number.isInteger(minimumConfirmations) ||
    minimumConfirmations < 1
  ) {
    throw new Error(
      "minimumConfirmations must be a positive integer",
    );
  }

  return {
    minimumConfirmations,
  };
};

export const evaluateConfirmationPolicy = (
  confirmations: number,
  policy: StellarConfirmationPolicy,
): StellarConfirmationState => {
  if (!Number.isInteger(confirmations) || confirmations < 0) {
    throw new Error(
      "confirmations must be a non-negative integer",
    );
  }

  const finalized =
    confirmations >= policy.minimumConfirmations;

  return {
    confirmations,
    minimumConfirmations: policy.minimumConfirmations,
    finalized,
  };
};