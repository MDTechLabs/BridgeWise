import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiError, ErrorType } from '../types/api-response.interface';
import { ErrorCode } from '../constants/error-codes';

/**
 * Base custom exception for all application exceptions
 */
export class AppException extends HttpException {
  constructor(
    public apiError: ApiError,
    public httpStatus: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
  ) {
    super(apiError, httpStatus);
  }
}

/**
 * Exception for validation errors
 */
export class ValidationException extends AppException {
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    const apiError: ApiError = {
      code,
      message,
      type: ErrorType.VALIDATION,
      details,
    };
    super(apiError, HttpStatus.BAD_REQUEST);
  }
}

/**
 * Exception for Bridge-related errors
 */
export class BridgeException extends AppException {
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    const apiError: ApiError = {
      code,
      message,
      type: ErrorType.BRIDGE,
      details,
    };
    super(apiError, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Exception for Stellar adapter errors
 */
export class StellarAdapterException extends AppException {
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    const apiError: ApiError = {
      code,
      message,
      type: ErrorType.ADAPTER_STELLAR,
      details,
    };
    super(apiError, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Exception for LayerZero adapter errors
 */
export class LayerZeroAdapterException extends AppException {
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    const apiError: ApiError = {
      code,
      message,
      type: ErrorType.ADAPTER_LAYERZERO,
      details,
    };
    super(apiError, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Exception for Hop adapter errors
 */
export class HopAdapterException extends AppException {
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    const apiError: ApiError = {
      code,
      message,
      type: ErrorType.ADAPTER_HOP,
      details,
    };
    super(apiError, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Exception for authentication/authorization errors
 */
export class AuthException extends AppException {
  constructor(
    code: ErrorCode,
    message: string,
    httpStatus: HttpStatus = HttpStatus.UNAUTHORIZED,
    details?: Record<string, unknown>,
  ) {
    const apiError: ApiError = {
      code,
      message,
      type: ErrorType.AUTH,
      details,
    };
    super(apiError, httpStatus);
  }
}

/**
 * Exception for external service (third-party API) errors
 */
export class ExternalServiceException extends AppException {
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    const apiError: ApiError = {
      code,
      message,
      type: ErrorType.EXTERNAL,
      details,
    };
    super(apiError, HttpStatus.BAD_GATEWAY);
  }
}

/**
 * Exception for configuration errors
 */
export class ConfigException extends AppException {
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    const apiError: ApiError = {
      code,
      message,
      type: ErrorType.CONFIG,
      details,
    };
    super(apiError, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Helper function to map Nest's HttpException to AppException
 */
export function mapHttpExceptionToAppException(
  exception: HttpException,
  requestId: string,
): AppException {
  const status = exception.getStatus();
  const exceptionResponse = exception.getResponse();

  // Si es HttpException estándar de NestJS
  if (typeof exceptionResponse === 'object') {
    const { message, error } = exceptionResponse as any;

    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return new ValidationException(
          'INVALID_REQUEST_BODY',
          message || error || 'Invalid request',
          { originalError: error },
        );
      case HttpStatus.UNAUTHORIZED:
        return new AuthException(
          'UNAUTHORIZED',
          message || error || 'Unauthorized',
          HttpStatus.UNAUTHORIZED,
        );
      case HttpStatus.FORBIDDEN:
        return new AuthException(
          'FORBIDDEN',
          message || error || 'Forbidden',
          HttpStatus.FORBIDDEN,
        );
      case HttpStatus.NOT_FOUND:
        return new AppException(
          {
            code: 'NOT_FOUND',
            message: message || error || 'Resource not found',
            type: ErrorType.INTERNAL,
          },
          HttpStatus.NOT_FOUND,
        );
      case HttpStatus.CONFLICT:
        return new AppException(
          {
            code: 'CONFLICT',
            message: message || error || 'Conflict',
            type: ErrorType.INTERNAL,
          },
          HttpStatus.CONFLICT,
        );
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return new ValidationException(
          'VALIDATION_SCHEMA_MISMATCH',
          message || error || 'Validation failed',
        );
      case HttpStatus.TOO_MANY_REQUESTS:
        return new AppException(
          {
            code: 'RATE_LIMIT_EXCEEDED',
            message: message || error || 'Too many requests',
            type: ErrorType.INTERNAL,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      default:
        return new AppException(
          {
            code: 'INTERNAL_SERVER_ERROR',
            message: message || error || 'Internal server error',
            type: ErrorType.INTERNAL,
            details: { requestId },
          },
          status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
    }
  }

  return new AppException(
    {
      code: 'INTERNAL_SERVER_ERROR',
      message: String(exceptionResponse) || 'Internal server error',
      type: ErrorType.INTERNAL,
      details: { requestId },
    },
    status || HttpStatus.INTERNAL_SERVER_ERROR,
  );
}
