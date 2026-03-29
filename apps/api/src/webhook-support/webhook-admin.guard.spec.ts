import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookAdminGuard } from '../guards/webhook-admin.guard';

const makeContext = (authHeader?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authHeader ? { authorization: authHeader } : {},
      }),
    }),
  } as unknown as ExecutionContext);

const makeGuard = (secret = 'admin-secret-key') => {
  const config = { get: jest.fn().mockReturnValue(secret) } as unknown as ConfigService;
  return new WebhookAdminGuard(config);
};

describe('WebhookAdminGuard', () => {
  it('allows a request with the correct Bearer token', () => {
    const guard = makeGuard('my-admin-secret');
    expect(guard.canActivate(makeContext('Bearer my-admin-secret'))).toBe(true);
  });

  it('throws when the Authorization header is missing', () => {
    expect(() => makeGuard().canActivate(makeContext())).toThrow(UnauthorizedException);
  });

  it('throws when the scheme is not Bearer', () => {
    expect(() => makeGuard().canActivate(makeContext('Basic dXNlcjpwYXNz'))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws when the token does not match', () => {
    const guard = makeGuard('correct-secret');
    expect(() => guard.canActivate(makeContext('Bearer wrong-token'))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws when WEBHOOK_ADMIN_SECRET is not set', () => {
    const config = { get: jest.fn().mockReturnValue('') } as unknown as ConfigService;
    const guard = new WebhookAdminGuard(config);
    expect(() => guard.canActivate(makeContext('Bearer anything'))).toThrow(
      UnauthorizedException,
    );
  });

  it('handles tokens of different lengths without throwing (timing-safe)', () => {
    const guard = makeGuard('short');
    expect(() =>
      guard.canActivate(makeContext('Bearer this-is-a-much-longer-token-than-expected')),
    ).toThrow(UnauthorizedException);
  });
});
