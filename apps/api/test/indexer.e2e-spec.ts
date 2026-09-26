import { StellarEventSubscriber } from '../src/indexer/stellar-event-subscriber';
import { EVMLogSubscriber } from '../src/indexer/evm-log-subscriber';
import { BridgeStatusGateway, ConnectedClient } from '../src/indexer/bridge-status-gateway';

describe('Real-Time Cross-Chain Event Indexer (e2e)', () => {
  let stellarSubscriber: StellarEventSubscriber;
  let evmSubscriber: EVMLogSubscriber;
  let gateway: BridgeStatusGateway;

  beforeEach(async () => {
    stellarSubscriber = new StellarEventSubscriber({
      rpcWsUrl: 'wss://soroban-testnet.stellar.org',
      contractAddresses: ['CSTELLAR_BRIDGE_CONTRACT'],
      reconnectMaxAttempts: 3,
      initialBackoffMs: 20,
    });

    evmSubscriber = new EVMLogSubscriber({
      rpcWsUrl: 'wss://mainnet.infura.io/ws/v3/mock',
      contractAddresses: ['0x1111222233334444555566667777888899990000'],
      reconnectMaxAttempts: 3,
      initialBackoffMs: 20,
    });

    await stellarSubscriber.connect();
    await evmSubscriber.connect();

    gateway = new BridgeStatusGateway(stellarSubscriber, evmSubscriber);
  });

  afterEach(() => {
    stellarSubscriber.disconnect();
    evmSubscriber.disconnect();
  });

  it('subscribes to and processes contract events within 1.5 seconds of block inclusion', async () => {
    const receivedMessages: string[] = [];
    const mockClient: ConnectedClient = {
      id: 'client-1',
      send: (msg) => receivedMessages.push(msg),
    };

    gateway.registerClient(mockClient);

    const startTime = Date.now();

    // Trigger contract log events for Deposit, MessageSent, TokensClaimed
    stellarSubscriber.simulateEvent({
      txHash: '0xstellar_tx_123',
      topic: 'Deposit',
      status: 'Pending',
    });

    evmSubscriber.simulateEvent({
      txHash: '0xevm_tx_456',
      topic: 'MessageSent',
      status: 'In-Flight',
    });

    stellarSubscriber.simulateEvent({
      txHash: '0xstellar_tx_123',
      topic: 'TokensClaimed',
      status: 'Completed',
    });

    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(1500); // Processed within 1.5s
    expect(receivedMessages.length).toBe(3);

    const parsedFirst = JSON.parse(receivedMessages[0]);
    expect(parsedFirst.data.txHash).toBe('0xstellar_tx_123');
    expect(parsedFirst.data.topic).toBe('Deposit');
    expect(parsedFirst.data.status).toBe('Pending');

    expect(gateway.getTransactionState('0xstellar_tx_123')).toBe('Completed');
    expect(gateway.getTransactionState('0xevm_tx_456')).toBe('In-Flight');
  });

  it('reconnects automatically with exponential backoff on RPC WebSocket disconnects', async () => {
    expect(stellarSubscriber.getIsConnected()).toBe(true);

    const reconnectPromise = new Promise<void>((resolve) => {
      stellarSubscriber.once('reconnected', (data) => {
        expect(data.attempt).toBe(1);
        resolve();
      });
    });

    // Simulate disconnect
    await stellarSubscriber.handleDisconnect();
    await reconnectPromise;

    expect(stellarSubscriber.getIsConnected()).toBe(true);
    expect(stellarSubscriber.getReconnectAttempts()).toBe(0); // Reset after successful reconnect
  });

  it('handles client targeting based on subscribed transaction hashes', () => {
    const messagesClientA: string[] = [];
    const messagesClientB: string[] = [];

    const clientA: ConnectedClient = {
      id: 'client-a',
      subscribedTxHashes: new Set(['0xtx_target_a']),
      send: (msg) => messagesClientA.push(msg),
    };

    const clientB: ConnectedClient = {
      id: 'client-b',
      subscribedTxHashes: new Set(['0xtx_target_b']),
      send: (msg) => messagesClientB.push(msg),
    };

    gateway.registerClient(clientA);
    gateway.registerClient(clientB);

    evmSubscriber.simulateEvent({
      txHash: '0xtx_target_a',
      status: 'Completed',
    });

    expect(messagesClientA.length).toBe(1);
    expect(messagesClientB.length).toBe(0);
  });
});
