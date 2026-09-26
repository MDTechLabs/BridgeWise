import { EventEmitter } from 'events';
import {
  WebSocketReconnector,
  WebSocketLike,
  BackfillRange,
} from '../src/websocket-reconnector';

/** Minimal fake WebSocket driven manually by tests. */
class FakeSocket extends EventEmitter implements WebSocketLike {
  closed = false;

  close(): void {
    this.closed = true;
  }

  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  triggerOpen(): void {
    this.emit('open');
  }

  triggerClose(code?: number, reason?: string): void {
    this.emit('close', code, reason);
  }
}

describe('WebSocketReconnector', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('emits open on a successful initial connection', async () => {
    const socket = new FakeSocket();
    const connect = jest.fn().mockResolvedValue(socket);

    const reconnector = new WebSocketReconnector({ chainId: 1, connect });
    const opened = jest.fn();
    reconnector.on('open', opened);

    await reconnector.start();
    socket.triggerOpen();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(reconnector.isConnected).toBe(true);
  });

  it('reconnects with exponential backoff after a connection drop', async () => {
    const sockets = [new FakeSocket(), new FakeSocket()];
    const connect = jest.fn().mockImplementation(() => Promise.resolve(sockets.shift()));

    const reconnector = new WebSocketReconnector({
      chainId: 1,
      connect,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
    });

    const reconnecting = jest.fn();
    const reconnected = jest.fn();
    reconnector.on('reconnecting', reconnecting);
    reconnector.on('reconnected', reconnected);

    const firstSocket = sockets[0];
    await reconnector.start();
    firstSocket.triggerOpen();

    // Simulate a dropped connection.
    firstSocket.triggerClose(1006, 'abnormal closure');

    expect(reconnecting).toHaveBeenCalledTimes(1);
    const { attempt, delayMs } = reconnecting.mock.calls[0][0];
    expect(attempt).toBe(1);
    // 2^1 * 1000 = 2000, plus jitter in [0, 1000)
    expect(delayMs).toBeGreaterThanOrEqual(2000);
    expect(delayMs).toBeLessThan(3000);
    expect(reconnector.isConnected).toBe(false);

    await jest.advanceTimersByTimeAsync(delayMs);

    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('stops attempting to reconnect once maxAttempts is exhausted', async () => {
    const connect = jest.fn().mockRejectedValue(new Error('connection refused'));

    const reconnector = new WebSocketReconnector({
      chainId: 1,
      connect,
      baseDelayMs: 10,
      maxDelayMs: 100,
      maxAttempts: 2,
    });

    const exhausted = jest.fn();
    reconnector.on('exhausted', exhausted);

    await reconnector.start();
    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(100);

    expect(exhausted).toHaveBeenCalledWith({ attempts: 2 });
  });

  it('emits a backfill range covering blocks missed while disconnected', async () => {
    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();
    const sockets = [firstSocket, secondSocket];
    const connect = jest.fn().mockImplementation(() => Promise.resolve(sockets.shift()));

    const reconnector = new WebSocketReconnector({
      chainId: 1,
      connect,
      baseDelayMs: 10,
      getLastProcessedBlock: () => 100,
      getLatestBlock: () => 105,
    });

    const backfills: BackfillRange[] = [];
    reconnector.on('backfill', (range) => backfills.push(range));

    await reconnector.start();
    firstSocket.triggerOpen();

    firstSocket.triggerClose();
    await jest.advanceTimersByTimeAsync(1000);

    secondSocket.triggerOpen();
    // Backfill computation is async; flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(backfills).toEqual([{ chainId: 1, fromBlock: 101, toBlock: 105 }]);
  });

  it('does not reconnect after stop() is called', async () => {
    const socket = new FakeSocket();
    const connect = jest.fn().mockResolvedValue(socket);

    const reconnector = new WebSocketReconnector({ chainId: 1, connect, baseDelayMs: 10 });
    await reconnector.start();
    socket.triggerOpen();

    reconnector.stop();
    expect(socket.closed).toBe(true);

    socket.triggerClose();
    await jest.advanceTimersByTimeAsync(1000);

    // Only the initial connect() call — no reconnect attempt after stop().
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
