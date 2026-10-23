import { timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Restricts compliance endpoints to callers presenting
 * `Authorization: Bearer <COMPLIANCE_ADMIN_SECRET>`. Fails closed: when the
 * secret is not configured every request is rejected.
 */
@Injectable()
export class ComplianceAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.COMPLIANCE_ADMIN_SECRET;
    if (!expected) throw new UnauthorizedException('Compliance access is not configured');

    const header = context.switchToHttp().getRequest<Request>().headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');

    const given = Buffer.from(header.slice(7));
    const wanted = Buffer.from(expected);
    // timingSafeEqual requires equal lengths; unequal lengths can never match.
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
      throw new UnauthorizedException('Invalid compliance token');
    }
    return true;
  }
}
