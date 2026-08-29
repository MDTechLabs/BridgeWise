/**
 * Stellar bridge provider adapter contract.
 *
 * A provider adapter hides each bridge provider's proprietary API behind one
 * predictable boundary. The routing layer should request quotes/routes,
 * execute the selected route, and poll execution status through this interface
 * instead of depending on provider-specific request or response shapes.
 */

import type { StellarBridgeQuote } from '../../../quotes/types/canonical-quote';
import type { BridgeRoute } from '../../../services/route-ranker';
import type { TransactionStatus } from '../../../tracking/stellar/soroban-transaction-status-tracker';

/** Routing-compatible route returned by Stellar provider adapters. */
export type StellarBridgeRoute = BridgeRoute;

/**
 * Standard quote/route request accepted by Stellar bridge providers.
 *
 * Fields mirror the transfer and route request shapes already used in the
 * routing layer: source/destination chains, source/destination assets, amount,
 * participant addresses, and optional slippage tolerance.
 */
export interface StellarBridgeQuoteRequest {
  sourceChain: string;
  destinationChain: string;
  sourceAsset: string;
  destinationAsset: string;
  amount: string;
  sender?: string;
  recipient?: string;
  slippage?: number;
}

/** Execution status vocabulary normalized for provider adapters. */
export type StellarBridgeExecutionStatus =
  | TransactionStatus
  | 'cancelled'
  | 'unknown';

/** Request to execute a route selected by the routing layer. */
export interface StellarBridgeExecutionRequest {
  route: StellarBridgeRoute;
  quote?: StellarBridgeQuote;
  /** Signed transaction envelope when execution is submit-only. */
  signedTransaction?: string;
  metadata?: Record<string, unknown>;
}

/** Result returned after a provider accepts or rejects execution. */
export interface StellarBridgeExecutionResult {
  providerId: string;
  routeId: string;
  executionId: string;
  status: StellarBridgeExecutionStatus;
  transactionHash?: string;
  submittedAt: number;
  error?: StellarBridgeProviderError;
  metadata?: Record<string, unknown>;
}

/** Request to check the current status of a submitted bridge execution. */
export interface StellarBridgeStatusRequest {
  executionId: string;
  transactionHash?: string;
}

/** Provider-normalized execution status result. */
export interface StellarBridgeStatusResult {
  providerId: string;
  executionId: string;
  status: StellarBridgeExecutionStatus;
  transactionHash?: string;
  updatedAt: number;
  error?: StellarBridgeProviderError;
  metadata?: Record<string, unknown>;
}

/** Adapter operation associated with a provider failure. */
export type StellarBridgeProviderOperation =
  | 'quote'
  | 'route'
  | 'execution'
  | 'status';

/** Standard provider error code vocabulary for routing-layer handling. */
export type StellarBridgeProviderErrorCode =
  | 'PROVIDER_UNAVAILABLE'
  | 'UNSUPPORTED_ROUTE'
  | 'INVALID_REQUEST'
  | 'QUOTE_FAILED'
  | 'ROUTE_FAILED'
  | 'EXECUTION_FAILED'
  | 'STATUS_FAILED'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

/**
 * Standard provider failure shape.
 *
 * Adapters should map proprietary provider errors into this contract so
 * routing can make consistent retry/fallback decisions without parsing
 * provider-specific error payloads.
 */
export interface StellarBridgeProviderError {
  providerId: string;
  operation: StellarBridgeProviderOperation;
  code: StellarBridgeProviderErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

/**
 * Interface all Stellar bridge provider adapters must satisfy.
 */
export interface StellarBridgeProviderAdapter {
  /** Stable provider identifier, matching registry provider ids. */
  readonly providerId: string;

  /** Request a normalized quote for a transfer. */
  getQuote(request: StellarBridgeQuoteRequest): Promise<StellarBridgeQuote>;

  /** Fetch routing-compatible candidate routes for a transfer. */
  getRoutes(request: StellarBridgeQuoteRequest): Promise<StellarBridgeRoute[]>;

  /** Execute or submit a route selected by the routing layer. */
  execute(
    request: StellarBridgeExecutionRequest,
  ): Promise<StellarBridgeExecutionResult>;

  /** Check the normalized status of a submitted execution. */
  getStatus(
    request: StellarBridgeStatusRequest,
  ): Promise<StellarBridgeStatusResult>;

  /** Normalize a proprietary provider failure into the standard error shape. */
  normalizeError(
    error: unknown,
    operation: StellarBridgeProviderOperation,
  ): StellarBridgeProviderError;
}

export type { StellarBridgeQuote } from '../../../quotes/types/canonical-quote';
