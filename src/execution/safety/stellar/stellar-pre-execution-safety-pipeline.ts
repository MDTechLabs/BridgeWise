import {
  SafetyPipelineConfig,
  StellarPreExecutionSafetyContext,
  StellarPreExecutionSafetyResult,
  validateAssetBalance,
  validateContractCompatibility,
  validateDestinationAccount,
  validateMinimumOutput,
  validateQuoteFreshness,
  validateTransactionResources,
  validateTrustlineRequirements,
} from '../../validation';

/**
 * Final safety pipeline run before a Stellar bridge transaction is signed.
 * All checks execute; any error blocks signing.
 */
export class StellarPreExecutionSafetyPipeline {
  private readonly now: () => number;

  constructor(config: SafetyPipelineConfig = {}) {
    this.now = config.now ?? (() => Date.now());
  }

  run(context: StellarPreExecutionSafetyContext): StellarPreExecutionSafetyResult {
    const checkedAt = this.now();
    const checks = [
      validateQuoteFreshness(context, checkedAt),
      validateDestinationAccount(context),
      validateAssetBalance(context),
      validateTrustlineRequirements(context),
      validateMinimumOutput(context),
      validateTransactionResources(context),
      validateContractCompatibility(context),
    ];
    const failures = checks.flatMap((check) => check.failures);
    const blocked = failures.some((failure) => failure.severity === 'error');
    return {
      safe: !blocked,
      blocked,
      checkedAt,
      checks,
      failures,
    };
  }
}
