import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { SandboxInterceptor } from './sandbox.interceptor';
import { SandboxService } from './sandbox.service';
import { SandboxScenario } from './sandbox.types';

describe('SandboxInterceptor', () => {
  let interceptor: SandboxInterceptor;
  let service: SandboxService;

  beforeEach(() => {
    service = new SandboxService();
    interceptor = new SandboxInterceptor(service);
  });

  const createMockContext = (
    headers: Record<string, string> = {},
    query: Record<string, string> = {},
    path = '/quotes',
  ) => {
    const responseHeaders: Record<string, string> = {};
    const req: any = {
      headers,
      query,
      path,
    };
    const res: any = {
      setHeader: jest.fn((k: string, v: string) => {
        responseHeaders[k.toLowerCase()] = v;
      }),
      getHeader: jest.fn((k: string) => responseHeaders[k.toLowerCase()]),
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = {
      handle: () => of({ test: 'data' }),
    };

    return { context, next, req, res, responseHeaders };
  };

  it('detects sandbox mode via x-sandbox-mode header and sets response headers', (done) => {
    const { context, next, req, res } = createMockContext({
      'x-sandbox-mode': 'true',
      'x-partner-id': 'acme-corp',
    });

    interceptor.intercept(context, next).subscribe({
      next: (val) => {
        expect(req.sandbox).toBeDefined();
        expect(req.sandbox.isSandbox).toBe(true);
        expect(req.sandbox.partnerId).toBe('acme-corp');
        expect(res.setHeader).toHaveBeenCalledWith('x-sandbox-mode', 'true');
        expect(res.setHeader).toHaveBeenCalledWith('x-sandbox-scenario', SandboxScenario.SUCCESS);
        expect(val).toEqual({ test: 'data' });
        done();
      },
    });
  });

  it('detects sandbox mode via query parameter sandbox=true', (done) => {
    const { context, next, req, res } = createMockContext({}, { sandbox: 'true' });

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(req.sandbox.isSandbox).toBe(true);
        expect(res.setHeader).toHaveBeenCalledWith('x-sandbox-mode', 'true');
        done();
      },
    });
  });

  it('detects sandbox mode via API key prefix sb_', (done) => {
    const { context, next, req, res } = createMockContext({
      'x-api-key': 'sb_partner99_secret',
    });

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(req.sandbox.isSandbox).toBe(true);
        expect(req.sandbox.partnerId).toBe('partner99');
        expect(res.setHeader).toHaveBeenCalledWith('x-sandbox-mode', 'true');
        done();
      },
    });
  });

  it('detects sandbox mode for /sandbox routes automatically', (done) => {
    const { context, next, req, res } = createMockContext({}, {}, '/sandbox/status');

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(req.sandbox.isSandbox).toBe(true);
        expect(res.setHeader).toHaveBeenCalledWith('x-sandbox-mode', 'true');
        done();
      },
    });
  });

  it('does not tag regular non-sandbox requests', (done) => {
    const { context, next, req, res } = createMockContext();

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(req.sandbox).toBeUndefined();
        expect(res.setHeader).not.toHaveBeenCalled();
        done();
      },
    });
  });
});
