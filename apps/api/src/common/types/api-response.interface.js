"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorType = void 0;
var ErrorType;
(function (ErrorType) {
    // Bridge errors
    ErrorType["BRIDGE"] = "BRIDGE";
    // Adapter errors
    ErrorType["ADAPTER_STELLAR"] = "ADAPTER_STELLAR";
    ErrorType["ADAPTER_LAYERZERO"] = "ADAPTER_LAYERZERO";
    ErrorType["ADAPTER_HOP"] = "ADAPTER_HOP";
    // Validation errors
    ErrorType["VALIDATION"] = "VALIDATION";
    // Internal errors
    ErrorType["INTERNAL"] = "INTERNAL";
    // Configuration errors
    ErrorType["CONFIG"] = "CONFIG";
    // External errors (third-party APIs)
    ErrorType["EXTERNAL"] = "EXTERNAL";
    // Authentication/authorization errors
    ErrorType["AUTH"] = "AUTH";
})(ErrorType || (exports.ErrorType = ErrorType = {}));
//# sourceMappingURL=api-response.interface.js.map