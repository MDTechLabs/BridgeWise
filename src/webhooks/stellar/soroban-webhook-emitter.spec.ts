import { SorobanWebhookEmitter } from './soroban-webhook-emitter';
import { NormalizedBridgeEvent } from '../../events/aggregation/stellar';

describe('SorobanWebhookEmitter', () => {
  let emitter: SorobanWebhookEmitter;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
    emitter = new SorobanWebhookEmitter(fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  // ---------------------------------------------------------------------------
  // register
  // ---------------------------------------------------------------------------

  describe('register', () => {
    it('should register a webhook and return a registration with a generated id', () => {
      const reg = emitter.register({
        url: 'https://example.com/hook',
        events: ['transfer.initiated'],
      });
      expect(reg.id).toBeDefined();
      expect(reg.url).toBe('https://example.com/hook');
      expect(reg.events).toEqual(['transfer.initiated']);
      expect(reg.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it('should generate a 64-character hex secret when none is provided', () => {
      const reg = emitter.register({
        url: 'https://example.com/hook',
        events: ['transfer.completed'],
      });
      expect(reg.secret).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should use the provided secret', () => {
      const reg = emitter.register({
        url: 'https://example.com/hook',
        events: ['transfer.completed'],
        secret: 'my-custom-secret',
      });
      expect(reg.secret).toBe('my-custom-secret');
    });

    it('should register multiple distinct webhooks', () => {
      emitter.register({ url: 'https://a.com', events: ['transfer.failed'] });
      emitter.register({ url: 'https://b.com', events: ['bridge.event'] });
      expect(emitter.list()).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // unregister
  // ---------------------------------------------------------------------------

  describe('unregister', () => {
    it('should remove an existing webhook and return true', () => {
      const reg = emitter.register({
        url: 'https://example.com/hook',
        events: ['transfer.failed'],
      });
      expect(emitter.unregister(reg.id)).toBe(true);
      expect(emitter.list()).toHaveLength(0);
    });

    it('should return false for an unknown id', () => {
      expect(emitter.unregister('non-existent-id')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------

  describe('list', () => {
    it('should return an empty array when no webhooks are registered', () => {
      expect(emitter.list()).toEqual([]);
    });

    it('should return all registered webhooks', () => {
      emitter.register({ url: 'https://a.com', events: ['transfer.initiated'] });
      emitter.register({ url: 'https://b.com', events: ['transfer.completed'] });
      expect(emitter.list()).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // emitLifecycleEvent
  // ---------------------------------------------------------------------------

  describe('emitLifecycleEvent', () => {
    it('should deliver to subscribers of the matched lifecycle event type', async () => {
      emitter.register({
        url: 'https://example.com/hook',
        events: ['transfer.completed'],
      });
      const results = await emitter.emitLifecycleEvent('tx-1', 'confirmed', 'completed');
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should not deliver to endpoints not subscribed to the event', async () => {
      emitter.register({
        url: 'https://example.com/hook',
        events: ['transfer.failed'],
      });
      const results = await emitter.emitLifecycleEvent('tx-1', 'confirmed', 'completed');
      expect(results).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should include an HMAC-SHA256 signature header', async () => {
      emitter.register({
        url: 'https://example.com/hook',
        events: ['transfer.initiated'],
        secret: 'test-secret',
      });
      await emitter.emitLifecycleEvent('tx-1', undefined, 'pending');
      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
      expect(options.headers['X-BridgeWise-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should include the event type header', async () => {
      emitter.register({
        url: 'https://example.com/hook',
        events: ['transfer.locked'],
      });
      await emitter.emitLifecycleEvent('tx-1', 'pending', 'locked');
      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
      expect(options.headers['X-BridgeWise-Event']).toBe('transfer.locked');
    });

    it('should handle delivery network errors gracefully', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      emitter.register({
        url: 'https://unreachable.com/hook',
        events: ['transfer.failed'],
      });
      const results = await emitter.emitLifecycleEvent('tx-1', 'submitted', 'failed');
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('ECONNREFUSED');
    });

    it('should include the status code when the server responds with a non-2xx', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 } as unknown as Response);
      emitter.register({
        url: 'https://example.com/hook',
        events: ['transfer.confirmed'],
      });
      const results = await emitter.emitLifecycleEvent('tx-1', 'submitted', 'confirmed');
      expect(results[0].success).toBe(false);
      expect(results[0].statusCode).toBe(500);
    });

    it('should dispatch to multiple subscribers in parallel', async () => {
      emitter.register({ url: 'https://a.com', events: ['transfer.completed'] });
      emitter.register({ url: 'https://b.com', events: ['transfer.completed'] });
      const results = await emitter.emitLifecycleEvent('tx-1', 'confirmed', 'completed');
      expect(results).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should pass fromState and toState in the payload body', async () => {
      emitter.register({
        url: 'https://example.com/hook',
        events: ['transfer.validated'],
      });
      await emitter.emitLifecycleEvent('tx-42', 'locked', 'validated', { memo: 'test' });
      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.data.transferId).toBe('tx-42');
      expect(body.data.fromState).toBe('locked');
      expect(body.data.toState).toBe('validated');
      expect(body.data.metadata).toEqual({ memo: 'test' });
    });
  });

  // ---------------------------------------------------------------------------
  // emitBridgeEvent
  // ---------------------------------------------------------------------------

  describe('emitBridgeEvent', () => {
    it('should deliver to bridge.event subscribers', async () => {
      emitter.register({
        url: 'https://example.com/hook',
        events: ['bridge.event'],
      });
      const bridgeEvent: NormalizedBridgeEvent = {
        id: 'evt_1',
        source: 'soroban',
        type: 'transfer',
        from: 'GABC',
        to: 'GDEF',
        amount: '100',
        asset: 'USDC',
        contractId: 'CXYZ',
        timestamp: Date.now(),
        rawPayload: {},
      };
      const results = await emitter.emitBridgeEvent(bridgeEvent);
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });

    it('should not deliver to non-bridge.event subscribers', async () => {
      emitter.register({
        url: 'https://example.com/hook',
        events: ['transfer.completed'],
      });
      const bridgeEvent: NormalizedBridgeEvent = {
        id: 'evt_2',
        source: 'soroban',
        type: 'mint',
        from: 'GABC',
        to: 'GDEF',
        amount: '50',
        asset: 'XLM',
        contractId: 'CABC',
        timestamp: Date.now(),
        rawPayload: {},
      };
      const results = await emitter.emitBridgeEvent(bridgeEvent);
      expect(results).toHaveLength(0);
    });
  });

  describe('Backoff retries and Duplicate protection', () => {
    it('should retry on failure and eventually succeed if fetch succeeds', async () => {
      fetchMock
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, status: 200 } as unknown as Response);

      emitter = new SorobanWebhookEmitter(fetchMock, {
        maxRetries: 3,
        initialDelayMs: 1,
        backoffFactor: 2,
      });

      emitter.register({
        url: 'https://example.com/hook',
        events: ['transfer.completed'],
      });

      const results = await emitter.emitLifecycleEvent('tx-1', 'confirmed', 'completed');
      expect(results[0].success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should skip duplicate deliveries to the same registration', async () => {
      emitter = new SorobanWebhookEmitter(fetchMock);
      const reg = emitter.register({
        url: 'https://example.com/hook',
        events: ['transfer.completed'],
      });

      const payload = {
        id: 'duplicate-payload-id',
        event: 'transfer.completed' as any,
        timestamp: Date.now(),
        data: {},
      };

      const result1 = await emitter['deliverWithRetry'](reg, payload);
      expect(result1.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const result2 = await emitter['deliverWithRetry'](reg, payload);
      expect(result2.success).toBe(true);
      expect(result2.error).toBe('Duplicate delivery skipped');
      expect(fetchMock).toHaveBeenCalledTimes(1); // Still 1 fetch call total!
    });
  });
});
