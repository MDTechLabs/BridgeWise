import {
  QuoteRequestBatcherService,
  QuoteRequest,
  batchKey,
} from './quote-request-batcher.service';

function req(id: string, provider: string, src = 'XLM', dst = 'USDC'): QuoteRequest {
  return { requestId: id, providerId: provider, sourceAsset: src, destinationAsset: dst, amount: '100' };
}

describe('QuoteRequestBatcherService', () => {
  let svc: QuoteRequestBatcherService;
  beforeEach(() => {
    svc = new QuoteRequestBatcherService();
  });

  it('groups compatible requests by provider + asset pair', () => {
    const groups = svc.group([
      req('1', 'pA'),
      req('2', 'pA'),
      req('3', 'pB'),
      req('4', 'pA', 'XLM', 'EURC'),
    ]);
    expect(groups.get(batchKey(req('x', 'pA')))?.map((r) => r.requestId)).toEqual(['1', '2']);
    expect(groups.size).toBe(3);
  });

  it('executes batches and preserves individual results', async () => {
    const executor = jest.fn(async (_provider: string, batch: QuoteRequest[]) => {
      const map = new Map<string, { rate: number }>();
      for (const r of batch) map.set(r.requestId, { rate: 1.1 });
      return map;
    });
    const results = await svc.execute([req('1', 'pA'), req('2', 'pA')], executor);
    expect(executor).toHaveBeenCalledTimes(1); // one batch
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('isolates partial failures to the failing batch', async () => {
    const executor = jest.fn(async (provider: string, batch: QuoteRequest[]) => {
      if (provider === 'pB') throw new Error('provider down');
      const map = new Map<string, unknown>();
      for (const r of batch) map.set(r.requestId, { ok: true });
      return map as Map<string, unknown>;
    });
    const results = await svc.execute([req('1', 'pA'), req('2', 'pB')], executor);
    const byId = Object.fromEntries(results.map((r) => [r.requestId, r]));
    expect(byId['1'].success).toBe(true);
    expect(byId['2'].success).toBe(false);
    expect(byId['2'].error).toMatch(/provider down/);
  });

  it('marks requests with no returned quote as failed', async () => {
    const executor = async () => new Map<string, unknown>();
    const results = await svc.execute([req('1', 'pA')], executor);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toMatch(/No quote/);
  });
});
