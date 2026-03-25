/**
 * BridgeStatus Headless Component
 * Provides transaction status logic without any styling
 * Uses render props pattern for maximum flexibility
 */
'use client';
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeStatusHeadless = void 0;
const react_1 = __importStar(require("react"));
const useBridgeExecution_1 = require("../../hooks/useBridgeExecution");
// Default explorer URL templates by chain
const DEFAULT_EXPLORER_TEMPLATES = {
    ethereum: 'https://etherscan.io/tx/{{txHash}}',
    polygon: 'https://polygonscan.com/tx/{{txHash}}',
    arbitrum: 'https://arbiscan.io/tx/{{txHash}}',
    optimism: 'https://optimistic.etherscan.io/tx/{{txHash}}',
    base: 'https://basescan.org/tx/{{txHash}}',
    stellar: 'https://stellar.expert/explorer/public/tx/{{txHash}}',
    solana: 'https://explorer.solana.com/tx/{{txHash}}',
};
// Get explorer URL
const getExplorerUrl = (txHash, chain, template) => {
    if (template) {
        return template.replace('{{txHash}}', txHash);
    }
    const defaultTemplate = DEFAULT_EXPLORER_TEMPLATES[chain.toLowerCase()];
    if (defaultTemplate) {
        return defaultTemplate.replace('{{txHash}}', txHash);
    }
    return null;
};
// Format time remaining
const formatTimeRemaining = (seconds) => {
    if (seconds <= 0)
        return 'Completing...';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
        return `${mins}m ${secs}s remaining`;
    }
    return `${secs}s remaining`;
};
/**
 * BridgeStatusHeadless Component
 * Headless component that provides transaction status logic via render props
 *
 * @example
 * ```tsx
 * <BridgeStatusHeadless
 *   txHash="0x123..."
 *   bridgeName="hop"
 *   sourceChain="ethereum"
 *   destinationChain="polygon"
 *   amount={1000}
 * >
 *   {({ state, isPending, isConfirmed, timeRemainingText }) => (
 *     <div className="my-custom-status">
 *       {isPending && <span>Processing... {state.progress}%</span>}
 *       {isConfirmed && <span>Complete!</span>}
 *       <p>{timeRemainingText}</p>
 *     </div>
 *   )}
 * </BridgeStatusHeadless>
 * ```
 */
const BridgeStatusHeadless = ({ children, txHash, bridgeName, sourceChain, destinationChain, amount, onStatusChange, onConfirmed, onFailed, onRetry, token, fee, slippagePercent, estimatedTimeSeconds, slippageWarningThreshold = 1.0, explorerUrlTemplate, }) => {
    // SSR hydration handling
    const [isHydrated, setIsHydrated] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        setIsHydrated(true);
    }, []);
    // Use the bridge execution hook
    const { status, progress, step, error, estimatedTimeRemaining, confirmations, requiredConfirmations, isPending, isConfirmed, isFailed, retry, start, } = (0, useBridgeExecution_1.useBridgeExecution)({
        estimatedTimeSeconds,
        onStatusChange,
        onConfirmed,
        onFailed,
        autoStart: false,
    });
    // Start monitoring when component mounts
    (0, react_1.useEffect)(() => {
        if (isHydrated) {
            start(txHash, bridgeName, sourceChain, destinationChain, amount, token, fee, slippagePercent);
        }
    }, [txHash, bridgeName, sourceChain, destinationChain, amount, token, fee, slippagePercent, isHydrated, start]);
    // Handle retry
    const handleRetry = (0, react_1.useCallback)(() => {
        if (onRetry) {
            onRetry();
        }
        else {
            retry();
        }
    }, [onRetry, retry]);
    // Handle dismiss error
    const dismissError = (0, react_1.useCallback)(() => {
        // Error is cleared by the hook when status changes
    }, []);
    // Check slippage warning
    const showSlippageWarning = slippagePercent !== undefined && slippagePercent > slippageWarningThreshold;
    // Get explorer URL
    const explorerUrl = getExplorerUrl(txHash, sourceChain, explorerUrlTemplate);
    // Build state object
    const state = {
        status,
        progress,
        step,
        error,
        estimatedTimeRemaining,
        confirmations,
        requiredConfirmations,
        showSlippageWarning,
        isHydrated,
    };
    // Build props object for render
    const renderProps = {
        state,
        props: {
            txHash,
            bridgeName,
            sourceChain,
            destinationChain,
            amount,
            token,
            fee,
            slippagePercent,
            onStatusChange,
            onConfirmed,
            onFailed,
            onRetry,
            slippageWarningThreshold,
            explorerUrlTemplate,
        },
        isPending,
        isConfirmed,
        isFailed,
        timeRemainingText: formatTimeRemaining(estimatedTimeRemaining),
        explorerUrl,
        retry: handleRetry,
        dismissError,
    };
    return <>{children(renderProps)}</>;
};
exports.BridgeStatusHeadless = BridgeStatusHeadless;
exports.default = exports.BridgeStatusHeadless;
//# sourceMappingURL=BridgeStatus.headless.js.map