import { TransactionHistoryStorage } from '../storage';
import type { BridgeTransaction } from '../types';

const createTransaction = (overrides?: Partial<BridgeTransaction>): BridgeTransaction => ({
  txHash: '0xabc',
  bridgeName: 'layerzero',
  sourceChain: 'ethereum',
  destinationChain: 'stellar',
  sourceToken: 'USDC',
  destinationToken: 'USDC',
  amount: 100,
  fee: 1,
  slippagePercent: 0.5,
  status: 'confirmed',
  timestamp: new Date('2026-01-01T00:00:00.000Z'),
  account: '0xuser-1',
  ...overrides,
});

describe('TransactionHistoryStorage', () => {
  const makeLocalStorage = () => {
    const store = new Map<string, string>();

    return {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
      }),
      clear: jest.fn(() => {
        store.clear();
      }),
    };
  };

  beforeEach(() => {
    const localStorage = makeLocalStorage();
    Object.defineProperty(global, 'window', {
      configurable: true,
      writable: true,
      value: { localStorage },
    });
  });

  afterEach(() => {
    delete (global as { window?: unknown }).window;
  });

  it('stores and retrieves transactions by account', async () => {
    const storage = new TransactionHistoryStorage({ storageKey: 'test-history' });

    await storage.upsertTransaction(createTransaction({ txHash: '0x1', account: '0xalice' }));
    await storage.upsertTransaction(createTransaction({ txHash: '0x2', account: '0xbob' }));
    await storage.upsertTransaction(createTransaction({ txHash: '0x3', account: '0xalice' }));

    const aliceTransactions = await storage.getTransactionsByAccount('0xalice');

    expect(aliceTransactions).toHaveLength(2);
    expect(aliceTransactions.every((transaction) => transaction.account === '0xalice')).toBe(true);
  });

  it('updates existing transaction when tx hash already exists', async () => {
    const storage = new TransactionHistoryStorage({ storageKey: 'test-history' });

    await storage.upsertTransaction(createTransaction({ txHash: '0x1', status: 'pending' }));
    await storage.upsertTransaction(createTransaction({ txHash: '0x1', status: 'confirmed' }));

    const transactions = await storage.getTransactionsByAccount('0xuser-1');

    expect(transactions).toHaveLength(1);
    expect(transactions[0].status).toBe('confirmed');
  });

  it('falls back to local data when backend fails', async () => {
    const backend = {
      saveTransaction: jest.fn(async () => undefined),
      getTransactionsByAccount: jest.fn(async () => {
        throw new Error('backend unavailable');
      }),
    };

    const storage = new TransactionHistoryStorage({
      storageKey: 'test-history',
      backend,
    });

    await storage.upsertTransaction(createTransaction({ txHash: '0xlocal' }));
    const transactions = await storage.getTransactionsByAccount('0xuser-1', {
      includeBackend: true,
    });

    expect(transactions).toHaveLength(1);
    expect(transactions[0].txHash).toBe('0xlocal');
  });
});
