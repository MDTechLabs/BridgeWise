/**
 * TransactionHeartbeat Headless Component
 * Provides transaction state and logic without any styling
 * Uses render props pattern for maximum flexibility
 */
'use client';
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionHeartbeatHeadless = void 0;
const react_1 = __importDefault(require("react"));
const TransactionContext_1 = require("./TransactionContext");
/**
 * Headless transaction heartbeat component
 *
 * @example
 * ```tsx
 * <TransactionHeartbeatHeadless>
 *   {({ state, clearState, isSuccess, isPending }) => (
 *     <div className="my-custom-notification">
 *       <h2>{isSuccess ? '✅ Done!' : isPending ? '⏳ Processing...' : '❌ Failed'}</h2>
 *       <progress value={state.progress} max={100} />
 *       <p>{state.step}</p>
 *       <button onClick={clearState}>Dismiss</button>
 *     </div>
 *   )}
 * </TransactionHeartbeatHeadless>
 * ```
 */
const TransactionHeartbeatHeadless = ({ children, }) => {
    const { state, clearState, updateState, startTransaction, recordBridgeTransaction } = (0, TransactionContext_1.useTransaction)();
    // Don't render if transaction is idle
    if (state.status === 'idle') {
        return null;
    }
    // Derive convenience booleans from state
    const isSuccess = state.status === 'success';
    const isFailed = state.status === 'failed';
    const isPending = state.status === 'pending';
    return (<>
      {children({
            state,
            clearState,
            updateState,
            startTransaction,
            recordBridgeTransaction,
            isSuccess,
            isFailed,
            isPending,
        })}
    </>);
};
exports.TransactionHeartbeatHeadless = TransactionHeartbeatHeadless;
//# sourceMappingURL=TransactionHeartbeat.headless.js.map