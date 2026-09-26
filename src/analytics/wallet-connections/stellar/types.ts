export type WalletConnectionStatus =
  | "success"
  | "failed"
  | "cancelled";

export interface WalletConnectionEvent {
  walletName: string;
  timestamp: number;
  duration: number; // milliseconds
  status: WalletConnectionStatus;
  error?: string;
}

export interface WalletConnectionReport {
  totalAttempts: number;
  successfulConnections: number;
  failedConnections: number;
  cancelledConnections: number;
  successRate: number;
  averageConnectionTime: number;
}