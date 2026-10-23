import { BadRequestException, ConflictException } from '@nestjs/common';
import { TraceCorrelationService } from './trace-correlation.service';
import {
  MAX_LINKS_PER_TRACE,
  MAX_STEPS_PER_TRACE,
  MAX_TRACES,
  TRACE_TTL_MS,
} from './trace-correlation.constants';

describe('TraceCorrelationService', () => {
  let service: TraceCorrelationService;
  const NOW = 1_700_000_000_000;
  const T1 = 'trace-0001';

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    service = new TraceCorrelationService();
  });

  afterEach(() => jest.useRealTimers());

  describe('startTrace', () => {
    it('creates a trace and links the request id', () => {
      const trace = service.startTrace(T1, 'req-1');
      expect(trace.traceId).toBe(T1);
      expect(trace.status).toBe('in_progress');
      expect(trace.links).toMatchObject([{ type: 'requestId', value: 'req-1' }]);
    });

    it('is idempotent', () => {
      service.startTrace(T1);
      service.startTrace(T1);
      expect(service.size()).toBe(1);
    });

    it.each(['', 'short', 'bad id!!', 'x'.repeat(65)])('rejects trace id %p', (bad) => {
      expect(() => service.startTrace(bad)).toThrow(BadRequestException);
    });
  });

  describe('link / resolve', () => {
    beforeEach(() => service.startTrace(T1));

    it('resolves a trace by any linked identifier', () => {
      service.link(T1, 'requestId', 'req-1');
      service.link(T1, 'transactionId', 'tx-42');
      service.link(T1, 'quoteId', 'quote-9');
      for (const id of ['req-1', 'tx-42', 'quote-9', T1]) {
        expect(service.getTrace(id)?.traceId).toBe(T1);
      }
    });

    it('matches tx hashes case-insensitively and records the chain', () => {
      service.link(T1, 'txHash', '0xABCDEF', 'Ethereum');
      const trace = service.getTrace('0xabcdef')!;
      expect(trace.links[0]).toMatchObject({ type: 'txHash', value: '0xabcdef', chain: 'ethereum' });
      expect(service.getTrace('0xABCDEF')?.traceId).toBe(T1);
    });

    it('does not lower-case non-hash identifiers', () => {
      service.link(T1, 'transactionId', 'TX-Mixed');
      expect(service.getTrace('tx-mixed')).toBeUndefined();
      expect(service.getTrace('TX-Mixed')).toBeDefined();
    });

    it('treats re-linking to the same trace as a no-op', () => {
      service.link(T1, 'requestId', 'req-1');
      service.link(T1, 'requestId', 'req-1');
      expect(service.getTrace(T1)!.links).toHaveLength(1);
    });

    it('rejects linking an identifier owned by another trace', () => {
      service.startTrace('trace-0002');
      service.link(T1, 'txHash', '0xdead');
      expect(() => service.link('trace-0002', 'txHash', '0xdead')).toThrow(ConflictException);
      expect(service.getTrace('0xdead')?.traceId).toBe(T1);
    });

    it('refuses to resolve an ambiguous identifier', () => {
      service.startTrace('trace-0002');
      service.link(T1, 'requestId', 'shared');
      service.link('trace-0002', 'transferId', 'shared');
      expect(service.resolve('shared')).toBeUndefined();
    });

    it('returns undefined for unknown identifiers', () => {
      expect(service.getTrace('nope')).toBeUndefined();
    });

    it('rejects unknown traces, link types and malformed values', () => {
      expect(() => service.link('trace-9999', 'requestId', 'r')).toThrow(BadRequestException);
      expect(() => service.link(T1, 'bogus' as any, 'r')).toThrow(BadRequestException);
      expect(() => service.link(T1, 'requestId', 'has space')).toThrow(BadRequestException);
      expect(() => service.link(T1, 'requestId', 'a', 'Bad Chain')).toThrow(BadRequestException);
      expect(() => service.resolve('../etc/passwd')).toThrow(BadRequestException);
    });

    it('caps links per trace', () => {
      for (let i = 0; i < MAX_LINKS_PER_TRACE; i++) service.link(T1, 'quoteId', `q${i}`);
      expect(() => service.link(T1, 'quoteId', 'overflow')).toThrow(BadRequestException);
    });
  });

  describe('steps and status', () => {
    beforeEach(() => service.startTrace(T1));

    it('is completed when every step succeeded', () => {
      service.recordStep(T1, { name: 'quote', status: 'succeeded' });
      service.recordStep(T1, { name: 'submit', status: 'succeeded', chain: 'stellar', durationMs: 120 });
      expect(service.getTrace(T1)!.status).toBe('completed');
    });

    it('is in_progress while a step has only started', () => {
      service.recordStep(T1, { name: 'submit', status: 'started', chain: 'stellar' });
      expect(service.getTrace(T1)!.status).toBe('in_progress');
    });

    it('uses the latest status per step and chain', () => {
      service.recordStep(T1, { name: 'submit', status: 'started', chain: 'stellar' });
      service.recordStep(T1, { name: 'submit', status: 'succeeded', chain: 'stellar' });
      expect(service.getTrace(T1)!.status).toBe('completed');
    });

    it('is failed when any step failed, and truncates the error', () => {
      service.recordStep(T1, { name: 'quote', status: 'succeeded' });
      service.recordStep(T1, { name: 'submit', status: 'failed', error: 'x'.repeat(2000) });
      const trace = service.getTrace(T1)!;
      expect(trace.status).toBe('failed');
      expect(trace.steps[1].error).toHaveLength(500);
    });

    it('lists the distinct chains from links and steps, sorted', () => {
      service.link(T1, 'txHash', '0xaaa', 'stellar');
      service.recordStep(T1, { name: 'bridge', status: 'succeeded', chain: 'ethereum' });
      service.recordStep(T1, { name: 'bridge2', status: 'succeeded', chain: 'stellar' });
      expect(service.getTrace(T1)!.chains).toEqual(['ethereum', 'stellar']);
    });

    it('rejects invalid steps', () => {
      expect(() => service.recordStep(T1, { name: '', status: 'started' })).toThrow(BadRequestException);
      expect(() => service.recordStep(T1, { name: 'x'.repeat(65), status: 'started' })).toThrow(BadRequestException);
      expect(() => service.recordStep(T1, { name: 'x', status: 'weird' as any })).toThrow(BadRequestException);
      expect(() => service.recordStep(T1, { name: 'x', status: 'started', durationMs: -1 })).toThrow(BadRequestException);
      expect(() => service.recordStep(T1, { name: 'x', status: 'started', durationMs: NaN })).toThrow(BadRequestException);
    });

    it('accepts zero duration and caps steps per trace', () => {
      expect(() => service.recordStep(T1, { name: 'x', status: 'started', durationMs: 0 })).not.toThrow();
      for (let i = 1; i < MAX_STEPS_PER_TRACE; i++) service.recordStep(T1, { name: 'x', status: 'started' });
      expect(() => service.recordStep(T1, { name: 'x', status: 'started' })).toThrow(BadRequestException);
    });

    it('returns copies so callers cannot mutate stored state', () => {
      service.link(T1, 'requestId', 'req-1');
      const view = service.getTrace(T1)!;
      view.links.length = 0;
      expect(service.getTrace(T1)!.links).toHaveLength(1);
    });
  });

  describe('retention', () => {
    it('expires traces and frees their identifiers after the TTL', () => {
      service.startTrace(T1, 'req-1');
      jest.setSystemTime(NOW + TRACE_TTL_MS + 1);
      expect(service.getTrace('req-1')).toBeUndefined();
      expect(service.size()).toBe(0);
      // identifier can now be reused by a new trace
      service.startTrace('trace-0002', 'req-1');
      expect(service.getTrace('req-1')?.traceId).toBe('trace-0002');
    });

    it('keeps a trace exactly at the TTL boundary', () => {
      service.startTrace(T1);
      jest.setSystemTime(NOW + TRACE_TTL_MS);
      expect(service.getTrace(T1)).toBeDefined();
    });

    it('evicts the oldest trace at capacity', () => {
      for (let i = 0; i < MAX_TRACES; i++) service.startTrace(`trace-${String(i).padStart(6, '0')}`);
      service.link('trace-000000', 'requestId', 'first');
      service.startTrace('trace-overflow');
      expect(service.size()).toBe(MAX_TRACES);
      expect(service.getTrace('trace-000000')).toBeUndefined();
      expect(service.getTrace('first')).toBeUndefined();
      expect(service.getTrace('trace-overflow')).toBeDefined();
    });
  });
});
