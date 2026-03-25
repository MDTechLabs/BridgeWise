"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const api_response_interface_1 = require("../types/api-response.interface");
require("../types/express-extend"); // Extend Express request types
const app_exception_1 = require("../exceptions/app.exception");
const uuid_1 = require("uuid");
/**
 * Global exception filter that catches ALL exceptions and formats responses
 * to the standardized ApiResponse envelope {success, error, timestamp, requestId}
 */
let GlobalExceptionFilter = (() => {
    let _classDecorators = [(0, common_1.Catch)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var GlobalExceptionFilter = _classThis = class {
        constructor() {
            this.logger = new common_1.Logger(GlobalExceptionFilter.name);
        }
        catch(exception, host) {
            const ctx = host.switchToHttp();
            const response = ctx.getResponse();
            const request = ctx.getRequest();
            // Get requestId from request or generate a fallback
            const requestId = request.id || this.generateRequestId();
            const timestamp = new Date().toISOString();
            let httpStatus = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
            let apiError = {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Internal server error',
                type: api_response_interface_1.ErrorType.INTERNAL,
                details: { requestId },
            };
            if (exception instanceof app_exception_1.AppException) {
                httpStatus = exception.httpStatus;
                apiError = exception.apiError;
            }
            else if (exception instanceof common_1.HttpException) {
                const mappedException = (0, app_exception_1.mapHttpExceptionToAppException)(exception, requestId);
                httpStatus = mappedException.httpStatus;
                apiError = mappedException.apiError;
            }
            else if (exception instanceof Error) {
                httpStatus = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
                apiError = {
                    code: 'INTERNAL_SERVER_ERROR',
                    message: exception.message || 'An unexpected error occurred',
                    type: api_response_interface_1.ErrorType.INTERNAL,
                    details: {
                        requestId,
                        errorName: exception.name,
                        stack: process.env.NODE_ENV === 'development'
                            ? exception.stack
                            : undefined,
                    },
                };
            }
            else {
                httpStatus = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
                apiError = {
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'An unexpected error occurred',
                    type: api_response_interface_1.ErrorType.INTERNAL,
                    details: {
                        requestId,
                        error: exception instanceof Error
                            ? exception.message
                            : JSON.stringify(exception),
                    },
                };
            }
            this.logError(request, httpStatus, apiError, exception);
            const errorResponse = {
                success: false,
                error: apiError,
                timestamp,
                requestId,
            };
            response.status(httpStatus).json(errorResponse);
        }
        generateRequestId() {
            return (0, uuid_1.v4)();
        }
        logError(request, httpStatus, apiError, exception) {
            const logData = {
                timestamp: new Date().toISOString(),
                method: request.method,
                path: request.path,
                statusCode: httpStatus,
                errorCode: apiError.code,
                errorMessage: apiError.message,
                errorType: apiError.type,
                requestId: apiError.details?.requestId,
            };
            if (httpStatus >= 500) {
                this.logger.error(`Request failed: ${request.method} ${request.path}`, exception instanceof Error
                    ? exception.stack
                    : JSON.stringify(exception), { meta: logData });
            }
            else {
                this.logger.warn(`Request error: ${request.method} ${request.path}`, JSON.stringify(logData));
            }
        }
    };
    __setFunctionName(_classThis, "GlobalExceptionFilter");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        GlobalExceptionFilter = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return GlobalExceptionFilter = _classThis;
})();
exports.GlobalExceptionFilter = GlobalExceptionFilter;
//# sourceMappingURL=global-exception.filter.js.map