import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ChainLatencyController } from './chain-latency.controller';
import { ChainLatencyModule } from './chain-latency.module';
import { ChainLatencyQueryDto } from './chain-latency-query.dto';
import { ChainLatencyService } from './chain-latency.service';
import { MAX_SERIES_BUCKETS, MAX_WINDOW_MS, MIN_WINDOW_MS } from './chain-latency.constants';

describe('ChainLatencyModule (integration)', () => {
  let controller: ChainLatencyController;
  let service: ChainLatencyService;

  // Mirrors the global pipe configured in main.ts
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const parse = (query: Record<string, string>) =>
    pipe.transform(query, { type: 'query', metatype: ChainLatencyQueryDto }) as Promise<ChainLatencyQueryDto>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ChainLatencyModule] }).compile();
    controller = moduleRef.get(ChainLatencyController);
    service = moduleRef.get(ChainLatencyService);
  });

  it('serves data recorded through the service via the controller', async () => {
    await service.track('stellar', async () => 'ok', 'rpc');
    await service.track('ethereum', async () => { throw new Error('rpc down'); }).catch(() => undefined);

    const overview = controller.getOverview(await parse({}));
    expect(overview.totals.chains).toBe(2);
    expect(overview.chains[0].chain).toBe('ethereum');

    const detail = controller.getChain('Stellar', await parse({ buckets: '4' }));
    expect(detail.chain).toBe('stellar');
    expect(detail.timeSeries).toHaveLength(4);
    expect(detail.byOperation.rpc.count).toBe(1);
  });

  it('returns 404 for an unknown chain', async () => {
    expect(() => controller.getChain('solana', {})).toThrow(NotFoundException);
  });

  it('returns 400 for a malformed chain id', () => {
    expect(() => controller.getChain('../etc', {})).toThrow(BadRequestException);
  });

  it.each([
    { windowMs: String(MIN_WINDOW_MS - 1) },
    { windowMs: String(MAX_WINDOW_MS + 1) },
    { windowMs: 'abc' },
    { buckets: '0' },
    { buckets: String(MAX_SERIES_BUCKETS + 1) },
    { extra: '1' },
  ])('rejects invalid query %p', async (query) => {
    await expect(parse(query)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts boundary query values', async () => {
    await expect(
      parse({ windowMs: String(MIN_WINDOW_MS), buckets: String(MAX_SERIES_BUCKETS) }),
    ).resolves.toBeDefined();
  });
});
