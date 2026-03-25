"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenPairErrorCode = void 0;
/**
 * Token pair validation error codes
 */
var TokenPairErrorCode;
(function (TokenPairErrorCode) {
    // Chain errors
    TokenPairErrorCode["UNSUPPORTED_SOURCE_CHAIN"] = "UNSUPPORTED_SOURCE_CHAIN";
    TokenPairErrorCode["UNSUPPORTED_DESTINATION_CHAIN"] = "UNSUPPORTED_DESTINATION_CHAIN";
    TokenPairErrorCode["UNSUPPORTED_CHAIN_PAIR"] = "UNSUPPORTED_CHAIN_PAIR";
    // Token errors
    TokenPairErrorCode["UNSUPPORTED_SOURCE_TOKEN"] = "UNSUPPORTED_SOURCE_TOKEN";
    TokenPairErrorCode["UNSUPPORTED_DESTINATION_TOKEN"] = "UNSUPPORTED_DESTINATION_TOKEN";
    TokenPairErrorCode["UNSUPPORTED_TOKEN_PAIR"] = "UNSUPPORTED_TOKEN_PAIR";
    TokenPairErrorCode["TOKEN_NOT_REGISTERED"] = "TOKEN_NOT_REGISTERED";
    // Amount errors
    TokenPairErrorCode["AMOUNT_BELOW_MINIMUM"] = "AMOUNT_BELOW_MINIMUM";
    TokenPairErrorCode["AMOUNT_ABOVE_MAXIMUM"] = "AMOUNT_ABOVE_MAXIMUM";
    TokenPairErrorCode["INSUFFICIENT_LIQUIDITY"] = "INSUFFICIENT_LIQUIDITY";
    // Bridge errors
    TokenPairErrorCode["BRIDGE_NOT_AVAILABLE"] = "BRIDGE_NOT_AVAILABLE";
    TokenPairErrorCode["BRIDGE_PAUSED"] = "BRIDGE_PAUSED";
    TokenPairErrorCode["ROUTE_NOT_SUPPORTED"] = "ROUTE_NOT_SUPPORTED";
    // Wrapped token errors
    TokenPairErrorCode["WRAPPED_TOKEN_MISMATCH"] = "WRAPPED_TOKEN_MISMATCH";
    TokenPairErrorCode["INVALID_WRAPPED_MAPPING"] = "INVALID_WRAPPED_MAPPING";
    // General errors
    TokenPairErrorCode["VALIDATION_FAILED"] = "VALIDATION_FAILED";
    TokenPairErrorCode["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(TokenPairErrorCode || (exports.TokenPairErrorCode = TokenPairErrorCode = {}));
//# sourceMappingURL=types.js.map