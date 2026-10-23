import { UnauthorizedException } from '@nestjs/common';
import { ComplianceAdminGuard } from './compliance-admin.guard';

const ctx = (authorization?: string): any => ({
  switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
});

describe('ComplianceAdminGuard', () => {
  const guard = new ComplianceAdminGuard();
  const original = process.env.COMPLIANCE_ADMIN_SECRET;

  afterEach(() => {
    if (original === undefined) delete process.env.COMPLIANCE_ADMIN_SECRET;
    else process.env.COMPLIANCE_ADMIN_SECRET = original;
  });

  it('fails closed when no secret is configured', () => {
    delete process.env.COMPLIANCE_ADMIN_SECRET;
    expect(() => guard.canActivate(ctx('Bearer anything'))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx('Bearer '))).toThrow(UnauthorizedException);
  });

  it('accepts the correct token', () => {
    process.env.COMPLIANCE_ADMIN_SECRET = 's3cret-value';
    expect(guard.canActivate(ctx('Bearer s3cret-value'))).toBe(true);
  });

  it.each([undefined, '', 'Basic s3cret-value', 'Bearer wrong-value!', 'Bearer s3cret', 'Bearer s3cret-value-extra'])(
    'rejects %p',
    (header) => {
      process.env.COMPLIANCE_ADMIN_SECRET = 's3cret-value';
      expect(() => guard.canActivate(ctx(header))).toThrow(UnauthorizedException);
    },
  );
});
