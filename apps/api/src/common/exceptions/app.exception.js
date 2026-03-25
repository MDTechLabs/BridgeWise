"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigException = exports.ExternalServiceException = exports.AuthException = exports.HopAdapterException = exports.LayerZeroAdapterException = exports.StellarAdapterException = exports.BridgeException = exports.ValidationException = exports.AppException = void 0;
exports.mapHttpExceptionToAppException = mapHttpExceptionToAppException;
const common_1 = require("@nestjs/common");
const api_response_interface_1 = require("../types/api-response.interface");
/**
 * Base custom exception for all application exceptions
 */
class AppException extends common_1.HttpException {
    constructor(apiError, httpStatus = common_1.HttpStatus.INTERNAL_SERVER_ERROR) {
        super(apiError, httpStatus);
        this.apiError = apiError;
        this.httpStatus = httpStatus;
    }
}
exports.AppException = AppException;
/**
 * Exception for validation errors
 */
class ValidationException extends AppException {
    constructor(code, message, details) {
        const apiError = {
            code,
            message,
            type: api_response_interface_1.ErrorType.VALIDATION,
            details,
        };
        super(apiError, common_1.HttpStatus.BAD_REQUEST);
    }
}
exports.ValidationException = ValidationException;
/**
 * Exception for Bridge-related errors
 */
class BridgeException extends AppException {
    constructor(code, message, details) {
        const apiError = {
            code,
            message,
            type: api_response_interface_1.ErrorType.BRIDGE,
            details,
        };
        super(apiError, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
exports.BridgeException = BridgeException;
/**
 * Exception for Stellar adapter errors
 */
class StellarAdapterException extends AppException {
    constructor(code, message, details) {
        const apiError = {
            code,
            message,
            type: api_response_interface_1.ErrorType.ADAPTER_STELLAR,
            details,
        };
        super(apiError, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
exports.StellarAdapterException = StellarAdapterException;
/**
 * Exception for LayerZero adapter errors
 */
class LayerZeroAdapterException extends AppException {
    constructor(code, message, details) {
        const apiError = {
            code,
            message,
            type: api_response_interface_1.ErrorType.ADAPTER_LAYERZERO,
            details,
        };
        super(apiError, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
exports.LayerZeroAdapterException = LayerZeroAdapterException;
/**
 * Exception for Hop adapter errors
 */
class HopAdapterException extends AppException {
    constructor(code, message, details) {
        const apiError = {
            code,
            message,
            type: api_response_interface_1.ErrorType.ADAPTER_HOP,
            details,
        };
        super(apiError, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
exports.HopAdapterException = HopAdapterException;
/**
 * Exception for authentication/authorization errors
 */
class AuthException extends AppException {
    constructor(code, message, httpStatus = common_1.HttpStatus.UNAUTHORIZED, details) {
        const apiError = {
            code,
            message,
            type: api_response_interface_1.ErrorType.AUTH,
            details,
        };
        super(apiError, httpStatus);
    }
}
exports.AuthException = AuthException;
/**
 * Exception for external service (third-party API) errors
 */
class ExternalServiceException extends AppException {
    constructor(code, message, details) {
        const apiError = {
            code,
            message,
            type: api_response_interface_1.ErrorType.EXTERNAL,
            details,
        };
        super(apiError, common_1.HttpStatus.BAD_GATEWAY);
    }
}
exports.ExternalServiceException = ExternalServiceException;
/**
 * Exception for configuration errors
 */
class ConfigException extends AppException {
    constructor(code, message, details) {
        const apiError = {
            code,
            message,
            type: api_response_interface_1.ErrorType.CONFIG,
            details,
        };
        super(apiError, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
exports.ConfigException = ConfigException;
/**
 * Helper function to map Nest's HttpException to AppException
 */
function mapHttpExceptionToAppException(exception, requestId) {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    // Si es HttpException estándar de NestJS
    if (typeof exceptionResponse === 'object') {
        const { message, error } = exceptionResponse;
        switch (status) {
            case common_1.HttpStatus.BAD_REQUEST:
                return new ValidationException('INVALID_REQUEST_BODY', message || error || 'Invalid request', { originalError: error });
            case common_1.HttpStatus.UNAUTHORIZED:
                return new AuthException('UNAUTHORIZED', message || error || 'Unauthorized', common_1.HttpStatus.UNAUTHORIZED);
            case common_1.HttpStatus.FORBIDDEN:
                return new AuthException('FORBIDDEN', message || error || 'Forbidden', common_1.HttpStatus.FORBIDDEN);
            case common_1.HttpStatus.NOT_FOUND:
                return new AppException({
                    code: 'NOT_FOUND',
                    message: message || error || 'Resource not found',
                    type: api_response_interface_1.ErrorType.INTERNAL,
                }, common_1.HttpStatus.NOT_FOUND);
            case common_1.HttpStatus.CONFLICT:
                return new AppException({
                    code: 'CONFLICT',
                    message: message || error || 'Conflict',
                    type: api_response_interface_1.ErrorType.INTERNAL,
                }, common_1.HttpStatus.CONFLICT);
            case common_1.HttpStatus.UNPROCESSABLE_ENTITY:
                return new ValidationException('VALIDATION_SCHEMA_MISMATCH', message || error || 'Validation failed');
            case common_1.HttpStatus.TOO_MANY_REQUESTS:
                return new AppException({
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: message || error || 'Too many requests',
                    type: api_response_interface_1.ErrorType.INTERNAL,
                }, common_1.HttpStatus.TOO_MANY_REQUESTS);
            default:
                return new AppException({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: message || error || 'Internal server error',
                    type: api_response_interface_1.ErrorType.INTERNAL,
                    details: { requestId },
                }, status || common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    return new AppException({
        code: 'INTERNAL_SERVER_ERROR',
        message: String(exceptionResponse) || 'Internal server error',
        type: api_response_interface_1.ErrorType.INTERNAL,
        details: { requestId },
    }, status || common_1.HttpStatus.INTERNAL_SERVER_ERROR);
}
//# sourceMappingURL=app.exception.js.map