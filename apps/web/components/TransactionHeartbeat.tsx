
import React from 'react';
import { useTransactionPersistence } from './ui-lib/hooks/useTransactionPersistence';

export const TransactionHeartbeat = () => {
    const { state, clearState } = useTransactionPersistence();

    if (state.status === 'idle') {
        return null;
    }

    const isSuccess = state.status === 'success';
    const isFailed = state.status === 'failed';

    return (
        <div className="fixed bottom-4 right-4 z-50 w-80 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden font-sans transition-all duration-300 ease-in-out transform translate-y-0">
            <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {isSuccess ? 'Transaction Complete' : isFailed ? 'Transaction Failed' : 'Bridging Assets...'}
                    </h3>
                    <button
                        onClick={clearState}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        aria-label="Close"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div className="flex items-center gap-3 mb-3">
                    <div className="relative flex-1">
                        <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all duration-500 ease-out ${isSuccess ? 'bg-green-500' : isFailed ? 'bg-red-500' : 'bg-blue-600'
                                    }`}
                                style={{ width: `${state.progress}%` }}
                            />
                        </div>
                    </div>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-8 text-right">
                        {state.progress}%
                    </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {state.step}
                </p>

                {state.txHash && (
                    <div className="mt-2 text-xs">
                        <a href={`#`} className="text-blue-500 hover:underline">View on explorer</a>
                    </div>
                )}
            </div>

            {/* status bar line at bottom */}
            <div className={`h-1 w-full ${isSuccess ? 'bg-green-500' : isFailed ? 'bg-red-500' : 'bg-blue-600 animate-pulse'
                }`} />
        </div>
    );
};
