import { resolveTraceId } from './trace-context';
import { TraceContextMiddleware } from './trace-context.middleware';

const W3C_ID = '4bf92f3577b34da6a3ce929d0e0e4736';

describe('resolveTraceId', () => {
  it('uses a valid X-Trace-Id (lower-cased)', () => {
    expect(resolveTraceId({ 'x-trace-id': 'ABCDEF12-3456' })).toBe('abcdef12-3456');
  });

  it('uses the trace id from a W3C traceparent', () => {
    expect(resolveTraceId({ traceparent: `00-${W3C_ID}-00f067aa0ba902b7-01` })).toBe(W3C_ID);
  });

  it('prefers X-Trace-Id over traceparent', () => {
    const id = resolveTraceId({
      'x-trace-id': 'my-trace-1234',
      traceparent: `00-${W3C_ID}-00f067aa0ba902b7-01`,
    });
    expect(id).toBe('my-trace-1234');
  });

  it('reads the first value of a repeated header', () => {
    expect(resolveTraceId({ 'x-trace-id': ['first-trace-1', 'second-trace'] })).toBe('first-trace-1');
  });

  it.each([
    'short',
    'has space in it',
    '<script>alert(1)</script>',
    'x'.repeat(65),
    'line\r\nbreak-injected',
  ])('ignores malformed X-Trace-Id %p and generates a new id', (bad) => {
    const id = resolveTraceId({ 'x-trace-id': bad });
    expect(id).not.toContain(bad);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('ignores an all-zero or malformed traceparent', () => {
    for (const tp of [`00-${'0'.repeat(32)}-00f067aa0ba902b7-01`, 'garbage', `00-${W3C_ID}-short-01`]) {
      expect(resolveTraceId({ traceparent: tp })).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('generates distinct ids when nothing is supplied', () => {
    expect(resolveTraceId({})).not.toBe(resolveTraceId({}));
  });
});

describe('TraceContextMiddleware', () => {
  it('sets req.traceId and the response header, then continues', () => {
    const req: any = { headers: { 'x-trace-id': 'inbound-trace-1' } };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    new TraceContextMiddleware().use(req, res, next);

    expect(req.traceId).toBe('inbound-trace-1');
    expect(res.setHeader).toHaveBeenCalledWith('X-Trace-Id', 'inbound-trace-1');
    expect(next).toHaveBeenCalledTimes(1);
  });
});
