import { filterTransactions, sortTransactions } from '../filter';
import type { BridgeTransaction } from '../types';

const transactions: BridgeTransaction[] = [
  {
    txHash: '0x1',
    bridgeName: 'layerzero',
    sourceChain: 'ethereum',
    destinationChain: 'stellar',
    sourceToken: 'USDC',
    destinationToken: 'USDC',
    amount: 100,
    fee: 1,
    slippagePercent: 0.5,
    status: 'confirmed',
    timestamp: new Date('2026-01-02T00:00:00.000Z'),
    account: '0xuser',
  },
  {
    txHash: '0x2',
    bridgeName: 'hop',
    sourceChain: 'polygon',
    destinationChain: 'arbitrum',
    sourceToken: 'USDT',
    destinationToken: 'USDT',
    amount: 42,
    fee: 0.2,
    slippagePercent: 0.1,
    status: 'failed',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    account: '0xuser',
  },
];

describe('transaction history filtering', () => {
  it('filters by chain and status', () => {
    const result = filterTransactions(transactions, {
      chain: 'ethereum',
      status: 'confirmed',
    });

    expect(result).toHaveLength(1);
    expect(result[0].txHash).toBe('0x1');
  });

  it('filters by bridge name', () => {
    const result = filterTransactions(transactions, {
      bridgeName: 'hop',
    });

    expect(result).toHaveLength(1);
    expect(result[0].txHash).toBe('0x2');
  });

  it('sorts by timestamp descending by default', () => {
    const result = sortTransactions(transactions);
    expect(result[0].txHash).toBe('0x1');
  });

  it('sorts by timestamp ascending', () => {
    const result = sortTransactions(transactions, 'asc');
    expect(result[0].txHash).toBe('0x2');
  });
});
