import { ChainType, CrossChainMessage, MessageStatus } from '../types';

export type MessageValidationErrorCode =
  | 'NOT_AN_OBJECT'
  | 'MISSING_MESSAGE_ID'
  | 'INVALID_MESSAGE_ID'
  | 'MESSAGE_ID_TOO_LONG'
  | 'MISSING_SOURCE_CHAIN_ID'
  | 'INVALID_SOURCE_CHAIN_ID'
  | 'MISSING_DESTINATION_CHAIN_ID'
  | 'INVALID_DESTINATION_CHAIN_ID'
  | 'SAME_SOURCE_AND_DESTINATION'
  | 'MISSING_SOURCE_TX_HASH'
  | 'INVALID_SOURCE_TX_HASH'
  | 'MISSING_SOURCE_BLOCK_NUMBER'
  | 'INVALID_SOURCE_BLOCK_NUMBER'
  | 'INVALID_SOURCE_LOG_INDEX'
  | 'MISSING_MESSAGE_TYPE'
  | 'INVALID_MESSAGE_TYPE'
  | 'MISSING_PAYLOAD'
  | 'INVALID_PAYLOAD'
  | 'ODD_LENGTH_HEX_PAYLOAD'
  | 'PAYLOAD_TOO_LARGE'
  | 'MISSING_SENDER'
  | 'INVALID_SENDER'
  | 'MISSING_RECIPIENT'
  | 'INVALID_RECIPIENT'
  | 'MISSING_AMOUNT'
  | 'INVALID_AMOUNT'
  | 'INVALID_TOKEN_ADDRESS'
  | 'INVALID_MAX_GAS_LIMIT'
  | 'MISSING_CREATED_AT'
  | 'INVALID_CREATED_AT'
  | 'INVALID_STATUS'
  | 'INVALID_RETRY_COUNT'
  | 'INVALID_LAST_ERROR'
  | 'INVALID_ADDRESS_FORMAT';

export interface MessageValidationError {
  field: string;
  code: MessageValidationErrorCode;
  message: string;
}

export interface MessageValidationResult {
  valid: boolean;
  errors: MessageValidationError[];
}

export interface MessageValidationOptions {
  /**
   * Validates `sender` and `tokenAddress` against the source chain's address
   * format and `recipient` against the destination chain's, using the chain
   * IDs carried on the message.
   *
   * Off by default: the queue is chain-agnostic and `sourceChainId` /
   * `destinationChainId` are free-form strings, so a message that names a
   * chain this build does not know about is still validated structurally.
   * Enable it per deployment once the supported chain IDs are known.
   */
  enforceAddressFormat: boolean;
  /** Upper bound on `id`; ids become map keys and log fields. */
  maxIdLength: number;
  /** Upper bound on `payload` length, in characters. */
  maxPayloadLength: number;
}

export const DEFAULT_MESSAGE_VALIDATION_OPTIONS: MessageValidationOptions = {
  enforceAddressFormat: false,
  maxIdLength: 200,
  maxPayloadLength: 1_000_000,
};

/** Rejection reasons are stable and safe to assert on in tests and alerts. */
export const MESSAGE_STATUSES: readonly MessageStatus[] = [
  'pending',
  'queued',
  'processing',
  'submitted',
  'confirmed',
  'failed',
  'expired',
];

export const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
export const STELLAR_ADDRESS_PATTERN = /^[GC][A-Z2-7]{55}$/;
export const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const HEX_PATTERN = /^[0-9a-fA-F]+$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const DIGITS_PATTERN = /^[0-9]+$/;

const KNOWN_CHAIN_TYPES: ReadonlyArray<readonly [RegExp, ChainType]> = [
  [/^(ethereum|mainnet|sepolia|polygon|matic|base|arbitrum|optimism|avalanche|bsc|bnb|evm)$/i, 'evm'],
  [/^(stellar|soroban|horizon|xdr)$/i, 'soroban'],
  [/^(solana|spl)$/i, 'solana'],
];

/**
 * Resolves a free-form chain ID to a chain family, or `undefined` when this
 * build does not know the chain. Unknown chains are left to the caller's
 * address policy rather than being rejected.
 */
export function resolveChainType(chainId: unknown): ChainType | undefined {
  if (typeof chainId !== 'string') return undefined;
  const normalized = chainId.trim().toLowerCase();
  for (const [pattern, type] of KNOWN_CHAIN_TYPES) {
    if (pattern.test(normalized)) return type;
  }
  return undefined;
}

export function isValidAddressForChainType(address: string, chainType: ChainType): boolean {
  switch (chainType) {
    case 'evm':
      return EVM_ADDRESS_PATTERN.test(address);
    case 'soroban':
      return STELLAR_ADDRESS_PATTERN.test(address);
    case 'solana':
      return SOLANA_ADDRESS_PATTERN.test(address);
    default:
      return true;
  }
}

/**
 * Cross-chain transaction hashes are hex (EVM and Stellar) or base64
 * (Solana and other RPC backends). Anything containing whitespace, control
 * characters or stray punctuation is malformed, not merely unfamiliar.
 */
function isPlausibleTxHash(value: string): boolean {
  const candidate = value.startsWith('0x') ? value.slice(2) : value;
  if (candidate.length === 0 || candidate.length % 2 !== 0) return false;
  return HEX_PATTERN.test(candidate) || BASE64_PATTERN.test(candidate);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Reports a required string field as either absent (missing) or present with
 * the wrong type, so operators can tell a truncated indexer payload from one
 * that lost its type information in transit.
 */
function requireString(
  value: unknown,
  field: string,
  missingCode: MessageValidationErrorCode,
  invalidCode: MessageValidationErrorCode,
  add: (field: string, code: MessageValidationErrorCode, message: string) => void,
): void {
  if (value === undefined || value === null) {
    add(field, missingCode, `${field} is required`);
  } else if (typeof value !== 'string') {
    add(field, invalidCode, `${field} must be a string, received ${typeof value}`);
  } else if (value.trim().length === 0) {
    add(field, missingCode, `${field} must not be blank`);
  }
}

/**
 * Validates the shape of a cross-chain message before it reaches the delivery
 * path. All problems are reported at once, mirroring
 * `validateTransferPayload`, so an operator sees every field a malformed
 * message got wrong in a single pass.
 *
 * This checks structure, not policy. Whether a well-formed transfer is
 * *wanted* is a separate concern handled by duplicate detection and
 * destination-chain contracts.
 */
export function validateCrossChainMessage(
  message: unknown,
  options: Partial<MessageValidationOptions> = {},
): MessageValidationResult {
  const config = { ...DEFAULT_MESSAGE_VALIDATION_OPTIONS, ...options };
  const errors: MessageValidationError[] = [];
  const add = (field: string, code: MessageValidationErrorCode, message: string): void => {
    errors.push({ field, code, message });
  };

  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    return {
      valid: false,
      errors: [{ field: '_', code: 'NOT_AN_OBJECT', message: 'Message must be an object' }],
    };
  }

  const m = message as Record<string, unknown>;

  requireString(m.id, 'id', 'MISSING_MESSAGE_ID', 'INVALID_MESSAGE_ID', add);
  if (typeof m.id === 'string' && m.id.trim().length > 0 && m.id.length > config.maxIdLength) {
    add('id', 'MESSAGE_ID_TOO_LONG', `id must be at most ${config.maxIdLength} characters`);
  }

  requireString(m.sourceChainId, 'sourceChainId', 'MISSING_SOURCE_CHAIN_ID', 'INVALID_SOURCE_CHAIN_ID', add);
  requireString(
    m.destinationChainId,
    'destinationChainId',
    'MISSING_DESTINATION_CHAIN_ID',
    'INVALID_DESTINATION_CHAIN_ID',
    add,
  );
  if (
    isNonEmptyString(m.sourceChainId) &&
    isNonEmptyString(m.destinationChainId) &&
    m.sourceChainId.trim() === m.destinationChainId.trim()
  ) {
    add(
      'destinationChainId',
      'SAME_SOURCE_AND_DESTINATION',
      'sourceChainId and destinationChainId must differ',
    );
  }

  if (!isNonEmptyString(m.sourceTxHash)) {
    add('sourceTxHash', 'MISSING_SOURCE_TX_HASH', 'sourceTxHash is required');
  } else if (!isPlausibleTxHash(m.sourceTxHash.trim())) {
    add('sourceTxHash', 'INVALID_SOURCE_TX_HASH', 'sourceTxHash is not a valid hex or base64 transaction hash');
  }

  if (m.sourceBlockNumber === undefined || m.sourceBlockNumber === null) {
    add('sourceBlockNumber', 'MISSING_SOURCE_BLOCK_NUMBER', 'sourceBlockNumber is required');
  } else if (!isNonNegativeInteger(m.sourceBlockNumber)) {
    add(
      'sourceBlockNumber',
      'INVALID_SOURCE_BLOCK_NUMBER',
      'sourceBlockNumber must be a non-negative integer',
    );
  }

  if (m.sourceLogIndex !== undefined && m.sourceLogIndex !== null && !isNonNegativeInteger(m.sourceLogIndex)) {
    add('sourceLogIndex', 'INVALID_SOURCE_LOG_INDEX', 'sourceLogIndex must be a non-negative integer');
  }

  requireString(m.messageType, 'messageType', 'MISSING_MESSAGE_TYPE', 'INVALID_MESSAGE_TYPE', add);
  if (isNonEmptyString(m.messageType) && m.messageType.trim().length > 64) {
    add('messageType', 'INVALID_MESSAGE_TYPE', 'messageType must be at most 64 characters');
  }

  if (typeof m.payload !== 'string') {
    add('payload', 'MISSING_PAYLOAD', 'payload is required and must be a string');
  } else if (m.payload.length === 0) {
    add('payload', 'MISSING_PAYLOAD', 'payload must not be empty');
  } else if (m.payload.length > config.maxPayloadLength) {
    add('payload', 'PAYLOAD_TOO_LARGE', `payload must be at most ${config.maxPayloadLength} characters`);
  } else if (m.payload.startsWith('0x')) {
    const body = m.payload.slice(2);
    if (body.length === 0) {
      add('payload', 'MISSING_PAYLOAD', 'payload must contain data after the 0x prefix');
    } else if (!HEX_PATTERN.test(body)) {
      add('payload', 'INVALID_PAYLOAD', 'payload must be hex when 0x-prefixed');
    } else if (body.length % 2 !== 0) {
      add('payload', 'ODD_LENGTH_HEX_PAYLOAD', 'payload hex must have an even number of characters');
    }
  }

  requireString(m.sender, 'sender', 'MISSING_SENDER', 'INVALID_SENDER', add);
  requireString(m.recipient, 'recipient', 'MISSING_RECIPIENT', 'INVALID_RECIPIENT', add);

  if (m.amount !== undefined && m.amount !== null) {
    if (typeof m.amount !== 'string') {
      add('amount', 'INVALID_AMOUNT', `amount must be a string, received ${typeof m.amount}`);
    } else if (m.amount.trim().length === 0) {
      add('amount', 'MISSING_AMOUNT', 'amount must not be blank');
    } else if (!DIGITS_PATTERN.test(m.amount.trim())) {
      add('amount', 'INVALID_AMOUNT', 'amount must be a base-10 integer of token units');
    }
  }

  if (m.maxGasLimit !== undefined && m.maxGasLimit !== null) {
    if (typeof m.maxGasLimit !== 'string') {
      add('maxGasLimit', 'INVALID_MAX_GAS_LIMIT', `maxGasLimit must be a string, received ${typeof m.maxGasLimit}`);
    } else if (
      !DIGITS_PATTERN.test(m.maxGasLimit.trim()) ||
      m.maxGasLimit.trim().length > 78 ||
      BigInt(m.maxGasLimit.trim()) === 0n
    ) {
      // 78 digits is the width of the largest EVM gas value a uint256 can hold;
      // everything above that is memory abuse, not a gas limit.
      add('maxGasLimit', 'INVALID_MAX_GAS_LIMIT', 'maxGasLimit must be a positive base-10 integer');
    }
  }

  if (m.createdAt === undefined || m.createdAt === null) {
    add('createdAt', 'MISSING_CREATED_AT', 'createdAt is required');
  } else if (!isNonNegativeInteger(m.createdAt)) {
    add('createdAt', 'INVALID_CREATED_AT', 'createdAt must be a non-negative integer of milliseconds');
  }

  if (typeof m.status !== 'string' || !MESSAGE_STATUSES.includes(m.status as MessageStatus)) {
    add('status', 'INVALID_STATUS', `status must be one of: ${MESSAGE_STATUSES.join(', ')}`);
  }

  if (!isNonNegativeInteger(m.retryCount)) {
    add('retryCount', 'INVALID_RETRY_COUNT', 'retryCount must be a non-negative integer');
  }

  if (m.lastError !== undefined && m.lastError !== null && typeof m.lastError !== 'string') {
    add('lastError', 'INVALID_LAST_ERROR', `lastError must be a string, received ${typeof m.lastError}`);
  }

  if (config.enforceAddressFormat) {
    validateAddressFormat(m, add);
  }

  return { valid: errors.length === 0, errors };
}

function validateAddressFormat(
  m: Record<string, unknown>,
  add: (field: string, code: MessageValidationErrorCode, message: string) => void,
): void {
  const sourceType = resolveChainType(m.sourceChainId);
  const destinationType = resolveChainType(m.destinationChainId);

  if (sourceType && isNonEmptyString(m.sender) && !isValidAddressForChainType(m.sender, sourceType)) {
    add('sender', 'INVALID_ADDRESS_FORMAT', `sender is not a valid ${sourceType} address`);
  }
  if (
    sourceType &&
    isNonEmptyString(m.tokenAddress) &&
    !isValidAddressForChainType(m.tokenAddress, sourceType)
  ) {
    add('tokenAddress', 'INVALID_TOKEN_ADDRESS', `tokenAddress is not a valid ${sourceType} address`);
  }
  if (
    destinationType &&
    isNonEmptyString(m.recipient) &&
    !isValidAddressForChainType(m.recipient, destinationType)
  ) {
    add('recipient', 'INVALID_ADDRESS_FORMAT', `recipient is not a valid ${destinationType} address`);
  }
}

export function isValidCrossChainMessage(
  message: unknown,
  options?: Partial<MessageValidationOptions>,
): message is CrossChainMessage {
  return validateCrossChainMessage(message, options).valid;
}

/** Throws on a malformed message, naming every offending field; for call sites that cannot continue. */
export function assertValidCrossChainMessage(
  message: unknown,
  options?: Partial<MessageValidationOptions>,
): asserts message is CrossChainMessage {
  const result = validateCrossChainMessage(message, options);
  if (result.valid) return;
  const detail = result.errors.map((error) => `${error.field}: ${error.code}`).join('; ');
  throw new Error(`Malformed cross-chain message (${detail})`);
}
