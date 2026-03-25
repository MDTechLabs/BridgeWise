"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorMapper = exports.STELLAR_ERROR_MAPPING = exports.BridgeErrorCode = void 0;
/**
 * Standard backend error codes for bridge operations
 * These codes are used consistently across all bridge adapters
 */
var BridgeErrorCode;
(function (BridgeErrorCode) {
    // Network errors
    BridgeErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    BridgeErrorCode["RPC_TIMEOUT"] = "RPC_TIMEOUT";
    BridgeErrorCode["RPC_CONNECTION_FAILED"] = "RPC_CONNECTION_FAILED";
    // Validation errors
    BridgeErrorCode["INVALID_CHAIN_PAIR"] = "INVALID_CHAIN_PAIR";
    BridgeErrorCode["INVALID_AMOUNT"] = "INVALID_AMOUNT";
    BridgeErrorCode["INVALID_ADDRESS"] = "INVALID_ADDRESS";
    BridgeErrorCode["INVALID_TOKEN"] = "INVALID_TOKEN";
    // Ledger/Account errors
    BridgeErrorCode["INSUFFICIENT_BALANCE"] = "INSUFFICIENT_BALANCE";
    BridgeErrorCode["ACCOUNT_NOT_FOUND"] = "ACCOUNT_NOT_FOUND";
    BridgeErrorCode["ACCOUNT_SEQUENCE_MISMATCH"] = "ACCOUNT_SEQUENCE_MISMATCH";
    // Transaction errors
    BridgeErrorCode["TRANSACTION_FAILED"] = "TRANSACTION_FAILED";
    BridgeErrorCode["TRANSACTION_REJECTED"] = "TRANSACTION_REJECTED";
    BridgeErrorCode["INSUFFICIENT_GAS"] = "INSUFFICIENT_GAS";
    BridgeErrorCode["DUST_AMOUNT"] = "DUST_AMOUNT";
    // Contract errors
    BridgeErrorCode["CONTRACT_ERROR"] = "CONTRACT_ERROR";
    BridgeErrorCode["CONTRACT_NOT_FOUND"] = "CONTRACT_NOT_FOUND";
    BridgeErrorCode["CONTRACT_INVOCATION_FAILED"] = "CONTRACT_INVOCATION_FAILED";
    // Rate limit and quota errors
    BridgeErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    BridgeErrorCode["QUOTA_EXCEEDED"] = "QUOTA_EXCEEDED";
    // Unknown errors
    BridgeErrorCode["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(BridgeErrorCode || (exports.BridgeErrorCode = BridgeErrorCode = {}));
/**
 * Maps Stellar RPC errors to standard backend error codes
 */
exports.STELLAR_ERROR_MAPPING = {
    errorPatterns: [
        // Network errors
        {
            pattern: /timeout/i,
            code: BridgeErrorCode.RPC_TIMEOUT,
            description: 'Stellar RPC request timed out',
        },
        {
            pattern: /ECONNREFUSED|ENOTFOUND|connection.*refused/i,
            code: BridgeErrorCode.RPC_CONNECTION_FAILED,
            description: 'Unable to connect to Stellar RPC endpoint',
        },
        // Account and sequence errors
        {
            pattern: /tx_bad_seq|SequenceTooHigh|SequenceTooLow/i,
            code: BridgeErrorCode.ACCOUNT_SEQUENCE_MISMATCH,
            description: 'Transaction sequence number does not match account state',
        },
        {
            pattern: /account.*not.*found|Account not found/i,
            code: BridgeErrorCode.ACCOUNT_NOT_FOUND,
            description: 'Account does not exist on Stellar network',
        },
        {
            pattern: /insufficient.*balance|Not enough|InsufficientBalance/i,
            code: BridgeErrorCode.INSUFFICIENT_BALANCE,
            description: 'Account has insufficient funds for transaction',
        },
        // Transaction errors
        {
            pattern: /tx_failed|TransactionFailed/i,
            code: BridgeErrorCode.TRANSACTION_FAILED,
            description: 'Transaction failed during execution',
        },
        {
            pattern: /tx_bad_auth|BadAuth|NotAuthorized/i,
            code: BridgeErrorCode.TRANSACTION_REJECTED,
            description: 'Transaction was rejected due to authorization failure',
        },
        {
            pattern: /MissingSignature|tx_missing_operation/i,
            code: BridgeErrorCode.TRANSACTION_REJECTED,
            description: 'Transaction is missing required signatures',
        },
        // Contract errors
        {
            pattern: /ContractNotFound|contract.*not.*found/i,
            code: BridgeErrorCode.CONTRACT_NOT_FOUND,
            description: 'Contract does not exist on network',
        },
        {
            pattern: /InvokeHostFunctionFailed|contract.*invocation.*failed/i,
            code: BridgeErrorCode.CONTRACT_INVOCATION_FAILED,
            description: 'Contract function invocation failed',
        },
        {
            pattern: /ExecutionError|UnknownError|InternalError/i,
            code: BridgeErrorCode.CONTRACT_ERROR,
            description: 'Contract execution resulted in an error',
        },
        // Validation errors
        {
            pattern: /invalid.*address|InvalidAddress/i,
            code: BridgeErrorCode.INVALID_ADDRESS,
            description: 'Provided address is invalid',
        },
        {
            pattern: /invalid.*amount|InvalidAmount|AmountTooSmall|DustAmount/i,
            code: BridgeErrorCode.DUST_AMOUNT,
            description: 'Amount is below minimum or invalid',
        },
        // Rate limiting
        {
            pattern: /rate.*limit|too.*many.*requests|429/i,
            code: BridgeErrorCode.RATE_LIMIT_EXCEEDED,
            description: 'Rate limit exceeded on RPC endpoint',
        },
    ],
};
/**
 * Error mapper utility for converting provider-specific errors to standard codes
 */
class ErrorMapper {
    constructor(config) {
        this.config = config;
    }
    /**
     * Map an error from a provider to a standard backend error code
     */
    mapError(error) {
        const errorMessage = this.extractErrorMessage(error);
        // Try to match against configured patterns
        for (const pattern of this.config.errorPatterns) {
            const regex = pattern.pattern instanceof RegExp
                ? pattern.pattern
                : new RegExp(pattern.pattern, 'i');
            if (regex.test(errorMessage)) {
                return {
                    code: pattern.code,
                    message: pattern.description,
                    details: {
                        originalMessage: errorMessage,
                    },
                    originalError: error,
                };
            }
        }
        // Default to unknown error
        return {
            code: BridgeErrorCode.UNKNOWN_ERROR,
            message: `An unknown error occurred: ${errorMessage}`,
            details: {
                originalMessage: errorMessage,
            },
            originalError: error,
        };
    }
    /**
     * Extract error message from various error types
     */
    extractErrorMessage(error) {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === 'string') {
            return error;
        }
        if (error && typeof error === 'object') {
            if ('message' in error && typeof error.message === 'string') {
                return error.message;
            }
            if ('response' in error && typeof error.response === 'object') {
                const response = error.response;
                if ('data' in response && typeof response.data === 'object') {
                    const data = response.data;
                    if ('message' in data && typeof data.message === 'string') {
                        return data.message;
                    }
                }
            }
        }
        return JSON.stringify(error);
    }
}
exports.ErrorMapper = ErrorMapper;
//# sourceMappingURL=error-codes.js.map