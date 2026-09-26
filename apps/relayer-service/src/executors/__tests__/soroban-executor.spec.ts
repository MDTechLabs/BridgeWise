import { SorobanExecutor } from '../soroban-executor';
import { CrossChainMessage } from '../../types';

function makeMessage(overrides: Partial<CrossChainMessage> = {}): CrossChainMessage {
  return {
    id: 'msg-soroban-1',
    sourceChainId: 'ethereum',
    destinationChainId: 'stellar',
    sourceTxHash: '0x' + 'a'.repeat(64),
    sourceBlockNumber: 10000000,
    messageType: 'lock',
    payload: '0xdeadbeef',
    sender: 'GAsender',
    recipient: 'GArecipient',
    createdAt: Date.now(),
    status: 'processing',
    retryCount: 0,
    ...overrides,
  };
}

describe('SorobanExecutor', () => {
  let executor: SorobanExecutor;

  beforeEach(() => {
    executor = new SorobanExecutor({
      chainId: 'stellar',
      chainType: 'soroban',
      rpcUrl: 'https://soroban-rpc.example.com',
      gasRepricing: {
        initialGasPrice: '100',
        maxGasPrice: '100000',
        bumpPercentage: 15,
        bumpIntervalBlocks: 5,
        maxBumps: 3,
      },
      confirmationBlocks: 2,
      confirmationPollIntervalMs: 100,
    });
  });

  afterEach(() => {
    executor.removeAllListeners();
  });

  it('initializes with correct chain config', () => {
    expect(executor.getNonce()).toBe(0);
    expect(executor.getCurrentBaseFee()).toBe('100');
  });

  it('updates and returns nonce', () => {
    executor.updateNonce(10);
    expect(executor.getNonce()).toBe(10);
  });

  it('returns transaction status as unconfirmed when RPC fails', async () => {
    const status = await executor.getTransactionStatus('fake-hash');
    expect(status.confirmed).toBe(false);
  });

  it('executes and returns failure result when RPC unavailable', async () => {
    const result = await executor.execute(makeMessage());
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.messageId).toBe('msg-soroban-1');
  });

  it('emits execution-started event', async () => {
    const spy = jest.fn();
    executor.on('execution-started', spy);
    await executor.execute(makeMessage());
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'msg-soroban-1' }));
  });

  it('emits execution-error event on failure', async () => {
    const spy = jest.fn();
    executor.on('execution-error', spy);
    await executor.execute(makeMessage());
    expect(spy).toHaveBeenCalled();
  });

  it('increments base fee on reprice', () => {
    executor['bumpCount'] = 0;
    executor['currentBaseFee'] = BigInt('100');

    executor['handleReprice'](makeMessage(), new Error('insufficient fee'));

    expect(executor.getCurrentBaseFee()).toBe('115');
    expect(executor['bumpCount']).toBe(1);
  });

  it('does not reprice beyond max', () => {
    executor['bumpCount'] = 0;
    executor['currentBaseFee'] = BigInt('90000');

    executor['handleReprice'](makeMessage(), new Error('insufficient fee'));
    executor['handleReprice'](makeMessage(), new Error('insufficient fee'));

    expect(BigInt(executor.getCurrentBaseFee()) <= BigInt('100000')).toBe(true);
  });

  it('emits gas-repriced event', () => {
    const spy = jest.fn();
    executor.on('gas-repriced', spy);
    executor['handleReprice'](makeMessage(), new Error('insufficient fee'));
    expect(spy).toHaveBeenCalled();
  });

  it('emits confirmation-progress event', async () => {
    const spy = jest.fn();
    executor.on('confirmation-progress', spy);
    await executor.execute(makeMessage());
    expect(spy).not.toHaveBeenCalled();
  });
});
