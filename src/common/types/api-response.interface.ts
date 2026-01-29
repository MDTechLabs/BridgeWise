/**
 * Unified API response envelope for all endpoints
 * Follows the schema {success, data, error}
 */
export interface ApiResponse<T = unknown> {
  /**
   * Indica si la operación fue exitosa
   */
  success: boolean;

  /**
   * Response data on success
   */
  data?: T;

  /**
   * Error information on failure
   */
  error?: ApiError;

  /**
   * Response timestamp (ISO 8601)
   */
  timestamp: string;

  /**
   * Unique request id for traceability
   */
  requestId: string;
}

/**
 * Error structure in the response
 */
export interface ApiError {
  code: string;

  message: string;

  details?: Record<string, unknown>;

  type: ErrorType;
}

export enum ErrorType {
  // Bridge errors
  BRIDGE = 'BRIDGE',

  // Adapter errors
  ADAPTER_STELLAR = 'ADAPTER_STELLAR',
  ADAPTER_LAYERZERO = 'ADAPTER_LAYERZERO',
  ADAPTER_HOP = 'ADAPTER_HOP',

  // Validation errors
  VALIDATION = 'VALIDATION',

  // Internal errors
  INTERNAL = 'INTERNAL',

  // Configuration errors
  CONFIG = 'CONFIG',

  // External errors (third-party APIs)
  EXTERNAL = 'EXTERNAL',

  // Authentication/authorization errors
  AUTH = 'AUTH',
}
