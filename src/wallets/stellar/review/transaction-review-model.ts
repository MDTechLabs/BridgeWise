import {
  buildStellarTransactionReview,
  type StellarTransactionReview,
} from "../../wallets/stellar/review";

export const buildTransactionReview = (
  transaction: /* existing transaction type */
): StellarTransactionReview => {
  return buildStellarTransactionReview({
    source: transaction.source,
    destination: transaction.destination,
    amount: transaction.amount,
    asset: transaction.asset,
    estimatedFee: transaction.estimatedFee,
    feeAsset: transaction.asset,
    contractId: transaction.contractId,
    contractMethod: transaction.contractMethod,
    contractArguments: transaction.contractArguments,
  });
};