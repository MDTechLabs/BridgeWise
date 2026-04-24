import { TransferHistory } from './entities/history.entity';

export interface SaveTransactionInput {
  userId: string;
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  amountIn: string;
  amountOut: string;
  transactionHash: string;
  status: 'success' | 'failed' | 'pending';
  slippagePercentage?: number;
  estimatedLoss?: string;
}

export interface HistoryFilter {
  status?: 'success' | 'failed' | 'pending';
  fromChainId?: number;
  toChainId?: number;
  limit?: number;
  offset?: number;
}

/**
 * In-memory history service for transaction tracking.
 * Can be replaced with a repository-backed implementation.
 */
export class HistoryService {
  private store: TransferHistory[] = [];

  save(input: SaveTransactionInput): TransferHistory {
    const record: TransferHistory = {
      id: crypto.randomUUID(),
      userId: input.userId,
      fromChainId: input.fromChainId,
      toChainId: input.toChainId,
      fromTokenAddress: input.fromTokenAddress,
      toTokenAddress: input.toTokenAddress,
      amountIn: input.amountIn,
      amountOut: input.amountOut,
      transactionHash: input.transactionHash,
      status: input.status,
      slippagePercentage: input.slippagePercentage,
      estimatedLoss: input.estimatedLoss,
      timestamp: new Date(),
    };
    this.store.push(record);
    return record;
  }

  findByUser(userId: string, filter: HistoryFilter = {}): TransferHistory[] {
    let results = this.store.filter((r) => r.userId === userId);

    if (filter.status) {
      results = results.filter((r) => r.status === filter.status);
    }
    if (filter.fromChainId !== undefined) {
      results = results.filter((r) => r.fromChainId === filter.fromChainId);
    }
    if (filter.toChainId !== undefined) {
      results = results.filter((r) => r.toChainId === filter.toChainId);
    }

    results = results.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 50;
    return results.slice(offset, offset + limit);
  }

  updateStatus(
    transactionHash: string,
    status: 'success' | 'failed' | 'pending',
  ): boolean {
    const record = this.store.find(
      (r) => r.transactionHash === transactionHash,
    );
    if (!record) return false;
    record.status = status;
    return true;
  }
}
