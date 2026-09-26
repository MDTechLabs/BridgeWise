export interface BridgeEvent {
  id: string;
  sourceChain: string;
  destinationChain: string;
  transactionHash: string;
  sourceAddress: string;
  destinationAddress: string;
  tokenSymbol: string;
  tokenAddress: string;
  amount: string;
  fee: string;
  status: 'pending' | 'confirmed' | 'failed' | 'reverted';
  initiatedAt: number;
  confirmedAt?: number;
  blockNumber: number;
  eventType: 'lock' | 'mint' | 'burn' | 'release' | 'relay';
  messageId?: string;
}

export interface ExportQuery {
  startTime?: number;
  endTime?: number;
  tokenContract?: string;
  walletAddress?: string;
  chainId?: string;
  status?: BridgeEvent['status'];
  eventType?: BridgeEvent['eventType'];
}

export interface ExportMetrics {
  totalEvents: number;
  totalVolume: string;
  totalFees: string;
  uniqueWallets: number;
  uniqueTokens: number;
  timeRange: {
    start: number;
    end: number;
  };
  statusBreakdown: Record<string, number>;
  chainBreakdown: Record<string, number>;
}

export interface ExportedRecord {
  event: BridgeEvent;
  exportedAt: number;
  format: 'csv' | 'json';
}

export interface ExporterConfig {
  dateFormat?: string;
  includeHeader?: boolean;
  prettyPrint?: boolean;
}
