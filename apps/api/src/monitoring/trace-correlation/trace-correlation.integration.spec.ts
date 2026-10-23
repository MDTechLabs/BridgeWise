import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TraceContextMiddleware } from './trace-context.middleware';
import { TraceCorrelationController } from './trace-correlation.controller';
import { TraceCorrelationModule } from './trace-correlation.module';
import { TraceCorrelationService } from './trace-correlation.service';

describe('Trace correlation (integration)', () => {
  let controller: TraceCorrelationController;
  let service: TraceCorrelationService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [TraceCorrelationModule] }).compile();
    controller = moduleRef.get(TraceCorrelationController);
    service = moduleRef.get(TraceCorrelationService);
  });

  it('follows a transaction from inbound request to per-chain hashes', () => {
    // 1. request enters the API
    const req: any = { headers: { 'x-trace-id': 'client-trace-77' }, id: 'req-abc' };
    const res: any = { setHeader: jest.fn() };
    new TraceContextMiddleware().use(req, res, jest.fn());
    expect(res.setHeader).toHaveBeenCalledWith('X-Trace-Id', 'client-trace-77');

    // 2. services handling the transaction correlate their identifiers
    service.startTrace(req.traceId, req.id);
    service.link(req.traceId, 'transactionId', 'tx-100');
    service.link(req.traceId, 'txHash', '0xSOURCEHASH', 'ethereum');
    service.recordStep(req.traceId, { name: 'source-submit', status: 'succeeded', chain: 'ethereum', durationMs: 900 });
    service.link(req.traceId, 'txHash', '0xDESTHASH', 'stellar');
    service.recordStep(req.traceId, { name: 'dest-receive', status: 'failed', chain: 'stellar', error: 'timeout' });

    // 3. operators look it up by any identifier
    for (const id of ['client-trace-77', 'req-abc', 'tx-100', '0xsourcehash', '0xDESTHASH']) {
      const trace = controller.getTrace(id);
      expect(trace.traceId).toBe('client-trace-77');
      expect(trace.chains).toEqual(['ethereum', 'stellar']);
      expect(trace.status).toBe('failed');
      expect(trace.links).toHaveLength(4);
    }
  });

  it('returns 404 for an unknown identifier', () => {
    expect(() => controller.getTrace('missing-id')).toThrow(NotFoundException);
  });

  it('returns 400 for a malformed identifier', () => {
    expect(() => controller.getTrace('bad id')).toThrow(BadRequestException);
    expect(() => controller.getTrace('x'.repeat(129))).toThrow(BadRequestException);
  });
});
