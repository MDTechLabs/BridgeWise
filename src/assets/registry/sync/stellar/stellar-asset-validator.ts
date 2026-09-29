import { StellarAssetMetadataInput, StellarAssetRecord } from './types';

/** Classic Stellar account id (strkey): `G` + 55 base32 chars. */
const ACCOUNT_ID_REGEX = /^G[A-Z2-7]{55}$/;

/** Soroban contract id (strkey): `C` + 55 base32 chars. */
const CONTRACT_ID_REGEX = /^C[A-Z2-7]{55}$/;

/** Stellar asset codes are 1-12 uppercase alphanumeric characters. */
const ASSET_CODE_REGEX = /^[A-Z0-9]{1,12}$/;

const NATIVE_CODES = new Set(['XLM', 'NATIVE']);
const MAX_DECIMALS = 77;
const DEFAULT_DECIMALS = 7;
const DEFAULT_NETWORK = 'stellar';

/** Thrown when incoming asset metadata is invalid. */
export class StellarAssetValidationError extends Error {
  /** All validation issues that were found. */
  readonly issues: string[];

  constructor(assetLabel: string, issues: string[]) {
    super(
      `Invalid Stellar asset metadata for "${assetLabel}": ${issues.join('; ')}`,
    );
    this.name = 'StellarAssetValidationError';
    this.issues = [...issues];
  }
}

/** Whether `value` is a valid classic Stellar account (issuer) id. */
export function isValidStellarAccountId(value: unknown): boolean {
  return typeof value === 'string' && ACCOUNT_ID_REGEX.test(value);
}

/** Whether `value` is a valid Soroban contract id. */
export function isValidSorobanContractId(value: unknown): boolean {
  return typeof value === 'string' && CONTRACT_ID_REGEX.test(value);
}

/** Whether `value` is a native-asset code (`XLM`/`NATIVE`). */
export function isNativeAssetCode(value: unknown): boolean {
  return (
    typeof value === 'string' && NATIVE_CODES.has(value.trim().toUpperCase())
  );
}

/**
 * Collect all validation issues for a single incoming asset record.
 * An empty array means the record is valid.
 */
export function collectStellarAssetIssues(
  input: StellarAssetMetadataInput,
  defaultNetwork: string = DEFAULT_NETWORK,
): string[] {
  const issues: string[] = [];

  if (!input || typeof input !== 'object') {
    return ['asset metadata must be an object'];
  }

  const code =
    typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
  if (!code) {
    issues.push('code must be a non-empty string');
  } else if (!ASSET_CODE_REGEX.test(code)) {
    issues.push(
      `code "${input.code}" must be 1-12 uppercase alphanumeric characters`,
    );
  }

  if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
    issues.push('name must be a non-empty string');
  }

  const network =
    typeof input.network === 'string' && input.network.trim()
      ? input.network.trim()
      : defaultNetwork;
  if (!network) {
    issues.push('network must be a non-empty string');
  }

  const native = NATIVE_CODES.has(code);
  const issuer = normalizeOptional(input.issuer);
  const contractId = normalizeOptional(input.contractId);

  if (native) {
    if (issuer && issuer.toLowerCase() !== 'native') {
      issues.push('native asset must not declare an issuer');
    }
    if (contractId) {
      issues.push('native asset must not declare a contractId');
    }
  } else {
    if (!issuer && !contractId) {
      issues.push('non-native asset must declare an issuer or contractId');
    }
    if (issuer && !isValidStellarAccountId(issuer)) {
      issues.push(`issuer "${issuer}" is not a valid Stellar account id`);
    }
    if (contractId && !isValidSorobanContractId(contractId)) {
      issues.push(
        `contractId "${contractId}" is not a valid Soroban contract id`,
      );
    }
  }

  const decimals = input.decimals ?? DEFAULT_DECIMALS;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    issues.push(`decimals must be an integer between 0 and ${MAX_DECIMALS}`);
  }

  return issues;
}

/**
 * Validate and normalize incoming metadata into a canonical record.
 *
 * @throws StellarAssetValidationError when the metadata is invalid.
 */
export function validateStellarAssetMetadata(
  input: StellarAssetMetadataInput,
  defaultNetwork: string = DEFAULT_NETWORK,
): StellarAssetRecord {
  const issues = collectStellarAssetIssues(input, defaultNetwork);
  if (issues.length > 0) {
    throw new StellarAssetValidationError(describe(input), issues);
  }

  const code = input.code.trim().toUpperCase();
  const network = (
    typeof input.network === 'string' && input.network.trim()
      ? input.network.trim()
      : defaultNetwork
  ).toLowerCase();
  const native = NATIVE_CODES.has(code);

  const issuer = native ? undefined : normalizeOptional(input.issuer);
  const contractId = native ? undefined : normalizeOptional(input.contractId);
  const id =
    (typeof input.id === 'string' && input.id.trim()) ||
    `${network}:${issuer ?? contractId ?? 'native'}:${code}`;

  return {
    id,
    code,
    name: input.name.trim(),
    network,
    issuer,
    contractId,
    decimals: input.decimals ?? DEFAULT_DECIMALS,
    tags: input.tags ? [...input.tags] : [],
    metadata: input.metadata ? { ...input.metadata } : {},
  };
}

function normalizeOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'native') return undefined;
  return trimmed;
}

function describe(input: unknown): string {
  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    if (typeof record.code === 'string' && record.code.trim()) {
      return record.code.trim().toUpperCase();
    }
  }
  return '<unknown>';
}
