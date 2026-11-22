import { HttpStatus } from '@nestjs/common';
import { ErrorCode, ALL_ERROR_CODES } from './error-codes';

/**
 * Whether a failed request should be retried and at what strategy.
 *   never    – client error; retrying will not help
 *   fixed    – retry after a fixed delay (see retryAfterSeconds)
 *   backoff  – retry with exponential back-off
 */
export type RetryHint = 'never' | 'fixed' | 'backoff';

/**
 * A single entry in the error catalogue.
 */
export interface ErrorCatalogueEntry {
  /** The canonical error code string (same value as the key). */
  code: ErrorCode;
  /** Short human-readable title (~5 words). */
  title: string;
  /** Full description explaining the cause and how to resolve it. */
  description: string;
  /** Recommended HTTP status code for this error. */
  httpStatus: HttpStatus;
  /** Retry guidance for API consumers. */
  retryHint: RetryHint;
  /** Suggested retry delay in seconds (relevant for 'fixed' or as initial delay for 'backoff'). */
  retryAfterSeconds?: number;
  /** Link to relevant documentation section. */
  docsUrl?: string;
}

const BASE_DOCS = 'https://docs.bridgewise.example.com/api/errors';

/**
 * Complete BridgeWise API error catalogue.
 *
 * All codes from `ALL_ERROR_CODES` must appear here.
 * Use `getCatalogueEntry()` to look up a code at runtime.
 */
export const ERROR_CATALOGUE: Record<ErrorCode, ErrorCatalogueEntry> = {
  // ── Bridge ────────────────────────────────────────────────────────────────
  [ALL_ERROR_CODES.BRIDGE_NOT_INITIALIZED]: {
    code: ALL_ERROR_CODES.BRIDGE_NOT_INITIALIZED,
    title: 'Bridge adapter not initialised',
    description: 'The bridge adapter has not been initialised. This is a server-side configuration issue; contact support.',
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    retryHint: 'backoff',
    retryAfterSeconds: 30,
    docsUrl: `${BASE_DOCS}#BRIDGE_NOT_INITIALIZED`,
  },
  [ALL_ERROR_CODES.BRIDGE_CONFIG_INVALID]: {
    code: ALL_ERROR_CODES.BRIDGE_CONFIG_INVALID,
    title: 'Bridge configuration is invalid',
    description: 'The bridge is misconfigured on the server. Contact support.',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#BRIDGE_CONFIG_INVALID`,
  },
  [ALL_ERROR_CODES.BRIDGE_INTERNAL_ERROR]: {
    code: ALL_ERROR_CODES.BRIDGE_INTERNAL_ERROR,
    title: 'Internal bridge error',
    description: 'An unexpected internal error occurred in the bridge layer. Retry with exponential back-off.',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    retryHint: 'backoff',
    retryAfterSeconds: 5,
    docsUrl: `${BASE_DOCS}#BRIDGE_INTERNAL_ERROR`,
  },
  [ALL_ERROR_CODES.BRIDGE_TIMEOUT]: {
    code: ALL_ERROR_CODES.BRIDGE_TIMEOUT,
    title: 'Bridge operation timed out',
    description: 'The bridge adapter did not respond within the allowed time. Retry with back-off.',
    httpStatus: HttpStatus.GATEWAY_TIMEOUT,
    retryHint: 'backoff',
    retryAfterSeconds: 10,
    docsUrl: `${BASE_DOCS}#BRIDGE_TIMEOUT`,
  },
  [ALL_ERROR_CODES.AGGREGATION_FAILED]: {
    code: ALL_ERROR_CODES.AGGREGATION_FAILED,
    title: 'Route aggregation failed',
    description: 'Unable to aggregate routes across bridge providers. Retry after a short delay.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 5,
    docsUrl: `${BASE_DOCS}#AGGREGATION_FAILED`,
  },
  [ALL_ERROR_CODES.NO_ROUTES_FOUND]: {
    code: ALL_ERROR_CODES.NO_ROUTES_FOUND,
    title: 'No bridge routes available',
    description: 'No routes exist for the requested token pair and chain combination. Check supported assets.',
    httpStatus: HttpStatus.NOT_FOUND,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#NO_ROUTES_FOUND`,
  },
  [ALL_ERROR_CODES.INVALID_ROUTE]: {
    code: ALL_ERROR_CODES.INVALID_ROUTE,
    title: 'Route is invalid',
    description: 'The specified route is malformed or references unsupported assets/chains.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#INVALID_ROUTE`,
  },
  [ALL_ERROR_CODES.INVALID_INPUT]: {
    code: ALL_ERROR_CODES.INVALID_INPUT,
    title: 'Invalid input',
    description: 'One or more input fields are invalid. Check the `details` field for specifics.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#INVALID_INPUT`,
  },
  [ALL_ERROR_CODES.MISSING_REQUIRED_FIELD]: {
    code: ALL_ERROR_CODES.MISSING_REQUIRED_FIELD,
    title: 'Required field missing',
    description: 'A required request field is absent. Inspect the `details.field` property.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#MISSING_REQUIRED_FIELD`,
  },
  [ALL_ERROR_CODES.INVALID_AMOUNT]: {
    code: ALL_ERROR_CODES.INVALID_AMOUNT,
    title: 'Amount value is invalid',
    description: 'The `amount` field must be a positive decimal string with no more than 18 decimal places.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#INVALID_AMOUNT`,
  },
  [ALL_ERROR_CODES.INVALID_TOKEN]: {
    code: ALL_ERROR_CODES.INVALID_TOKEN,
    title: 'Token not recognised',
    description: 'The token symbol or address is not recognised. Consult the /tokens endpoint for supported assets.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#INVALID_TOKEN`,
  },
  [ALL_ERROR_CODES.INVALID_CHAIN]: {
    code: ALL_ERROR_CODES.INVALID_CHAIN,
    title: 'Chain ID not supported',
    description: 'The specified chain is not in the list of supported networks.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#INVALID_CHAIN`,
  },
  [ALL_ERROR_CODES.INVALID_ADDRESS]: {
    code: ALL_ERROR_CODES.INVALID_ADDRESS,
    title: 'Address format invalid',
    description: 'The wallet address does not match the expected format for the target chain.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#INVALID_ADDRESS`,
  },

  // ── Stellar Adapter ───────────────────────────────────────────────────────
  [ALL_ERROR_CODES.STELLAR_CONNECTION_FAILED]: {
    code: ALL_ERROR_CODES.STELLAR_CONNECTION_FAILED,
    title: 'Stellar node connection failed',
    description: 'Could not connect to the Stellar Horizon/RPC endpoint. Retry with back-off.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 10,
    docsUrl: `${BASE_DOCS}#STELLAR_CONNECTION_FAILED`,
  },
  [ALL_ERROR_CODES.STELLAR_NETWORK_ERROR]: {
    code: ALL_ERROR_CODES.STELLAR_NETWORK_ERROR,
    title: 'Stellar network error',
    description: 'A network-level error occurred communicating with Stellar. Retry later.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 10,
    docsUrl: `${BASE_DOCS}#STELLAR_NETWORK_ERROR`,
  },
  [ALL_ERROR_CODES.STELLAR_RPC_ERROR]: {
    code: ALL_ERROR_CODES.STELLAR_RPC_ERROR,
    title: 'Stellar RPC returned an error',
    description: 'The Stellar RPC node returned an error response. Check `details.rpcError` for the raw error.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 5,
    docsUrl: `${BASE_DOCS}#STELLAR_RPC_ERROR`,
  },
  [ALL_ERROR_CODES.STELLAR_OPERATION_FAILED]: {
    code: ALL_ERROR_CODES.STELLAR_OPERATION_FAILED,
    title: 'Stellar operation failed',
    description: 'The Stellar transaction operation was rejected by the network.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#STELLAR_OPERATION_FAILED`,
  },
  [ALL_ERROR_CODES.STELLAR_INVALID_MEMO]: {
    code: ALL_ERROR_CODES.STELLAR_INVALID_MEMO,
    title: 'Invalid Stellar memo',
    description: 'The transaction memo is malformed or exceeds the allowed length.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#STELLAR_INVALID_MEMO`,
  },
  [ALL_ERROR_CODES.STELLAR_INSUFFICIENT_BALANCE]: {
    code: ALL_ERROR_CODES.STELLAR_INSUFFICIENT_BALANCE,
    title: 'Insufficient Stellar balance',
    description: 'The source account does not have sufficient XLM or token balance to cover the operation and fees.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#STELLAR_INSUFFICIENT_BALANCE`,
  },
  [ALL_ERROR_CODES.STELLAR_INVALID_TRANSACTION]: {
    code: ALL_ERROR_CODES.STELLAR_INVALID_TRANSACTION,
    title: 'Stellar transaction invalid',
    description: 'The constructed Stellar transaction is invalid. Check envelope formatting.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#STELLAR_INVALID_TRANSACTION`,
  },
  [ALL_ERROR_CODES.STELLAR_FEE_ESTIMATION_FAILED]: {
    code: ALL_ERROR_CODES.STELLAR_FEE_ESTIMATION_FAILED,
    title: 'Stellar fee estimation failed',
    description: 'Unable to estimate fees for the Stellar transaction. Retry later.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 5,
    docsUrl: `${BASE_DOCS}#STELLAR_FEE_ESTIMATION_FAILED`,
  },
  [ALL_ERROR_CODES.STELLAR_FEE_EXCEEDS_LIMIT]: {
    code: ALL_ERROR_CODES.STELLAR_FEE_EXCEEDS_LIMIT,
    title: 'Stellar fee exceeds limit',
    description: 'The estimated Stellar fee exceeds the caller-specified maximum fee limit.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#STELLAR_FEE_EXCEEDS_LIMIT`,
  },
  [ALL_ERROR_CODES.STELLAR_INVALID_ASSET]: {
    code: ALL_ERROR_CODES.STELLAR_INVALID_ASSET,
    title: 'Stellar asset is invalid',
    description: 'The asset code or issuer address is malformed.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#STELLAR_INVALID_ASSET`,
  },
  [ALL_ERROR_CODES.STELLAR_ASSET_NOT_FOUND]: {
    code: ALL_ERROR_CODES.STELLAR_ASSET_NOT_FOUND,
    title: 'Stellar asset not found',
    description: 'The specified Stellar asset does not exist on the network.',
    httpStatus: HttpStatus.NOT_FOUND,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#STELLAR_ASSET_NOT_FOUND`,
  },
  [ALL_ERROR_CODES.STELLAR_UNSUPPORTED_OPERATION]: {
    code: ALL_ERROR_CODES.STELLAR_UNSUPPORTED_OPERATION,
    title: 'Stellar operation not supported',
    description: 'The requested Stellar operation type is not supported by this adapter.',
    httpStatus: HttpStatus.NOT_IMPLEMENTED,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#STELLAR_UNSUPPORTED_OPERATION`,
  },

  // ── Soroban ───────────────────────────────────────────────────────────────
  [ALL_ERROR_CODES.SOROBAN_INVALID_CONTRACT_ADDRESS]: {
    code: ALL_ERROR_CODES.SOROBAN_INVALID_CONTRACT_ADDRESS,
    title: 'Soroban contract address invalid',
    description: 'The provided Soroban contract address is not a valid strkey.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#SOROBAN_INVALID_CONTRACT_ADDRESS`,
  },
  [ALL_ERROR_CODES.SOROBAN_CONTRACT_NOT_FOUND]: {
    code: ALL_ERROR_CODES.SOROBAN_CONTRACT_NOT_FOUND,
    title: 'Soroban contract not found',
    description: 'No contract exists at the specified address on this network.',
    httpStatus: HttpStatus.NOT_FOUND,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#SOROBAN_CONTRACT_NOT_FOUND`,
  },
  [ALL_ERROR_CODES.SOROBAN_RPC_UNAVAILABLE]: {
    code: ALL_ERROR_CODES.SOROBAN_RPC_UNAVAILABLE,
    title: 'Soroban RPC unavailable',
    description: 'The Soroban RPC node is temporarily unavailable. Retry with back-off.',
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    retryHint: 'backoff',
    retryAfterSeconds: 15,
    docsUrl: `${BASE_DOCS}#SOROBAN_RPC_UNAVAILABLE`,
  },
  [ALL_ERROR_CODES.SOROBAN_RESOLUTION_FAILED]: {
    code: ALL_ERROR_CODES.SOROBAN_RESOLUTION_FAILED,
    title: 'Soroban contract resolution failed',
    description: 'Failed to resolve the Soroban contract interface. Check contract ABI compatibility.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#SOROBAN_RESOLUTION_FAILED`,
  },
  [ALL_ERROR_CODES.SOROBAN_UNSUPPORTED_NETWORK]: {
    code: ALL_ERROR_CODES.SOROBAN_UNSUPPORTED_NETWORK,
    title: 'Network not supported for Soroban',
    description: 'Soroban contracts are only available on Stellar Mainnet and Testnet.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#SOROBAN_UNSUPPORTED_NETWORK`,
  },

  // ── LayerZero Adapter ────────────────────────────────────────────────────
  [ALL_ERROR_CODES.LAYERZERO_CONNECTION_FAILED]: {
    code: ALL_ERROR_CODES.LAYERZERO_CONNECTION_FAILED,
    title: 'LayerZero endpoint unreachable',
    description: 'Could not connect to the LayerZero endpoint. Retry with back-off.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 10,
    docsUrl: `${BASE_DOCS}#LAYERZERO_CONNECTION_FAILED`,
  },
  [ALL_ERROR_CODES.LAYERZERO_NETWORK_ERROR]: {
    code: ALL_ERROR_CODES.LAYERZERO_NETWORK_ERROR,
    title: 'LayerZero network error',
    description: 'A network-level error occurred communicating with LayerZero.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 10,
    docsUrl: `${BASE_DOCS}#LAYERZERO_NETWORK_ERROR`,
  },
  [ALL_ERROR_CODES.LAYERZERO_RPC_ERROR]: {
    code: ALL_ERROR_CODES.LAYERZERO_RPC_ERROR,
    title: 'LayerZero RPC error',
    description: 'The LayerZero RPC returned an error. Check `details.rpcError`.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 5,
    docsUrl: `${BASE_DOCS}#LAYERZERO_RPC_ERROR`,
  },
  [ALL_ERROR_CODES.LAYERZERO_OPERATION_FAILED]: {
    code: ALL_ERROR_CODES.LAYERZERO_OPERATION_FAILED,
    title: 'LayerZero operation failed',
    description: 'The LayerZero cross-chain message delivery failed.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#LAYERZERO_OPERATION_FAILED`,
  },
  [ALL_ERROR_CODES.LAYERZERO_INVALID_DESTINATION]: {
    code: ALL_ERROR_CODES.LAYERZERO_INVALID_DESTINATION,
    title: 'LayerZero destination invalid',
    description: 'The destination chain or address is not valid for LayerZero.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#LAYERZERO_INVALID_DESTINATION`,
  },
  [ALL_ERROR_CODES.LAYERZERO_INSUFFICIENT_GAS]: {
    code: ALL_ERROR_CODES.LAYERZERO_INSUFFICIENT_GAS,
    title: 'Insufficient gas for LayerZero',
    description: 'The provided gas/fee is insufficient for the LayerZero operation.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#LAYERZERO_INSUFFICIENT_GAS`,
  },
  [ALL_ERROR_CODES.LAYERZERO_INVALID_TRANSACTION]: {
    code: ALL_ERROR_CODES.LAYERZERO_INVALID_TRANSACTION,
    title: 'LayerZero transaction invalid',
    description: 'The LayerZero transaction is malformed.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#LAYERZERO_INVALID_TRANSACTION`,
  },
  [ALL_ERROR_CODES.LAYERZERO_QUOTE_FAILED]: {
    code: ALL_ERROR_CODES.LAYERZERO_QUOTE_FAILED,
    title: 'LayerZero fee quote failed',
    description: 'Unable to obtain a fee quote from LayerZero. Retry later.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 5,
    docsUrl: `${BASE_DOCS}#LAYERZERO_QUOTE_FAILED`,
  },
  [ALL_ERROR_CODES.LAYERZERO_GAS_ESTIMATION_FAILED]: {
    code: ALL_ERROR_CODES.LAYERZERO_GAS_ESTIMATION_FAILED,
    title: 'LayerZero gas estimation failed',
    description: 'Failed to estimate gas for the LayerZero operation.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 5,
    docsUrl: `${BASE_DOCS}#LAYERZERO_GAS_ESTIMATION_FAILED`,
  },
  [ALL_ERROR_CODES.LAYERZERO_INVALID_CHAIN]: {
    code: ALL_ERROR_CODES.LAYERZERO_INVALID_CHAIN,
    title: 'LayerZero chain ID invalid',
    description: 'The chain ID is not valid in the LayerZero endpoint ID space.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#LAYERZERO_INVALID_CHAIN`,
  },
  [ALL_ERROR_CODES.LAYERZERO_CHAIN_NOT_SUPPORTED]: {
    code: ALL_ERROR_CODES.LAYERZERO_CHAIN_NOT_SUPPORTED,
    title: 'Chain not supported by LayerZero',
    description: 'The requested chain is not supported by the LayerZero adapter.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#LAYERZERO_CHAIN_NOT_SUPPORTED`,
  },
  [ALL_ERROR_CODES.LAYERZERO_INVALID_TOKEN]: {
    code: ALL_ERROR_CODES.LAYERZERO_INVALID_TOKEN,
    title: 'Token invalid for LayerZero',
    description: 'The token is not supported by the LayerZero OFT bridge.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#LAYERZERO_INVALID_TOKEN`,
  },

  // ── Hop Adapter ───────────────────────────────────────────────────────────
  [ALL_ERROR_CODES.HOP_CONNECTION_FAILED]: {
    code: ALL_ERROR_CODES.HOP_CONNECTION_FAILED,
    title: 'Hop Protocol unreachable',
    description: 'Could not connect to the Hop Protocol API. Retry with back-off.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 10,
    docsUrl: `${BASE_DOCS}#HOP_CONNECTION_FAILED`,
  },
  [ALL_ERROR_CODES.HOP_NETWORK_ERROR]: {
    code: ALL_ERROR_CODES.HOP_NETWORK_ERROR,
    title: 'Hop network error',
    description: 'A network error occurred communicating with Hop Protocol.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 10,
    docsUrl: `${BASE_DOCS}#HOP_NETWORK_ERROR`,
  },
  [ALL_ERROR_CODES.HOP_RPC_ERROR]: {
    code: ALL_ERROR_CODES.HOP_RPC_ERROR,
    title: 'Hop RPC error',
    description: 'The Hop RPC endpoint returned an error. Check `details.rpcError`.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 5,
    docsUrl: `${BASE_DOCS}#HOP_RPC_ERROR`,
  },
  [ALL_ERROR_CODES.HOP_OPERATION_FAILED]: {
    code: ALL_ERROR_CODES.HOP_OPERATION_FAILED,
    title: 'Hop operation failed',
    description: 'The Hop Protocol transfer operation failed on-chain.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#HOP_OPERATION_FAILED`,
  },
  [ALL_ERROR_CODES.HOP_INVALID_ROUTE]: {
    code: ALL_ERROR_CODES.HOP_INVALID_ROUTE,
    title: 'Hop route is invalid',
    description: 'The specified route is not supported by Hop Protocol.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#HOP_INVALID_ROUTE`,
  },
  [ALL_ERROR_CODES.HOP_INSUFFICIENT_LIQUIDITY]: {
    code: ALL_ERROR_CODES.HOP_INSUFFICIENT_LIQUIDITY,
    title: 'Insufficient Hop liquidity',
    description: 'The Hop liquidity pool does not have enough depth for this trade size.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#HOP_INSUFFICIENT_LIQUIDITY`,
  },
  [ALL_ERROR_CODES.HOP_INVALID_CHAIN]: {
    code: ALL_ERROR_CODES.HOP_INVALID_CHAIN,
    title: 'Hop chain ID invalid',
    description: 'The chain ID is not recognised by the Hop adapter.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#HOP_INVALID_CHAIN`,
  },
  [ALL_ERROR_CODES.HOP_CHAIN_NOT_SUPPORTED]: {
    code: ALL_ERROR_CODES.HOP_CHAIN_NOT_SUPPORTED,
    title: 'Chain not supported by Hop',
    description: 'The requested chain is not in the Hop Protocol supported network list.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#HOP_CHAIN_NOT_SUPPORTED`,
  },
  [ALL_ERROR_CODES.HOP_INVALID_TOKEN]: {
    code: ALL_ERROR_CODES.HOP_INVALID_TOKEN,
    title: 'Token invalid for Hop',
    description: 'The token is not bridgeable via Hop Protocol.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#HOP_INVALID_TOKEN`,
  },

  // ── Validation ────────────────────────────────────────────────────────────
  [ALL_ERROR_CODES.INVALID_REQUEST_BODY]: {
    code: ALL_ERROR_CODES.INVALID_REQUEST_BODY,
    title: 'Request body is invalid',
    description: 'The request body failed schema validation. Inspect `details.errors` for field-level messages.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#INVALID_REQUEST_BODY`,
  },
  [ALL_ERROR_CODES.INVALID_QUERY_PARAMS]: {
    code: ALL_ERROR_CODES.INVALID_QUERY_PARAMS,
    title: 'Query parameters invalid',
    description: 'One or more query parameters are invalid.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#INVALID_QUERY_PARAMS`,
  },
  [ALL_ERROR_CODES.INVALID_ROUTE_PARAMS]: {
    code: ALL_ERROR_CODES.INVALID_ROUTE_PARAMS,
    title: 'Route parameters invalid',
    description: 'One or more URL path parameters are malformed (e.g. invalid UUID).',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#INVALID_ROUTE_PARAMS`,
  },
  [ALL_ERROR_CODES.VALIDATION_SCHEMA_MISMATCH]: {
    code: ALL_ERROR_CODES.VALIDATION_SCHEMA_MISMATCH,
    title: 'Schema validation failed',
    description: 'The request does not conform to the expected schema.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#VALIDATION_SCHEMA_MISMATCH`,
  },
  [ALL_ERROR_CODES.MISSING_REQUIRED_HEADER]: {
    code: ALL_ERROR_CODES.MISSING_REQUIRED_HEADER,
    title: 'Required header missing',
    description: 'A required HTTP request header is absent. Check `details.header` for the header name.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#MISSING_REQUIRED_HEADER`,
  },
  [ALL_ERROR_CODES.INVALID_HEADER_VALUE]: {
    code: ALL_ERROR_CODES.INVALID_HEADER_VALUE,
    title: 'Header value is invalid',
    description: 'An HTTP request header has an invalid value.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#INVALID_HEADER_VALUE`,
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  [ALL_ERROR_CODES.UNAUTHORIZED]: {
    code: ALL_ERROR_CODES.UNAUTHORIZED,
    title: 'Authentication required',
    description: 'The request lacks valid authentication credentials.',
    httpStatus: HttpStatus.UNAUTHORIZED,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#UNAUTHORIZED`,
  },
  [ALL_ERROR_CODES.FORBIDDEN]: {
    code: ALL_ERROR_CODES.FORBIDDEN,
    title: 'Access forbidden',
    description: 'The authenticated principal does not have permission to perform this action.',
    httpStatus: HttpStatus.FORBIDDEN,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#FORBIDDEN`,
  },
  [ALL_ERROR_CODES.TOKEN_EXPIRED]: {
    code: ALL_ERROR_CODES.TOKEN_EXPIRED,
    title: 'Authentication token expired',
    description: 'The provided token has expired. Re-authenticate to obtain a fresh token.',
    httpStatus: HttpStatus.UNAUTHORIZED,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#TOKEN_EXPIRED`,
  },
  [ALL_ERROR_CODES.INSUFFICIENT_PERMISSIONS]: {
    code: ALL_ERROR_CODES.INSUFFICIENT_PERMISSIONS,
    title: 'Insufficient permissions',
    description: 'The credential is missing required scopes. See `details.missing` for which scopes are needed.',
    httpStatus: HttpStatus.FORBIDDEN,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#INSUFFICIENT_PERMISSIONS`,
  },
  [ALL_ERROR_CODES.SIGNATURE_MISSING]: {
    code: ALL_ERROR_CODES.SIGNATURE_MISSING,
    title: 'Request signature missing',
    description: 'The X-BridgeWise-Signature or X-BridgeWise-Timestamp header is absent.',
    httpStatus: HttpStatus.UNAUTHORIZED,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#SIGNATURE_MISSING`,
  },
  [ALL_ERROR_CODES.SIGNATURE_INVALID]: {
    code: ALL_ERROR_CODES.SIGNATURE_INVALID,
    title: 'Request signature invalid',
    description: 'The HMAC-SHA256 signature does not match the computed value. Ensure you sign the correct canonical string.',
    httpStatus: HttpStatus.UNAUTHORIZED,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#SIGNATURE_INVALID`,
  },
  [ALL_ERROR_CODES.SIGNATURE_TIMESTAMP_EXPIRED]: {
    code: ALL_ERROR_CODES.SIGNATURE_TIMESTAMP_EXPIRED,
    title: 'Signed request timestamp expired',
    description: 'The X-BridgeWise-Timestamp is more than 5 minutes in the past. Synchronise your system clock and retry.',
    httpStatus: HttpStatus.UNAUTHORIZED,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#SIGNATURE_TIMESTAMP_EXPIRED`,
  },
  [ALL_ERROR_CODES.SIGNATURE_TIMESTAMP_FUTURE]: {
    code: ALL_ERROR_CODES.SIGNATURE_TIMESTAMP_FUTURE,
    title: 'Signed request timestamp in future',
    description: 'The X-BridgeWise-Timestamp is more than 5 minutes in the future. Synchronise your system clock.',
    httpStatus: HttpStatus.UNAUTHORIZED,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#SIGNATURE_TIMESTAMP_FUTURE`,
  },

  // ── System ────────────────────────────────────────────────────────────────
  [ALL_ERROR_CODES.INTERNAL_SERVER_ERROR]: {
    code: ALL_ERROR_CODES.INTERNAL_SERVER_ERROR,
    title: 'Internal server error',
    description: 'An unexpected server error occurred. This has been logged; contact support with the requestId.',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    retryHint: 'backoff',
    retryAfterSeconds: 5,
    docsUrl: `${BASE_DOCS}#INTERNAL_SERVER_ERROR`,
  },
  [ALL_ERROR_CODES.SERVICE_UNAVAILABLE]: {
    code: ALL_ERROR_CODES.SERVICE_UNAVAILABLE,
    title: 'Service temporarily unavailable',
    description: 'The service is temporarily unavailable. Retry with exponential back-off.',
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    retryHint: 'backoff',
    retryAfterSeconds: 30,
    docsUrl: `${BASE_DOCS}#SERVICE_UNAVAILABLE`,
  },
  [ALL_ERROR_CODES.DATABASE_ERROR]: {
    code: ALL_ERROR_CODES.DATABASE_ERROR,
    title: 'Database error',
    description: 'A database operation failed. This is a transient server-side issue; retry with back-off.',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    retryHint: 'backoff',
    retryAfterSeconds: 10,
    docsUrl: `${BASE_DOCS}#DATABASE_ERROR`,
  },
  [ALL_ERROR_CODES.EXTERNAL_SERVICE_ERROR]: {
    code: ALL_ERROR_CODES.EXTERNAL_SERVICE_ERROR,
    title: 'External service error',
    description: 'A downstream third-party service returned an error.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 10,
    docsUrl: `${BASE_DOCS}#EXTERNAL_SERVICE_ERROR`,
  },
  [ALL_ERROR_CODES.RATE_LIMIT_EXCEEDED]: {
    code: ALL_ERROR_CODES.RATE_LIMIT_EXCEEDED,
    title: 'Rate limit exceeded',
    description: 'Too many requests. Slow down and retry after the Retry-After response header value.',
    httpStatus: HttpStatus.TOO_MANY_REQUESTS,
    retryHint: 'fixed',
    retryAfterSeconds: 60,
    docsUrl: `${BASE_DOCS}#RATE_LIMIT_EXCEEDED`,
  },
  [ALL_ERROR_CODES.REQUEST_TIMEOUT]: {
    code: ALL_ERROR_CODES.REQUEST_TIMEOUT,
    title: 'Request timed out',
    description: 'The request exceeded the maximum allowed duration.',
    httpStatus: HttpStatus.REQUEST_TIMEOUT,
    retryHint: 'backoff',
    retryAfterSeconds: 5,
    docsUrl: `${BASE_DOCS}#REQUEST_TIMEOUT`,
  },
  [ALL_ERROR_CODES.NOT_FOUND]: {
    code: ALL_ERROR_CODES.NOT_FOUND,
    title: 'Resource not found',
    description: 'The requested resource does not exist.',
    httpStatus: HttpStatus.NOT_FOUND,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#NOT_FOUND`,
  },
  [ALL_ERROR_CODES.CONFLICT]: {
    code: ALL_ERROR_CODES.CONFLICT,
    title: 'Resource conflict',
    description: 'The operation conflicts with the current state of the resource.',
    httpStatus: HttpStatus.CONFLICT,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#CONFLICT`,
  },

  // ── Quotes ────────────────────────────────────────────────────────────────
  [ALL_ERROR_CODES.QUOTE_NOT_FOUND]: {
    code: ALL_ERROR_CODES.QUOTE_NOT_FOUND,
    title: 'Quote not found',
    description: 'The specified quote ID does not exist.',
    httpStatus: HttpStatus.NOT_FOUND,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#QUOTE_NOT_FOUND`,
  },
  [ALL_ERROR_CODES.QUOTE_EXPIRED]: {
    code: ALL_ERROR_CODES.QUOTE_EXPIRED,
    title: 'Quote has expired',
    description: 'The quote has passed its validity window. Request a fresh quote.',
    httpStatus: HttpStatus.GONE,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#QUOTE_EXPIRED`,
  },
  [ALL_ERROR_CODES.QUOTE_STALE]: {
    code: ALL_ERROR_CODES.QUOTE_STALE,
    title: 'Quote is stale',
    description: 'Market conditions have changed enough to invalidate this quote. Refresh before executing.',
    httpStatus: HttpStatus.CONFLICT,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#QUOTE_STALE`,
  },
  [ALL_ERROR_CODES.QUOTE_PROVIDER_UNAVAILABLE]: {
    code: ALL_ERROR_CODES.QUOTE_PROVIDER_UNAVAILABLE,
    title: 'Quote provider unavailable',
    description: 'The pricing provider is temporarily unavailable. Retry later.',
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    retryHint: 'backoff',
    retryAfterSeconds: 10,
    docsUrl: `${BASE_DOCS}#QUOTE_PROVIDER_UNAVAILABLE`,
  },
  [ALL_ERROR_CODES.QUOTE_SLIPPAGE_EXCEEDED]: {
    code: ALL_ERROR_CODES.QUOTE_SLIPPAGE_EXCEEDED,
    title: 'Slippage tolerance exceeded',
    description: 'The execution price deviated more than the allowed slippage from the quoted price.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#QUOTE_SLIPPAGE_EXCEEDED`,
  },
  [ALL_ERROR_CODES.QUOTE_AMOUNT_TOO_LOW]: {
    code: ALL_ERROR_CODES.QUOTE_AMOUNT_TOO_LOW,
    title: 'Amount below minimum',
    description: 'The requested amount is below the minimum trade size for this route.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#QUOTE_AMOUNT_TOO_LOW`,
  },
  [ALL_ERROR_CODES.QUOTE_AMOUNT_TOO_HIGH]: {
    code: ALL_ERROR_CODES.QUOTE_AMOUNT_TOO_HIGH,
    title: 'Amount exceeds maximum',
    description: 'The requested amount exceeds the maximum trade size for this route.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#QUOTE_AMOUNT_TOO_HIGH`,
  },

  // ── Transactions ──────────────────────────────────────────────────────────
  [ALL_ERROR_CODES.TRANSACTION_NOT_FOUND]: {
    code: ALL_ERROR_CODES.TRANSACTION_NOT_FOUND,
    title: 'Transaction not found',
    description: 'No transaction exists with the given ID.',
    httpStatus: HttpStatus.NOT_FOUND,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#TRANSACTION_NOT_FOUND`,
  },
  [ALL_ERROR_CODES.TRANSACTION_ALREADY_SUBMITTED]: {
    code: ALL_ERROR_CODES.TRANSACTION_ALREADY_SUBMITTED,
    title: 'Transaction already submitted',
    description: 'This transaction has already been submitted. Check its status before retrying.',
    httpStatus: HttpStatus.CONFLICT,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#TRANSACTION_ALREADY_SUBMITTED`,
  },
  [ALL_ERROR_CODES.TRANSACTION_FAILED]: {
    code: ALL_ERROR_CODES.TRANSACTION_FAILED,
    title: 'Transaction failed',
    description: 'The transaction was submitted but failed on-chain.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#TRANSACTION_FAILED`,
  },
  [ALL_ERROR_CODES.TRANSACTION_REVERTED]: {
    code: ALL_ERROR_CODES.TRANSACTION_REVERTED,
    title: 'Transaction reverted',
    description: 'The smart contract call reverted. Check `details.revertReason`.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#TRANSACTION_REVERTED`,
  },
  [ALL_ERROR_CODES.TRANSACTION_DROPPED]: {
    code: ALL_ERROR_CODES.TRANSACTION_DROPPED,
    title: 'Transaction dropped from mempool',
    description: 'The transaction was dropped from the mempool. Resubmit with a higher fee.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#TRANSACTION_DROPPED`,
  },
  [ALL_ERROR_CODES.TRANSACTION_INSUFFICIENT_FUNDS]: {
    code: ALL_ERROR_CODES.TRANSACTION_INSUFFICIENT_FUNDS,
    title: 'Insufficient funds for transaction',
    description: 'The wallet does not hold enough balance to cover the amount and network fees.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#TRANSACTION_INSUFFICIENT_FUNDS`,
  },
  [ALL_ERROR_CODES.TRANSACTION_GAS_TOO_LOW]: {
    code: ALL_ERROR_CODES.TRANSACTION_GAS_TOO_LOW,
    title: 'Gas limit too low',
    description: 'The gas limit is below the estimated gas required for this transaction.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#TRANSACTION_GAS_TOO_LOW`,
  },

  // ── Webhooks ──────────────────────────────────────────────────────────────
  [ALL_ERROR_CODES.WEBHOOK_NOT_FOUND]: {
    code: ALL_ERROR_CODES.WEBHOOK_NOT_FOUND,
    title: 'Webhook not found',
    description: 'No webhook exists with the specified ID.',
    httpStatus: HttpStatus.NOT_FOUND,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#WEBHOOK_NOT_FOUND`,
  },
  [ALL_ERROR_CODES.WEBHOOK_ALREADY_EXISTS]: {
    code: ALL_ERROR_CODES.WEBHOOK_ALREADY_EXISTS,
    title: 'Webhook already exists',
    description: 'A webhook with this URL is already registered.',
    httpStatus: HttpStatus.CONFLICT,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#WEBHOOK_ALREADY_EXISTS`,
  },
  [ALL_ERROR_CODES.WEBHOOK_URL_INVALID]: {
    code: ALL_ERROR_CODES.WEBHOOK_URL_INVALID,
    title: 'Webhook URL invalid',
    description: 'The provided URL is not a valid absolute URL.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#WEBHOOK_URL_INVALID`,
  },
  [ALL_ERROR_CODES.WEBHOOK_URL_NOT_HTTPS]: {
    code: ALL_ERROR_CODES.WEBHOOK_URL_NOT_HTTPS,
    title: 'Webhook URL must use HTTPS',
    description: 'Only HTTPS webhook URLs are accepted for security reasons.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#WEBHOOK_URL_NOT_HTTPS`,
  },
  [ALL_ERROR_CODES.WEBHOOK_SECRET_TOO_SHORT]: {
    code: ALL_ERROR_CODES.WEBHOOK_SECRET_TOO_SHORT,
    title: 'Webhook secret too short',
    description: 'The webhook signing secret must be at least 16 characters.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#WEBHOOK_SECRET_TOO_SHORT`,
  },
  [ALL_ERROR_CODES.WEBHOOK_DELIVERY_NOT_FOUND]: {
    code: ALL_ERROR_CODES.WEBHOOK_DELIVERY_NOT_FOUND,
    title: 'Webhook delivery not found',
    description: 'No delivery record exists with the specified ID.',
    httpStatus: HttpStatus.NOT_FOUND,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#WEBHOOK_DELIVERY_NOT_FOUND`,
  },
  [ALL_ERROR_CODES.WEBHOOK_DELIVERY_FAILED]: {
    code: ALL_ERROR_CODES.WEBHOOK_DELIVERY_FAILED,
    title: 'Webhook delivery failed',
    description: 'The webhook endpoint returned a non-2xx response or timed out.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 5,
    docsUrl: `${BASE_DOCS}#WEBHOOK_DELIVERY_FAILED`,
  },
  [ALL_ERROR_CODES.WEBHOOK_DELIVERY_EXHAUSTED]: {
    code: ALL_ERROR_CODES.WEBHOOK_DELIVERY_EXHAUSTED,
    title: 'Webhook delivery exhausted',
    description: 'All retry attempts for this delivery have been exhausted.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#WEBHOOK_DELIVERY_EXHAUSTED`,
  },
  [ALL_ERROR_CODES.WEBHOOK_EVENT_UNSUPPORTED]: {
    code: ALL_ERROR_CODES.WEBHOOK_EVENT_UNSUPPORTED,
    title: 'Webhook event type unsupported',
    description: 'The specified event type is not in the list of supported webhook events.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#WEBHOOK_EVENT_UNSUPPORTED`,
  },
  [ALL_ERROR_CODES.WEBHOOK_ENDPOINT_UNVERIFIED]: {
    code: ALL_ERROR_CODES.WEBHOOK_ENDPOINT_UNVERIFIED,
    title: 'Webhook endpoint not verified',
    description: 'Deliveries are blocked until the endpoint ownership challenge is completed.',
    httpStatus: HttpStatus.FORBIDDEN,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#WEBHOOK_ENDPOINT_UNVERIFIED`,
  },
  [ALL_ERROR_CODES.WEBHOOK_CHALLENGE_EXPIRED]: {
    code: ALL_ERROR_CODES.WEBHOOK_CHALLENGE_EXPIRED,
    title: 'Webhook challenge expired',
    description: 'The ownership challenge expired. Re-register the endpoint to receive a new challenge.',
    httpStatus: HttpStatus.GONE,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#WEBHOOK_CHALLENGE_EXPIRED`,
  },
  [ALL_ERROR_CODES.WEBHOOK_SIGNATURE_INVALID]: {
    code: ALL_ERROR_CODES.WEBHOOK_SIGNATURE_INVALID,
    title: 'Webhook signature invalid',
    description: 'The HMAC-SHA256 signature on the incoming webhook payload is invalid.',
    httpStatus: HttpStatus.UNAUTHORIZED,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#WEBHOOK_SIGNATURE_INVALID`,
  },

  // ── Wallet ────────────────────────────────────────────────────────────────
  [ALL_ERROR_CODES.WALLET_NOT_FOUND]: {
    code: ALL_ERROR_CODES.WALLET_NOT_FOUND,
    title: 'Wallet not found',
    description: 'No wallet session exists for the given identifier.',
    httpStatus: HttpStatus.NOT_FOUND,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#WALLET_NOT_FOUND`,
  },
  [ALL_ERROR_CODES.WALLET_SESSION_EXPIRED]: {
    code: ALL_ERROR_CODES.WALLET_SESSION_EXPIRED,
    title: 'Wallet session expired',
    description: 'The wallet connection session has expired. Reconnect.',
    httpStatus: HttpStatus.UNAUTHORIZED,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#WALLET_SESSION_EXPIRED`,
  },
  [ALL_ERROR_CODES.WALLET_CONNECT_FAILED]: {
    code: ALL_ERROR_CODES.WALLET_CONNECT_FAILED,
    title: 'Wallet connection failed',
    description: 'Failed to establish a wallet connection.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'backoff',
    retryAfterSeconds: 5,
    docsUrl: `${BASE_DOCS}#WALLET_CONNECT_FAILED`,
  },
  [ALL_ERROR_CODES.WALLET_SIGNING_FAILED]: {
    code: ALL_ERROR_CODES.WALLET_SIGNING_FAILED,
    title: 'Wallet signing failed',
    description: 'The wallet rejected or failed the signing request.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#WALLET_SIGNING_FAILED`,
  },
  [ALL_ERROR_CODES.WALLET_UNSUPPORTED_NETWORK]: {
    code: ALL_ERROR_CODES.WALLET_UNSUPPORTED_NETWORK,
    title: 'Wallet network not supported',
    description: 'The connected wallet is on an unsupported network. Switch networks.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#WALLET_UNSUPPORTED_NETWORK`,
  },

  // ── Token Metadata ────────────────────────────────────────────────────────
  [ALL_ERROR_CODES.TOKEN_METADATA_NOT_FOUND]: {
    code: ALL_ERROR_CODES.TOKEN_METADATA_NOT_FOUND,
    title: 'Token metadata not found',
    description: 'No metadata is available for the specified token.',
    httpStatus: HttpStatus.NOT_FOUND,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#TOKEN_METADATA_NOT_FOUND`,
  },
  [ALL_ERROR_CODES.TOKEN_METADATA_FETCH_FAILED]: {
    code: ALL_ERROR_CODES.TOKEN_METADATA_FETCH_FAILED,
    title: 'Token metadata fetch failed',
    description: 'Failed to retrieve token metadata from the upstream source. Retry later.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 10,
    docsUrl: `${BASE_DOCS}#TOKEN_METADATA_FETCH_FAILED`,
  },
  [ALL_ERROR_CODES.TOKEN_LIST_UNAVAILABLE]: {
    code: ALL_ERROR_CODES.TOKEN_LIST_UNAVAILABLE,
    title: 'Token list unavailable',
    description: 'The token list service is temporarily unavailable. Retry later.',
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    retryHint: 'backoff',
    retryAfterSeconds: 15,
    docsUrl: `${BASE_DOCS}#TOKEN_LIST_UNAVAILABLE`,
  },

  // ── Analytics ─────────────────────────────────────────────────────────────
  [ALL_ERROR_CODES.ANALYTICS_QUERY_FAILED]: {
    code: ALL_ERROR_CODES.ANALYTICS_QUERY_FAILED,
    title: 'Analytics query failed',
    description: 'The analytics query could not be executed.',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    retryHint: 'backoff',
    retryAfterSeconds: 5,
    docsUrl: `${BASE_DOCS}#ANALYTICS_QUERY_FAILED`,
  },
  [ALL_ERROR_CODES.ANALYTICS_EXPORT_FAILED]: {
    code: ALL_ERROR_CODES.ANALYTICS_EXPORT_FAILED,
    title: 'Analytics export failed',
    description: 'Failed to generate the analytics export.',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    retryHint: 'backoff',
    retryAfterSeconds: 10,
    docsUrl: `${BASE_DOCS}#ANALYTICS_EXPORT_FAILED`,
  },
  [ALL_ERROR_CODES.ANALYTICS_RANGE_INVALID]: {
    code: ALL_ERROR_CODES.ANALYTICS_RANGE_INVALID,
    title: 'Date range is invalid',
    description: 'The requested date range is invalid or exceeds the maximum allowed span.',
    httpStatus: HttpStatus.BAD_REQUEST,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#ANALYTICS_RANGE_INVALID`,
  },
  [ALL_ERROR_CODES.ANALYTICS_DATA_UNAVAILABLE]: {
    code: ALL_ERROR_CODES.ANALYTICS_DATA_UNAVAILABLE,
    title: 'Analytics data unavailable',
    description: 'No analytics data is available for the requested parameters.',
    httpStatus: HttpStatus.NOT_FOUND,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#ANALYTICS_DATA_UNAVAILABLE`,
  },

  // ── Relayer ───────────────────────────────────────────────────────────────
  [ALL_ERROR_CODES.RELAYER_UNAVAILABLE]: {
    code: ALL_ERROR_CODES.RELAYER_UNAVAILABLE,
    title: 'Relayer unavailable',
    description: 'The relayer service is temporarily unavailable. Retry with back-off.',
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    retryHint: 'backoff',
    retryAfterSeconds: 15,
    docsUrl: `${BASE_DOCS}#RELAYER_UNAVAILABLE`,
  },
  [ALL_ERROR_CODES.RELAYER_SUBMISSION_FAILED]: {
    code: ALL_ERROR_CODES.RELAYER_SUBMISSION_FAILED,
    title: 'Relayer submission failed',
    description: 'The relayer could not submit the transaction to the network.',
    httpStatus: HttpStatus.BAD_GATEWAY,
    retryHint: 'backoff',
    retryAfterSeconds: 10,
    docsUrl: `${BASE_DOCS}#RELAYER_SUBMISSION_FAILED`,
  },
  [ALL_ERROR_CODES.RELAYER_NONCE_MISMATCH]: {
    code: ALL_ERROR_CODES.RELAYER_NONCE_MISMATCH,
    title: 'Relayer nonce mismatch',
    description: 'The transaction nonce is incorrect. The relayer will resynchronise; retry shortly.',
    httpStatus: HttpStatus.CONFLICT,
    retryHint: 'fixed',
    retryAfterSeconds: 5,
    docsUrl: `${BASE_DOCS}#RELAYER_NONCE_MISMATCH`,
  },
  [ALL_ERROR_CODES.RELAYER_GAS_PRICE_SPIKE]: {
    code: ALL_ERROR_CODES.RELAYER_GAS_PRICE_SPIKE,
    title: 'Gas price spike detected',
    description: 'The current gas price exceeds the safe threshold. The relayer will wait for prices to normalise.',
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    retryHint: 'fixed',
    retryAfterSeconds: 30,
    docsUrl: `${BASE_DOCS}#RELAYER_GAS_PRICE_SPIKE`,
  },

  // ── Sandbox ───────────────────────────────────────────────────────────────
  [ALL_ERROR_CODES.SANDBOX_NOT_AVAILABLE]: {
    code: ALL_ERROR_CODES.SANDBOX_NOT_AVAILABLE,
    title: 'Sandbox not available',
    description: 'The sandbox environment is only available in non-production deployments.',
    httpStatus: HttpStatus.FORBIDDEN,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#SANDBOX_NOT_AVAILABLE`,
  },
  [ALL_ERROR_CODES.SANDBOX_SESSION_EXPIRED]: {
    code: ALL_ERROR_CODES.SANDBOX_SESSION_EXPIRED,
    title: 'Sandbox session expired',
    description: 'The sandbox session has expired. Start a new session.',
    httpStatus: HttpStatus.GONE,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#SANDBOX_SESSION_EXPIRED`,
  },
  [ALL_ERROR_CODES.SANDBOX_SIMULATION_FAILED]: {
    code: ALL_ERROR_CODES.SANDBOX_SIMULATION_FAILED,
    title: 'Sandbox simulation failed',
    description: 'The transaction simulation in the sandbox environment failed.',
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    retryHint: 'never',
    docsUrl: `${BASE_DOCS}#SANDBOX_SIMULATION_FAILED`,
  },
};

// ── Runtime lookup helpers ────────────────────────────────────────────────────

/**
 * Returns the catalogue entry for a given error code.
 * Falls back to a generic INTERNAL_SERVER_ERROR entry if the code is unknown.
 */
export function getCatalogueEntry(code: string): ErrorCatalogueEntry {
  const entry = (ERROR_CATALOGUE as Record<string, ErrorCatalogueEntry>)[code];
  if (!entry) {
    return ERROR_CATALOGUE[ALL_ERROR_CODES.INTERNAL_SERVER_ERROR];
  }
  return entry;
}

/**
 * Returns the recommended HTTP status for a given error code.
 */
export function getHttpStatus(code: string): HttpStatus {
  return getCatalogueEntry(code).httpStatus;
}

/**
 * Returns all catalogue entries as an array (useful for documentation endpoints).
 */
export function getAllCatalogueEntries(): ErrorCatalogueEntry[] {
  return Object.values(ERROR_CATALOGUE);
}
