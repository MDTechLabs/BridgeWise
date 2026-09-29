/**
 * Integration coverage for message nonce persistence: the durable
 * `FileNonceStore`, the executor's serialised nonce allocator and a mocked
 * destination RPC work together so every message is delivered with a nonce
 * that survives a crash and is never re-issued to two different messages.
 */
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));

import axios from 'axios';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { EvmExecutor } from '../../executors/evm-executor';
import { FileNonceStore } from '../file-nonce-store';
import { InMemoryNonceStore } from '../in-memory-nonce-store';
import { CrossChainMessage, NonceStore } from '../../types';

const post = axios.post as jest.Mock;

function makeMessage(overrides: Partial<CrossChainMessage> = {}): CrossChainMessage {
  return {
    id: 'nonce-msg',
    sourceChainId: 'arbitrum',
    destinationChainId: 'ethereum',
    sourceTxHash: '0x' + 'a'.repeat(64),
    sourceBlockNumber: 10_000_000,
    messageType: 'lock',
    payload: '0xdeadbeef',
    sender: '0x' + '1'.repeat(40),
    recipient: '0x' + '2'.repeat(40),
    amount: '1000',
    createdAt: 1_700_000_000_000,
    status: 'processing',
    retryCount: 0,
    ...overrides,
  };
}

interface RpcMode {
  failFirstBroadcast?: boolean;
  failOnce?: (nonceHex: string) => boolean;
  receiptBlock?: string;
  currentBlock?: string;
}

/** Mock an EVM node that accepts sendTransaction calls, and record the nonces it saw. */
function mockEthereum(mode: RpcMode = {}): { sentNonces: string[]; sentGasPrices: string[] } {
  const sentNonces: string[] = [];
  const sentGasPrices: string[] = [];
  const receiptBlock = mode.receiptBlock ?? '0x64';
  const currentBlock = mode.currentBlock ?? '0x67';

  post.mockImplementation(async (_url: string, body: { method: string; params?: unknown[] }) => {
    if (body.method === 'eth_sendTransaction') {
      const tx = (body.params as [{ nonce: string; gasPrice: string }])[0];
      sentNonces.push(tx.nonce);
      sentGasPrices.push(tx.gasPrice);
      if (mode.failFirstBroadcast && sentNonces.length === 1) {
        throw new Error('internal error');
      }
      if (mode.failOnce && mode.failOnce(tx.nonce) && sentNonces.length === 1) {
        return { data: { error: { message: 'replacement transaction underpriced' } } };
      }
      return { data: { result: '0x' + '1'.repeat(64) } };
    }
    if (body.method === 'eth_getTransactionReceipt') {
      return { data: { result: { blockNumber: receiptBlock, status: '0x1', gasUsed: '0x5208' } } };
    }
    if (body.method === 'eth_blockNumber') {
      return { data: { result: currentBlock } };
    }
    return { data: { error: { message: `unexpected RPC call ${body.method}` } } };
  });

  return { sentNonces, sentGasPrices };
}

describe('message nonce persistence pipeline', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bridgewise-nonce-pipeline-'));
  });

  afterEach(() => {
    jest.useRealTimers();
    post.mockReset();
    rmSync(dir, { recursive: true, force: true });
  });

  function executor(store: NonceStore): EvmExecutor {
    return new EvmExecutor({
      chainId: 'ethereum',
      chainType: 'evm',
      rpcUrl: 'http://relayer.test:8545',
      gasRepricing: {
        initialGasPrice: '50000000000',
        maxGasPrice: '500000000000',
        bumpPercentage: 10,
        bumpIntervalBlocks: 3,
        maxBumps: 3,
      },
      confirmationBlocks: 2,
      confirmationPollIntervalMs: 1,
      nonceStore: store,
    });
  }

  it('assigns and persists a fresh nonce for every distinct message', async () => {
    const { sentNonces } = mockEthereum();
    const file = join(dir, 'nonces.json');
    const store = new FileNonceStore({ filePath: file });
    const evm = executor(store);

    await expect(evm.execute(makeMessage({ id: 'm1' }))).resolves.toMatchObject({ success: true });
    await expect(evm.execute(makeMessage({ id: 'm2' }))).resolves.toMatchObject({ success: true });

    expect(sentNonces).toEqual(['0x0', '0x1']);
    expect(await store.getNonce('ethereum')).toBe(2);
    // Confirmed deliveries release their pins.
    expect(await store.getMessageNonce('m1')).toBeNull();
    expect(await store.getMessageNonce('m2')).toBeNull();
  });

  it('reuses the pinned nonce when a failed message is redelivered', async () => {
    const { sentNonces } = mockEthereum({ failFirstBroadcast: true });
    const file = join(dir, 'nonces.json');
    const store = new FileNonceStore({ filePath: file });
    const evm = executor(store);
    const reused = jest.fn();
    evm.on('nonce-reused', reused);

    const first = await evm.execute(makeMessage({ id: 'm1' }));
    expect(first.success).toBe(false);
    // The failed attempt still pinned its nonce so a redelivery cannot drift.
    expect(await store.getMessageNonce('m1')).toEqual({ chainId: 'ethereum', nonce: 0 });
    expect(await store.getNonce('ethereum')).toBe(1);

    const second = await evm.execute(makeMessage({ id: 'm1' }));
    expect(second.success).toBe(true);
    expect(sentNonces).toEqual(['0x0', '0x0']); // same message, same nonce
    expect(await store.getMessageNonce('m1')).toBeNull(); // released after success
    expect(reused).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'm1', nonce: 0 }),
    );
  });

  it('resumes from the persisted high-water mark after a restart', async () => {
    mockEthereum();
    const file = join(dir, 'nonces.json');
    const store = new FileNonceStore({ filePath: file });
    const firstExecutor = executor(store);
    await firstExecutor.execute(makeMessage({ id: 'm1' }));
    await firstExecutor.execute(makeMessage({ id: 'm2' }));

    // A brand-new executor over a brand-new store on the same file forgets
    // nothing even though every in-memory allocator is fresh.
    const restarted = executor(new FileNonceStore({ filePath: file }));
    const m3 = await restarted.execute(makeMessage({ id: 'm3' }));
    expect(m3.success).toBe(true);
    expect(await new FileNonceStore({ filePath: file }).getNonce('ethereum')).toBe(3);
  });

  it('repricing retries with the same reserved nonce', async () => {
    const { sentNonces, sentGasPrices } = mockEthereum({
      failOnce: (nonce) => nonce === '0x0',
    });
    const evm = executor(new FileNonceStore({ filePath: join(dir, 'nonces.json') }));
    const repriced = jest.fn();
    evm.on('gas-repriced', repriced);

    const result = await evm.execute(makeMessage({ id: 'm1' }));
    expect(result.success).toBe(true);
    // First broadcast underpriced (same nonce), second replaced the pending tx.
    expect(sentNonces).toEqual(['0x0', '0x0']);
    expect(sentGasPrices[0]).toBe('0x' + BigInt('50000000000').toString(16));
    expect(repriced).toHaveBeenCalled();
  });

  it('fails a delivery without broadcasting when the store cannot persist', async () => {
    const { sentNonces } = mockEthereum();
    const base = new InMemoryNonceStore();
    const failing: NonceStore = {
      getNonce: (chainId) => base.getNonce(chainId),
      setNonce: () => Promise.reject(new Error('disk full')),
      getMessageNonce: (messageId) => base.getMessageNonce(messageId),
      setMessageNonce: (messageId, chainId, nonce) => base.setMessageNonce(messageId, chainId, nonce),
      removeMessageNonce: (messageId) => base.removeMessageNonce(messageId),
    };
    const evm = executor(failing);
    const errorSpy = jest.fn();
    evm.on('nonce-error', errorSpy);

    const result = await evm.execute(makeMessage({ id: 'm1' }));
    expect(result.success).toBe(false);
    expect(String(result.error)).toContain('disk full');
    expect(sentNonces).toEqual([]); // nothing reached the chain
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'm1', phase: 'persist', error: 'disk full' }),
    );
  });

  it('emits nonce lifecycle events across an execution', async () => {
    mockEthereum();
    const evm = executor(new FileNonceStore({ filePath: join(dir, 'nonces.json') }));
    const assigned = jest.fn();
    const loaded = jest.fn();
    evm.on('nonce-assigned', assigned);
    evm.on('nonce-loaded', loaded);

    await evm.execute(makeMessage({ id: 'm1' }));
    expect(assigned).toHaveBeenCalledWith({
      chainId: 'ethereum',
      messageId: 'm1',
      nonce: 0,
    });
    expect(loaded).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 'ethereum', nonce: 0, source: 'default' }),
    );
  });
});