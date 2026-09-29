import { EVMLogSubscriber } from './evm-log-subscriber';
import { StellarEventSubscriber } from './stellar-event-subscriber';

describe.each([EVMLogSubscriber, StellarEventSubscriber])(
  '%p reconnection',
  (Subscriber) => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('resolves after reconnecting and emits the attempt number', async () => {
      const subscriber = new Subscriber({
        rpcWsUrl: 'ws://localhost',
        contractAddresses: [],
        initialBackoffMs: 10,
      });
      const onReconnect = jest.fn();
      subscriber.on('reconnected', onReconnect);

      const reconnect = subscriber.handleDisconnect();
      await jest.advanceTimersByTimeAsync(10);
      await reconnect;

      expect(subscriber.getIsConnected()).toBe(true);
      expect(onReconnect).toHaveBeenCalledWith({ attempt: 1 });
      subscriber.disconnect();
    });

    it('rejects the pending reconnection when connecting fails', async () => {
      const subscriber = new Subscriber({
        rpcWsUrl: 'ws://localhost',
        contractAddresses: [],
        initialBackoffMs: 10,
      });
      const error = new Error('Connection failed');
      jest.spyOn(subscriber, 'connect').mockRejectedValue(error);
      const onReconnect = jest.fn();
      subscriber.on('reconnected', onReconnect);

      const assertion = expect(subscriber.handleDisconnect()).rejects.toBe(error);
      await jest.advanceTimersByTimeAsync(10);
      await assertion;

      expect(onReconnect).not.toHaveBeenCalled();
      subscriber.disconnect();
    });
  },
);
