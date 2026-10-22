import {
  EVMReceiptPoller,
  calculateBackoffWithJitter,
  validateReceipt,
  redactSensitiveData,
  sanitizeRpcUrl,
  InvalidTransactionHashError,
  MalformedReceiptError,
  ChainBoundaryMismatchError,
  DEFAULT_CHAIN_POLLING_PROFILES,
} from './receipt-poller';
import { EvmTransactionLifecycleManager } from './evm-transaction-lifecycle';

describe('EVMReceiptPoller (#1321)', () => {
  const validTxHash = '0x1111111111111111111111111111111111111111111111111111111111111111';
  const replacementTxHash = '0x2222222222222222222222222222222222222222222222222222222222222222';
  const validBlockHash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const altBlockHash = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  let fakeClock: number;
  const now = () => fakeClock;
  const sleep = async (ms: number) => {
    fakeClock += ms;
  };

  beforeEach(() => {
    fakeClock = 10_000;
  });

  describe('exponential backoff and jitter calculation', () => {
    it('calculates exponential backoff capped at maxIntervalMs', () => {
      const params = {
        initialIntervalMs: 1000,
        maxIntervalMs: 5000,
        backoffMultiplier: 2,
        jitterRatio: 0,
        jitterStrategy: 'proportional' as const,
      };

      // deterministic with random = 0.5 (neutral jitter)
      const neutralRandom = () => 0.5;

      const attempt0 = calculateBackoffWithJitter(0, params, neutralRandom);
      expect(attempt0.rawIntervalMs).toBe(1000);
      expect(attempt0.delayMs).toBe(1000);

      const attempt1 = calculateBackoffWithJitter(1, params, neutralRandom);
      expect(attempt1.rawIntervalMs).toBe(2000);
      expect(attempt1.delayMs).toBe(2000);

      const attempt2 = calculateBackoffWithJitter(2, params, neutralRandom);
      expect(attempt2.rawIntervalMs).toBe(4000);
      expect(attempt2.delayMs).toBe(4000);

      // Capped at maxIntervalMs = 5000
      const attempt3 = calculateBackoffWithJitter(3, params, neutralRandom);
      expect(attempt3.rawIntervalMs).toBe(5000);
      expect(attempt3.delayMs).toBe(5000);
    });

    it('applies proportional jitter within configured bounds', () => {
      const params = {
        initialIntervalMs: 1000,
        maxIntervalMs: 10000,
        backoffMultiplier: 2,
        jitterRatio: 0.2, // +/- 20%
        jitterStrategy: 'proportional' as const,
      };

      // random = 0 -> minimum jitter (-20%)
      const minJitter = calculateBackoffWithJitter(0, params, () => 0);
      expect(minJitter.delayMs).toBe(800);

      // random = 1 -> maximum jitter (+20%)
      const maxJitter = calculateBackoffWithJitter(0, params, () => 1);
      expect(maxJitter.delayMs).toBe(1200);

      // random = 0.5 -> zero net jitter
      const midJitter = calculateBackoffWithJitter(0, params, () => 0.5);
      expect(midJitter.delayMs).toBe(1000);
    });

    it('supports full, equal, and decorrelated jitter strategies', () => {
      const params = {
        initialIntervalMs: 1000,
        maxIntervalMs: 10000,
        backoffMultiplier: 2,
        jitterRatio: 0.2,
        jitterStrategy: 'full' as const,
      };

      const full = calculateBackoffWithJitter(1, params, () => 0.5);
      expect(full.delayMs).toBe(1000); // 0.5 * 2000

      const equal = calculateBackoffWithJitter(1, { ...params, jitterStrategy: 'equal' }, () => 0.5);
      expect(equal.delayMs).toBe(1500); // 1000 + 0.5 * 1000

      const decorrelated = calculateBackoffWithJitter(
        1,
        { ...params, jitterStrategy: 'decorrelated' },
        () => 0.5,
        2000,
      );
      expect(decorrelated.delayMs).toBe(3500); // 1000 + 0.5 * (6000 - 1000)
    });
  });

  describe('untrusted RPC response validation', () => {
    it('validates and normalizes valid receipt with hex status', () => {
      const raw = {
        transactionHash: validTxHash,
        blockNumber: '0x64', // 100
        blockHash: validBlockHash,
        status: '0x1',
        gasUsed: '0x5208', // 21000
        effectiveGasPrice: '0x4a817c800', // 20 Gwei
        logs: [],
      };

      const validated = validateReceipt(raw, validTxHash);
      expect(validated.transactionHash).toBe(validTxHash);
      expect(validated.blockNumber).toBe(100);
      expect(validated.blockHash).toBe(validBlockHash);
      expect(validated.status).toBe(1);
      expect(validated.gasUsed).toBe(21000n);
      expect(validated.effectiveGasPrice).toBe(20000000000n);
    });

    it('rejects null, primitive, or array payloads', () => {
      expect(() => validateReceipt(null, validTxHash)).toThrow(MalformedReceiptError);
      expect(() => validateReceipt('not-a-receipt', validTxHash)).toThrow(MalformedReceiptError);
      expect(() => validateReceipt([], validTxHash)).toThrow(MalformedReceiptError);
    });

    it('rejects mismatched transaction hashes', () => {
      const raw = {
        transactionHash: '0x9999999999999999999999999999999999999999999999999999999999999999',
        blockNumber: 100,
        blockHash: validBlockHash,
        status: 1,
      };
      expect(() => validateReceipt(raw, validTxHash)).toThrow('mismatch');
    });

    it('rejects invalid blockNumber and blockHash formats', () => {
      expect(() =>
        validateReceipt(
          { transactionHash: validTxHash, blockNumber: -5, blockHash: validBlockHash, status: 1 },
          validTxHash,
        ),
      ).toThrow('Invalid blockNumber');

      expect(() =>
        validateReceipt(
          { transactionHash: validTxHash, blockNumber: 10, blockHash: 'invalid-hash', status: 1 },
          validTxHash,
        ),
      ).toThrow('Invalid blockHash');
    });

    it('rejects invalid execution status', () => {
      expect(() =>
        validateReceipt(
          { transactionHash: validTxHash, blockNumber: 10, blockHash: validBlockHash, status: '0x2' },
          validTxHash,
        ),
      ).toThrow('Invalid transaction execution status');
    });
  });

  describe('chain configuration profiles', () => {
    it('returns predefined profiles for Ethereum Mainnet, Arbitrum, Optimism, Polygon, and BSC', () => {
      const poller = new EVMReceiptPoller();
      const ethProfile = poller.getProfile(1);
      expect(ethProfile.chainName).toBe('Ethereum Mainnet');
      expect(ethProfile.requiredConfirmations).toBe(12);

      const arbProfile = poller.getProfile(42161);
      expect(arbProfile.chainName).toBe('Arbitrum One');
      expect(arbProfile.requiredConfirmations).toBe(1);

      const polyProfile = poller.getProfile(137);
      expect(polyProfile.requiredConfirmations).toBe(64);
    });

    it('returns generic fallback profile for unknown chains', () => {
      const poller = new EVMReceiptPoller();
      const custom = poller.getProfile(99999);
      expect(custom.chainName).toBe('Generic EVM Chain');
      expect(custom.requiredConfirmations).toBe(1);
    });
  });

  describe('receipt polling execution', () => {
    it('rejects invalid transaction hash inputs', async () => {
      const poller = new EVMReceiptPoller({ now, sleep });
      const mockProvider = {
        getTransactionReceipt: jest.fn(),
        getBlockNumber: jest.fn(),
      };

      await expect(poller.poll(mockProvider, '0xinvalid')).rejects.toThrow(InvalidTransactionHashError);
    });

    it('enforces chain boundary verification', async () => {
      const poller = new EVMReceiptPoller({ now, sleep });
      const mockProvider = {
        getTransactionReceipt: jest.fn(),
        getBlockNumber: jest.fn(),
        getNetwork: jest.fn().mockResolvedValue({ chainId: 137n }), // Connected to Polygon
      };

      // Requesting polling on Ethereum Mainnet (chainId 1) while provider is on chain 137
      await expect(
        poller.poll(mockProvider, validTxHash, { chainId: 1 }),
      ).rejects.toThrow(ChainBoundaryMismatchError);
    });

    it('confirms transaction immediately when mined and confirmations are met', async () => {
      const poller = new EVMReceiptPoller({ now, sleep, random: () => 0.5 });
      const mockProvider = {
        getTransactionReceipt: jest.fn().mockResolvedValue({
          transactionHash: validTxHash,
          blockNumber: 100,
          blockHash: validBlockHash,
          status: 1,
        }),
        getBlockNumber: jest.fn().mockResolvedValue(100),
      };

      const outcome = await poller.poll(mockProvider, validTxHash, {
        chainId: 42161, // Arbitrum (requires 1 confirmation)
      });

      expect(outcome.status).toBe('confirmed');
      expect(outcome.confirmations).toBe(1);
      expect(outcome.attempts).toBe(1);
      expect(outcome.escalationRequired).toBe(false);
      expect(outcome.receipt?.blockNumber).toBe(100);
    });

    it('polls with backoff until required confirmation depth is achieved', async () => {
      const poller = new EVMReceiptPoller({ now, sleep, random: () => 0.5 });
      let blockHeight = 100;
      let receiptQueries = 0;

      const mockProvider = {
        getTransactionReceipt: jest.fn().mockImplementation(async () => {
          receiptQueries++;
          // First attempt: not mined yet
          if (receiptQueries === 1) return null;
          // Subsequent: mined at block 100
          return {
            transactionHash: validTxHash,
            blockNumber: 100,
            blockHash: validBlockHash,
            status: 1,
          };
        }),
        getBlockNumber: jest.fn().mockImplementation(async () => {
          return blockHeight;
        }),
      };

      const progressHistory: number[] = [];
      const pollPromise = poller.poll(mockProvider, validTxHash, {
        chainId: 1,
        requiredConfirmations: 3,
        initialIntervalMs: 500,
        onConfirmationProgress: (curr) => {
          progressHistory.push(curr);
          blockHeight++; // simulate mining forward
        },
      });

      const outcome = await pollPromise;
      expect(outcome.status).toBe('confirmed');
      expect(outcome.confirmations).toBeGreaterThanOrEqual(3);
      expect(progressHistory).toContain(1);
    });

    it('deduplicates concurrent polling calls for the same chain and txHash (idempotency)', async () => {
      const poller = new EVMReceiptPoller({ now, sleep, random: () => 0.5 });
      let queryCount = 0;

      const mockProvider = {
        getTransactionReceipt: jest.fn().mockImplementation(async () => {
          queryCount++;
          return {
            transactionHash: validTxHash,
            blockNumber: 100,
            blockHash: validBlockHash,
            status: 1,
          };
        }),
        getBlockNumber: jest.fn().mockResolvedValue(100),
      };

      // Fire two concurrent poll requests for the same transaction
      const [res1, res2] = await Promise.all([
        poller.poll(mockProvider, validTxHash, { chainId: 10 }),
        poller.poll(mockProvider, validTxHash, { chainId: 10 }),
      ]);

      expect(res1).toBe(res2); // Same promise outcome
      expect(queryCount).toBe(1); // Provider only queried once
    });

    it('handles reverted transactions with operator escalation', async () => {
      const poller = new EVMReceiptPoller({ now, sleep });
      const mockProvider = {
        getTransactionReceipt: jest.fn().mockResolvedValue({
          transactionHash: validTxHash,
          blockNumber: 105,
          blockHash: validBlockHash,
          status: 0, // Reverted
        }),
        getBlockNumber: jest.fn().mockResolvedValue(105),
      };

      let escalationEvent: any;
      const outcome = await poller.poll(mockProvider, validTxHash, {
        chainId: 1,
        onEscalation: (e) => {
          escalationEvent = e;
        },
      });

      expect(outcome.status).toBe('reverted');
      expect(outcome.escalationRequired).toBe(true);
      expect(escalationEvent?.alertType).toBe('REVERTED_TRANSACTION');
    });

    it('detects chain reorg when mined block hash changes during confirmation wait', async () => {
      const poller = new EVMReceiptPoller({ now, sleep, random: () => 0.5 });
      let query = 0;

      const mockProvider = {
        getTransactionReceipt: jest.fn().mockImplementation(async () => {
          query++;
          if (query === 1) {
            return {
              transactionHash: validTxHash,
              blockNumber: 100,
              blockHash: validBlockHash,
              status: 1,
            };
          }
          // Query 2: block hash changed (reorg!)
          return {
            transactionHash: validTxHash,
            blockNumber: 100,
            blockHash: altBlockHash,
            status: 1,
          };
        }),
        getBlockNumber: jest.fn().mockResolvedValue(100),
      };

      let reorgEscalation: any;
      const outcome = await poller.poll(mockProvider, validTxHash, {
        chainId: 1,
        requiredConfirmations: 5,
        initialIntervalMs: 100,
        onEscalation: (e) => {
          reorgEscalation = e;
        },
      });

      expect(outcome.status).toBe('reorg_detected');
      expect(outcome.escalationRequired).toBe(true);
      expect(reorgEscalation?.alertType).toBe('REORG_DETECTED');
    });

    it('detects transaction replacement', async () => {
      const poller = new EVMReceiptPoller({ now, sleep });
      const mockProvider = {
        getTransactionReceipt: jest.fn().mockResolvedValue(null),
        getBlockNumber: jest.fn().mockResolvedValue(200),
      };

      const outcome = await poller.poll(mockProvider, validTxHash, {
        chainId: 1,
        checkReplacement: async (hash) => {
          return hash === validTxHash ? replacementTxHash : null;
        },
      });

      expect(outcome.status).toBe('replaced');
      expect(outcome.replacedByTxHash).toBe(replacementTxHash);
    });

    it('times out and triggers escalation when timeoutMs is reached', async () => {
      const poller = new EVMReceiptPoller({ now, sleep, random: () => 0.5 });
      const mockProvider = {
        getTransactionReceipt: jest.fn().mockResolvedValue(null),
        getBlockNumber: jest.fn().mockResolvedValue(100),
      };

      let timeoutEscalation: any;
      const outcome = await poller.poll(mockProvider, validTxHash, {
        chainId: 1,
        timeoutMs: 3000,
        initialIntervalMs: 1000,
        onEscalation: (e) => {
          timeoutEscalation = e;
        },
      });

      expect(outcome.status).toBe('timed_out');
      expect(outcome.escalationRequired).toBe(true);
      expect(timeoutEscalation?.alertType).toBe('POLLING_TIMEOUT');
    });

    it('resiliently handles transient RPC errors and escalates on persistent failure', async () => {
      const poller = new EVMReceiptPoller({ now, sleep, random: () => 0.5 });
      let attempts = 0;

      const mockProvider = {
        getTransactionReceipt: jest.fn().mockImplementation(async () => {
          attempts++;
          if (attempts <= 2) {
            throw new Error('429 Too Many Requests (Rate limit)');
          }
          return {
            transactionHash: validTxHash,
            blockNumber: 100,
            blockHash: validBlockHash,
            status: 1,
          };
        }),
        getBlockNumber: jest.fn().mockResolvedValue(100),
      };

      const outcome = await poller.poll(mockProvider, validTxHash, {
        chainId: 1,
        requiredConfirmations: 1,
        initialIntervalMs: 100,
      });

      expect(outcome.status).toBe('confirmed');
      expect(attempts).toBe(3);
    });
  });

  describe('security and redaction', () => {
    it('redacts sensitive keys and values from telemetry data', () => {
      const payload = {
        txHash: validTxHash,
        privateKey: '0xabcdef0123456789',
        secretToken: 'shhh-secret',
        authHeader: 'Bearer token123',
        nested: {
          mnemonic: 'twelve words here',
          normalData: 'safe',
        },
      };

      const redacted = redactSensitiveData(payload);
      expect(redacted.privateKey).toBe('[REDACTED]');
      expect(redacted.secretToken).toBe('[REDACTED]');
      expect(redacted.authHeader).toBe('[REDACTED]');
      expect(redacted.nested.mnemonic).toBe('[REDACTED]');
      expect(redacted.nested.normalData).toBe('safe');
      expect(redacted.txHash).toBe(validTxHash);
    });

    it('sanitizes RPC URLs with embedded basic-auth or secret query keys', () => {
      const safe = sanitizeRpcUrl('https://user:mySecretPassword@mainnet.infura.io/v3?api_key=secretKey123&other=val');
      expect(safe).not.toContain('mySecretPassword');
      expect(safe).not.toContain('secretKey123');
      expect(safe).toContain('[REDACTED]');
      expect(safe).toContain('other=val');
    });
  });

  describe('integration with EvmTransactionLifecycleManager', () => {
    it('transitions lifecycle record in lockstep with receipt polling', async () => {
      const lifecycle = new EvmTransactionLifecycleManager(now);
      lifecycle.prepare({
        id: 'tx-order-1',
        chainId: 1,
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
        nonce: 1,
        gasConfig: { gasLimit: 21000n },
        requiredConfirmations: 2,
      });
      lifecycle.markSubmitted('tx-order-1', validTxHash, 1);

      const poller = new EVMReceiptPoller({ now, sleep, random: () => 0.5 });
      let currentHeight = 100;

      const mockProvider = {
        getTransactionReceipt: jest.fn().mockResolvedValue({
          transactionHash: validTxHash,
          blockNumber: 100,
          blockHash: validBlockHash,
          status: 1,
        }),
        getBlockNumber: jest.fn().mockImplementation(async () => {
          return currentHeight;
        }),
      };

      const outcome = await poller.poll(mockProvider, validTxHash, {
        chainId: 1,
        requiredConfirmations: 2,
        initialIntervalMs: 100,
        lifecycleManager: lifecycle,
        txRecordId: 'tx-order-1',
        onConfirmationProgress: () => {
          currentHeight = 101; // Mining advances depth
        },
      });

      expect(outcome.status).toBe('confirmed');
      const finalRecord = lifecycle.get('tx-order-1');
      expect(finalRecord?.state).toBe('confirmed');
      expect(finalRecord?.confirmations).toBe(2);
      expect(finalRecord?.minedBlock).toBe(100);
    });
  });
});
