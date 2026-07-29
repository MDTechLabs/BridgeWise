export type CrossChainLifecycleStatus = 'Pending' | 'Committed' | 'Relayed' | 'Failed';
export type MilestoneStatus = 'completed' | 'in_progress' | 'pending' | 'failed';
export interface LifecycleMilestone {
    name: string;
    status: MilestoneStatus;
    timestamp?: string;
    txHash?: string;
    details?: string;
}
export interface TransactionStatusResult {
    txHash: string;
    sourceChain: string;
    destinationChain: string;
    status: CrossChainLifecycleStatus;
    milestones: LifecycleMilestone[];
    sender?: string;
    recipient?: string;
    token?: string;
    amount?: string | number;
    error?: string;
    timestamp: string;
}
export interface CheckStatusOptions {
    sourceChain?: string;
}
export declare const SUPPORTED_CHAINS: string[];
export declare class StatusChecker {
    static isValidTxHash(hash: string): boolean;
    static normalizeChain(chain: string): string | null;
    checkStatus(txHash: string, options?: CheckStatusOptions): Promise<TransactionStatusResult>;
}
