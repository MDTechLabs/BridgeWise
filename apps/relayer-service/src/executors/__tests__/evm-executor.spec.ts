import { EvmExecutor } from '../evm-executor';
import { CrossChainMessage } from '../../types';

function makeMessage(overrides: Partial<CrossChainMessage> = {}): CrossChainMessage {
  return {
    id: 'msg-evm-1',
    sourceChainId: 'ethereum',
    destinationChainId: 'stellar',
    sourceTxHash: '0x' + 'a'.repeat(64),
    sourceBlockNumber: 10000000,
    messageType: 'lock',
    payload: '0xdeadbeef',
    sender: '0xsender',
    recipient: '0xrecipient',
    createdAt: Date.now(),
    status: 'processing',
    retryCount: 0,
    ...overrides,
  };
}

describe('EvmExecutor', () => {
  let executor: EvmExecutor;

  beforeEach(() => {
    executor = new EvmExecutor({
      chainId: 'ethereum',
      chainType: 'evm',
      rpcUrl: 'https://rpc.ankr.com/eth',
      gasRepricing: {
        initialGasPrice: '50000000000',
        maxGasPrice: '500000000000',
        bumpPercentage: 10,
        bumpIntervalBlocks: 3,
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
    expect(executor.getCurrentGasPrice()).toBe('50000000000');
  });

  it('updates and returns nonce', () => {
    executor.updateNonce(5);
    expect(executor.getNonce()).toBe(5);
  });

  it('returns transaction status as unconfirmed when RPC fails', async () => {
    const status = await executor.getTransactionStatus('0xfake');
    expect(status.confirmed).toBe(false);
  });

  it('executes and returns failure result when RPC unavailable', async () => {
    const result = await executor.execute(makeMessage());
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.messageId).toBe('msg-evm-1');
  });

  it('emits execution-started event', async () => {
    const spy = jest.fn();
    executor.on('execution-started', spy);
    await executor.execute(makeMessage());
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'msg-evm-1' }));
  });

  it('emits execution-error event on failure', async () => {
    const spy = jest.fn();
    executor.on('execution-error', spy);
    await executor.execute(makeMessage());
    expect(spy).toHaveBeenCalled();
  });

  it('increments gas price on reprice', () => {
    executor['bumpCount'] = 0;
    executor['currentGasPrice'] = BigInt('50000000000');

    executor['handleReprice'](makeMessage(), new Error('nonce too low'));

    expect(executor.getCurrentGasPrice()).toBe('55000000000');
    expect(executor['bumpCount']).toBe(1);
  });

  it('does not reprice beyond max', () => {
    executor['bumpCount'] = 0;
    executor['currentGasPrice'] = BigInt('490000000000');

    executor['handleReprice'](makeMessage(), new Error('nonce too low'));
    executor['handleReprice'](makeMessage(), new Error('nonce too low'));

    expect(BigInt(executor.getCurrentGasPrice()) <= BigInt('500000000000')).toBe(true);
  });

  it('emits gas-repriced event', () => {
    const spy = jest.fn();
    executor.on('gas-repriced', spy);
    executor['handleReprice'](makeMessage(), new Error('nonce too low'));
    expect(spy).toHaveBeenCalled();
  });
});
