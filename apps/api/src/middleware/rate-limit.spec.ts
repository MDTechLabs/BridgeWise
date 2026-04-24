import { RateLimitMiddleware } from './rate-limit';
import { Request, Response } from 'express';

const createRequest = (ip = '127.0.0.1', headers: Record<string, string> = {}) => {
  const request = {
    ip,
    headers,
    header(name: string) {
      return headers[name.toLowerCase()];
    },
    connection: { remoteAddress: ip },
  } as unknown as Request;

  return request;
};

const createResponse = () => {
  const res: Partial<Response> = {
    headers: {},
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  };

  return res as Response;
};

describe('RateLimitMiddleware', () => {
  it('allows requests under the limit', () => {
    const middleware = new RateLimitMiddleware({ windowMs: 10000, maxRequests: 3 });
    const req = createRequest('127.0.0.1');
    const res = createResponse();
    const next = jest.fn();

    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '3');
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '2');
  });

  it('blocks requests above the limit', () => {
    const middleware = new RateLimitMiddleware({ windowMs: 10000, maxRequests: 2 });
    const req = createRequest('127.0.0.1');
    const res = createResponse();
    const next = jest.fn();

    middleware.use(req, res, next);
    middleware.use(req, res, next);
    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 429,
      message: 'Too many requests, please try again later.',
    });
  });

  it('keys requests by user identifier when provided', () => {
    const middleware = new RateLimitMiddleware({ windowMs: 10000, maxRequests: 1 });
    const req1 = createRequest('127.0.0.1', { 'x-user-id': 'user-abc' });
    const req2 = createRequest('127.0.0.2', { 'x-user-id': 'user-abc' });
    const res1 = createResponse();
    const res2 = createResponse();
    const next = jest.fn();

    middleware.use(req1, res1, next);
    middleware.use(req2, res2, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res2.status).not.toHaveBeenCalledWith(429);
  });
});
