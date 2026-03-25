/**
 * Transaction Context
 * Manages transaction state across the application
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
exports.useTransaction = exports.TransactionProvider = void 0;
const react_1 = __importStar(require("react"));
const storage_1 = require("../../transaction-history/storage");
const TransactionContext = (0, react_1.createContext)(undefined);
const STORAGE_KEY = 'bridgewise_tx_state';
const mapStatusToHistory = (status) => {
    if (status === 'pending')
        return 'pending';
    if (status === 'success')
        return 'confirmed';
    if (status === 'failed')
        return 'failed';
    return null;
};
const normalizeNumber = (value) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const normalizeBridgeTransaction = (payload) => {
    const now = new Date();
    return {
        txHash: payload.txHash ?? `unknown-${now.getTime()}`,
        bridgeName: payload.bridgeName ?? 'unknown',
        sourceChain: payload.sourceChain ?? 'unknown',
        destinationChain: payload.destinationChain ?? 'unknown',
        sourceToken: payload.sourceToken ?? 'unknown',
        destinationToken: payload.destinationToken ?? 'unknown',
        amount: normalizeNumber(payload.amount),
        fee: normalizeNumber(payload.fee),
        slippagePercent: normalizeNumber(payload.slippagePercent),
        status: payload.status === 'pending' || payload.status === 'confirmed' || payload.status === 'failed'
            ? payload.status
            : 'pending',
        timestamp: payload.timestamp ?? now,
        account: payload.account ?? 'unknown',
    };
};
const TransactionProvider = ({ children, historyConfig, onTransactionTracked, }) => {
    const [state, setState] = (0, react_1.useState)({
        id: '',
        status: 'idle',
        progress: 0,
        step: '',
        timestamp: 0,
    });
    const [historyStorage] = (0, react_1.useState)(() => new storage_1.TransactionHistoryStorage(historyConfig));
    // Load from storage on mount
    (0, react_1.useEffect)(() => {
        if (typeof window === 'undefined')
            return;
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Expiry check (24 hours)
                if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
                    setState(parsed);
                }
                else {
                    localStorage.removeItem(STORAGE_KEY);
                }
            }
        }
        catch (e) {
            console.error('Failed to load transaction state', e);
        }
    }, []);
    // Save to storage on change
    (0, react_1.useEffect)(() => {
        if (typeof window === 'undefined')
            return;
        if (state.status !== 'idle') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }
    }, [state]);
    (0, react_1.useEffect)(() => {
        const historyStatus = mapStatusToHistory(state.status);
        if (!historyStatus) {
            return;
        }
        const tracked = normalizeBridgeTransaction({
            txHash: state.txHash ?? (state.id ? `pending-${state.id}` : undefined),
            bridgeName: state.bridgeName,
            sourceChain: state.sourceChain,
            destinationChain: state.destinationChain,
            sourceToken: state.sourceToken,
            destinationToken: state.destinationToken,
            amount: state.amount,
            fee: state.fee,
            slippagePercent: state.slippagePercent,
            status: historyStatus,
            timestamp: state.timestamp ? new Date(state.timestamp) : new Date(),
            account: state.account,
        });
        void historyStorage.upsertTransaction(tracked);
        onTransactionTracked?.(tracked);
    }, [historyStorage, onTransactionTracked, state]);
    const updateState = (0, react_1.useCallback)((updates) => {
        setState((prev) => ({ ...prev, ...updates, timestamp: Date.now() }));
    }, []);
    const clearState = (0, react_1.useCallback)(() => {
        setState({
            id: '',
            status: 'idle',
            progress: 0,
            step: '',
            timestamp: 0,
        });
        if (typeof window !== 'undefined') {
            localStorage.removeItem(STORAGE_KEY);
        }
    }, []);
    const startTransaction = (0, react_1.useCallback)((id, initialState) => {
        setState({
            id,
            status: 'pending',
            progress: 0,
            step: 'Initializing...',
            timestamp: Date.now(),
            ...initialState,
        });
    }, []);
    const recordBridgeTransaction = (0, react_1.useCallback)(async (transaction) => {
        const normalized = normalizeBridgeTransaction(transaction);
        await historyStorage.upsertTransaction(normalized);
        onTransactionTracked?.(normalized);
    }, [historyStorage, onTransactionTracked]);
    return (<TransactionContext.Provider value={{ state, updateState, clearState, startTransaction, recordBridgeTransaction }}>
      {children}
    </TransactionContext.Provider>);
};
exports.TransactionProvider = TransactionProvider;
const useTransaction = () => {
    const context = (0, react_1.useContext)(TransactionContext);
    if (!context) {
        throw new Error('useTransaction must be used within a TransactionProvider');
    }
    return context;
};
exports.useTransaction = useTransaction;
//# sourceMappingURL=TransactionContext.js.map