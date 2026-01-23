
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface TransactionState {
    id: string;
    status: 'idle' | 'pending' | 'success' | 'failed';
    progress: number;
    step: string;
    txHash?: string;
    timestamp: number;
}

interface TransactionContextType {
    state: TransactionState;
    updateState: (updates: Partial<TransactionState>) => void;
    clearState: () => void;
    startTransaction: (id: string) => void;
}

const TransactionContext = createContext<TransactionContextType | undefined>(undefined);

const STORAGE_KEY = 'bridgewise_tx_state';

export const TransactionProvider = ({ children }: { children: ReactNode }) => {
    const [state, setState] = useState<TransactionState>({
        id: '',
        status: 'idle',
        progress: 0,
        step: '',
        timestamp: 0,
    });

    // Load from storage on mount
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
                    setState(parsed);
                } else {
                    localStorage.removeItem(STORAGE_KEY);
                }
            }
        } catch (e) {
            console.error('Failed to load transaction state', e);
        }
    }, []);

    // Save to storage on change
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (state.status !== 'idle') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }
    }, [state]);

    const updateState = useCallback((updates: Partial<TransactionState>) => {
        setState((prev) => ({ ...prev, ...updates, timestamp: Date.now() }));
    }, []);

    const clearState = useCallback(() => {
        setState({
            id: '',
            status: 'idle',
            progress: 0,
            step: '',
            timestamp: 0,
        });
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    const startTransaction = useCallback((id: string) => {
        setState({
            id,
            status: 'pending',
            progress: 0,
            step: 'Initializing...',
            timestamp: Date.now()
        });
    }, []);

    return (
        <TransactionContext.Provider value={{ state, updateState, clearState, startTransaction }}>
            {children}
        </TransactionContext.Provider>
    );
};

export const useTransaction = () => {
    const context = useContext(TransactionContext);
    if (!context) {
        throw new Error('useTransaction must be used within a TransactionProvider');
    }
    return context;
};
