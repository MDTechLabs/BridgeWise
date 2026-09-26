import {
  SafetyCheckFailure,
  SafetyCheckResult,
  StellarPreExecutionSafetyContext,
} from './types';

function fail(
  check: SafetyCheckResult['check'],
  code: string,
  reason: string,
  action: string,
): SafetyCheckFailure {
  return { check, code, severity: 'error', reason, action };
}

export function validateQuoteFreshness(
  ctx: StellarPreExecutionSafetyContext,
  now: number,
): SafetyCheckResult {
  const check = 'quote_freshness' as const;
  const failures: SafetyCheckFailure[] = [];
  if (ctx.quoteTtlMs <= 0) {
    failures.push(
      fail(check, 'QUOTE_TTL_INVALID', 'Quote TTL must be greater than zero.', 'Set a positive quote TTL before signing.'),
    );
  }
  if (now - ctx.quoteQuotedAt > ctx.quoteTtlMs) {
    failures.push(
      fail(
        check,
        'QUOTE_STALE',
        'The selected quote has expired and may no longer match executable prices.',
        'Refresh the quote and lock the route again before signing.',
      ),
    );
  }
  return { check, passed: failures.length === 0, failures };
}

export function validateDestinationAccount(
  ctx: StellarPreExecutionSafetyContext,
): SafetyCheckResult {
  const check = 'destination_account' as const;
  const failures: SafetyCheckFailure[] = [];
  const account = ctx.destinationAccount?.trim() ?? '';
  if (!/^[GC][A-Z2-7]{55}$/.test(account)) {
    failures.push(
      fail(
        check,
        'DESTINATION_INVALID',
        'Destination account is not a valid Stellar account or contract address.',
        'Correct the destination address and retry.',
      ),
    );
  }
  if (!ctx.destinationExists) {
    failures.push(
      fail(
        check,
        'DESTINATION_MISSING',
        'Destination account does not exist on the network.',
        'Create or fund the destination account before signing.',
      ),
    );
  }
  if (!ctx.destinationFunded) {
    failures.push(
      fail(
        check,
        'DESTINATION_UNFUNDED',
        'Destination account is not funded above the reserve.',
        'Send the minimum XLM reserve to the destination account.',
      ),
    );
  }
  return { check, passed: failures.length === 0, failures };
}

export function validateAssetBalance(
  ctx: StellarPreExecutionSafetyContext,
): SafetyCheckResult {
  const check = 'asset_balance' as const;
  const failures: SafetyCheckFailure[] = [];
  const required = ctx.transferAmount + ctx.estimatedNetworkFee;
  if (ctx.availableTransferBalance < ctx.transferAmount) {
    failures.push(
      fail(
        check,
        'INSUFFICIENT_TRANSFER_BALANCE',
        `Available ${ctx.transferAsset} balance ${ctx.availableTransferBalance} is below the transfer amount ${ctx.transferAmount}.`,
        `Top up ${ctx.transferAsset} before signing.`,
      ),
    );
  }
  if (ctx.availableFeeBalance < ctx.estimatedNetworkFee) {
    failures.push(
      fail(
        check,
        'INSUFFICIENT_FEE_BALANCE',
        `Available fee balance ${ctx.availableFeeBalance} is below the estimated network fee ${ctx.estimatedNetworkFee}.`,
        'Add XLM to cover network fees.',
      ),
    );
  }
  if (required < 0) {
    failures.push(
      fail(check, 'INVALID_AMOUNTS', 'Transfer amount or fee cannot be negative.', 'Correct the quoted amounts.'),
    );
  }
  return { check, passed: failures.length === 0, failures };
}

export function validateTrustlineRequirements(
  ctx: StellarPreExecutionSafetyContext,
): SafetyCheckResult {
  const check = 'trustline' as const;
  const failures: SafetyCheckFailure[] = [];
  const existing = new Set(
    ctx.existingTrustlines.map((line) => `${line.code}:${line.issuer}`),
  );
  for (const required of ctx.requiredTrustlines) {
    const key = `${required.code}:${required.issuer}`;
    if (!existing.has(key)) {
      failures.push(
        fail(
          check,
          'TRUSTLINE_MISSING',
          `Missing trustline for ${required.code} issued by ${required.issuer}.`,
          `Establish a trustline for ${required.code} before signing.`,
        ),
      );
    }
  }
  return { check, passed: failures.length === 0, failures };
}

export function validateMinimumOutput(
  ctx: StellarPreExecutionSafetyContext,
): SafetyCheckResult {
  const check = 'minimum_output' as const;
  const failures: SafetyCheckFailure[] = [];
  if (ctx.quotedOutput < ctx.minimumOutput) {
    failures.push(
      fail(
        check,
        'OUTPUT_BELOW_MINIMUM',
        `Quoted output ${ctx.quotedOutput} is below the minimum accepted output ${ctx.minimumOutput}.`,
        'Increase slippage tolerance or select a better route.',
      ),
    );
  }
  return { check, passed: failures.length === 0, failures };
}

export function validateTransactionResources(
  ctx: StellarPreExecutionSafetyContext,
): SafetyCheckResult {
  const check = 'transaction_resources' as const;
  const failures: SafetyCheckFailure[] = [];
  if (ctx.resources.cpuInstructions > ctx.resourceLimits.cpuInstructions) {
    failures.push(
      fail(
        check,
        'CPU_LIMIT_EXCEEDED',
        `Simulated CPU instructions ${ctx.resources.cpuInstructions} exceed the limit ${ctx.resourceLimits.cpuInstructions}.`,
        'Reduce transaction complexity or raise the resource ceiling after review.',
      ),
    );
  }
  if (ctx.resources.memoryBytes > ctx.resourceLimits.memoryBytes) {
    failures.push(
      fail(
        check,
        'MEMORY_LIMIT_EXCEEDED',
        `Simulated memory ${ctx.resources.memoryBytes} exceeds the limit ${ctx.resourceLimits.memoryBytes}.`,
        'Split the operation or adjust contract resource settings.',
      ),
    );
  }
  if (ctx.resources.fee > ctx.resourceLimits.fee) {
    failures.push(
      fail(
        check,
        'FEE_LIMIT_EXCEEDED',
        `Simulated fee ${ctx.resources.fee} exceeds the limit ${ctx.resourceLimits.fee}.`,
        'Wait for lower network fees or increase the allowed fee cap.',
      ),
    );
  }
  return { check, passed: failures.length === 0, failures };
}

export function validateContractCompatibility(
  ctx: StellarPreExecutionSafetyContext,
): SafetyCheckResult {
  const check = 'contract_compatibility' as const;
  const failures: SafetyCheckFailure[] = [];
  if (!ctx.contractCompatible) {
    const detail = ctx.contractCompatibilityReasons?.join('; ') || 'Contract does not match the BridgeWise interface.';
    failures.push(
      fail(
        check,
        'CONTRACT_INCOMPATIBLE',
        detail,
        'Use a BridgeWise-compatible Soroban contract before signing.',
      ),
    );
  }
  return { check, passed: failures.length === 0, failures };
}
