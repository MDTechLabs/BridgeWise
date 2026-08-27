export type SafetyCheckName =
  | 'quote_freshness'
  | 'destination_account'
  | 'asset_balance'
  | 'trustline'
  | 'minimum_output'
  | 'transaction_resources'
  | 'contract_compatibility';

export type SafetySeverity = 'error' | 'warning';

export interface SafetyCheckFailure {
  check: SafetyCheckName;
  code: string;
  severity: SafetySeverity;
  reason: string;
  action: string;
}

export interface SafetyCheckResult {
  check: SafetyCheckName;
  passed: boolean;
  failures: SafetyCheckFailure[];
}

export interface StellarPreExecutionSafetyContext {
  quoteQuotedAt: number;
  quoteTtlMs: number;
  destinationAccount: string;
  destinationExists: boolean;
  destinationFunded: boolean;
  transferAsset: string;
  transferAmount: number;
  availableTransferBalance: number;
  estimatedNetworkFee: number;
  availableFeeBalance: number;
  requiredTrustlines: Array<{ code: string; issuer: string }>;
  existingTrustlines: Array<{ code: string; issuer: string }>;
  quotedOutput: number;
  minimumOutput: number;
  resources: {
    cpuInstructions: number;
    memoryBytes: number;
    fee: number;
  };
  resourceLimits: {
    cpuInstructions: number;
    memoryBytes: number;
    fee: number;
  };
  contractCompatible: boolean;
  contractCompatibilityReasons?: string[];
}

export interface StellarPreExecutionSafetyResult {
  safe: boolean;
  blocked: boolean;
  checkedAt: number;
  checks: SafetyCheckResult[];
  failures: SafetyCheckFailure[];
}

export interface SafetyPipelineConfig {
  now?: () => number;
}
