/**
 * Integration coverage for the message delivery path: an indexer batch goes
 * in at the queue, and only well-formed messages reach the chain executor.
 *
 * The executor is the component that turns a message into a real transaction,
 * so the property under test is that a malformed message can never produce an
 * RPC call, no matter what shape the producer hands to the queue.
 */
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));

import axios from 'axios';
import { MessageQueue } from '../../queue/message-queue';
import { EvmExecutor } from '../../executors/evm-executor';
import { CrossChainMessage, ExecutionResult } from '../../types';

const post = axios.post as jest.Mock;
const EVM_ADDRESS = '0x' + '1'.repeat(40);
const STELLAR_ACCOUNT = 'G' + 'A'.repeat(55);

function makeMessage(overrides: Partial<CrossChainMessage> = {}): CrossChainMessage {
  return {
    id: 'msg-1',
    sourceChainId: 'ethereum',
    destinationChainId: 'stellar',
    sourceTxHash: '0x' + 'a'.repeat(64),
    sourceBlockNumber: 10_000_000,
    messageType: 'lock',
    payload: '0xdeadbeef',
    sender: EVM_ADDRESS,
    recipient: STELLAR_ACCOUNT,
    amount: '1000',
    createdAt: 1_700_000_000_000,
    status: 'pending',
    retryCount: 0,
    ...overrides,
  };
}

/** An indexer batch: well-formed messages interleaved with malformed ones. */
function makeBatch(): unknown[] {
  return [
    makeMessage({ id: 'ok-1', sourceLogIndex: 0 }),
    makeMessage({ id: 'bad-payload', sourceLogIndex: 1, payload: '0xabc' }),
    makeMessage({ id: 'bad-amount', sourceLogIndex: 2, amount: '-1' }),
    { id: 'bad-empty' },
    makeMessage({ id: 'ok-2', sourceLogIndex: 4 }),
    makeMessage({ id: 'bad-status', sourceLogIndex: 5, status: 'inflight' as never }),
    makeMessage({ id: 'ok-3', sourceLogIndex: 6 }),
  ];
}

async function drain(queue: MessageQueue, executor: EvmExecutor): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  for (;;) {
    const message = queue.dequeue();
    if (!message) break;
    results.push(await executor.execute(message));
    await queue.complete({
      messageId: message.id,
      success: true,
      transactionHash: '0x' + 'f'.repeat(64),
      timestamp: 1_700_000_000_000,
    });
  }
  return results;
}

/** axios.post is called as (url, body, config), so the RPC body is argument 1. */
function rpcCalls(method: string): unknown[][] {
  return post.mock.calls.filter((call) => (call[1] as { method: string }).method === method);
}

function sentCalldata(): string[] {
  return rpcCalls('eth_sendTransaction').map(
    (call) => (call[1] as { params: Array<{ data: string }> }).params[0].data,
  );
}

describe('cross-chain message delivery pipeline', () => {
  let queue: MessageQueue;
  let executor: EvmExecutor;

  beforeEach(() => {
    post.mockReset();
    post.mockImplementation(async (_url: string, body: { method: string }) => {
      switch (body.method) {
        case 'eth_sendTransaction':
          return { data: { result: '0x' + 'f'.repeat(64) } };
        case 'eth_getTransactionReceipt':
          return { data: { result: { blockNumber: '0x63', gasUsed: '0x5208' } } };
        case 'eth_blockNumber':
          return { data: { result: '0x64' } };
        default:
          return { data: { result: null } };
      }
    });

    queue = new MessageQueue({ concurrency: 10 });
    queue.on('message-rejected', () => undefined);
    executor = new EvmExecutor({
      chainId: 'ethereum',
      chainType: 'evm',
      rpcUrl: 'http://localhost:8545',
      confirmationBlocks: 1,
      confirmationPollIntervalMs: 1,
    });
  });

  afterEach(() => {
    queue.removeAllListeners();
    executor.removeAllListeners();
  });

  it('delivers only the well-formed messages from a mixed batch', () => {
    const accepted = makeBatch().filter((m) => queue.enqueue(m as CrossChainMessage));
    expect(accepted).toHaveLength(3);
    expect(queue.getPendingCount()).toBe(3);
  });

  it('never sends a transaction for a malformed message', async () => {
    makeBatch().forEach((m) => queue.enqueue(m as CrossChainMessage));
    const results = await drain(queue, executor);

    expect(results.map((result) => result.messageId).sort()).toEqual(['ok-1', 'ok-2', 'ok-3']);
    expect(rpcCalls('eth_sendTransaction')).toHaveLength(3);
  });

  it('never forwards a malformed payload as calldata', async () => {
    makeBatch().forEach((m) => queue.enqueue(m as CrossChainMessage));
    await drain(queue, executor);

    expect(sentCalldata()).toEqual(['0xdeadbeef', '0xdeadbeef', '0xdeadbeef']);
  });

  it('reports every malformed message in the batch for triage', () => {
    const rejections: Array<{ messageId?: string }> = [];
    queue.on('message-rejected', (event) => rejections.push(event));

    makeBatch().forEach((m) => queue.enqueue(m as CrossChainMessage));

    expect(rejections.map((event) => event.messageId)).toEqual([
      'bad-payload',
      'bad-amount',
      'bad-empty',
      'bad-status',
    ]);
  });

  it('does not retry a malformed message, because it was never queued', () => {
    makeBatch().forEach((m) => queue.enqueue(m as CrossChainMessage));
    expect(queue.getFailedCount()).toBe(0);
    expect(queue.getPendingCount()).toBe(3);
  });

  it('keeps the delivery loop healthy when every message is malformed', async () => {
    [makeMessage({ payload: '0xabc' }), { id: 'nothing-else' }].forEach((m) =>
      queue.enqueue(m as CrossChainMessage),
    );

    expect(await drain(queue, executor)).toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });

  it('still rejects a duplicate well-formed message without sending it twice', async () => {
    queue.enqueue(makeMessage({ id: 'once' }));
    expect(queue.enqueue(makeMessage({ id: 'twice' }))).toBe(false);

    await drain(queue, executor);
    expect(rpcCalls('eth_sendTransaction')).toHaveLength(1);
  });

  it('leaves duplicate accounting separate from malformed accounting', () => {
    makeBatch().forEach((m) => queue.enqueue(m as CrossChainMessage));
    queue.enqueue(makeMessage({ id: 'ok-1', sourceLogIndex: 0 }));

    expect(queue.getValidationStats()).toEqual({ checked: 8, accepted: 4, rejected: 4 });
    expect(queue.getDuplicateStats()).toMatchObject({ checked: 4, duplicates: 1 });
  });
});
