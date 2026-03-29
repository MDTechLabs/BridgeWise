import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * WebhookAdminGuard
 * ─────────────────
 * Protects the internal /webhooks/dispatch endpoint (and any other admin
 * webhook routes) behind a pre-shared API key.
 *
 * The key is read from the environment variable WEBHOOK_ADMIN_SECRET.
 * Consumers must supply it as:
 *
 *   Authorization: Bearer <WEBHOOK_ADMIN_SECRET>
 *
 * Usage — apply per route:
 *   @UseGuards(WebhookAdminGuard)
 *   @Post('dispatch')
 *   dispatch(@Body() dto: DispatchEventDto) { ... }
 *
 * Or globally in AppModule / a dedicated admin module guard.
 */
@Injectable()
export class WebhookAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'] ?? '';

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing admin Bearer token');
    }

    const token = authHeader.slice(7);
    const expected = this.config.get<string>('WEBHOOK_ADMIN_SECRET', '');

    if (!expected) {
      throw new UnauthorizedException('WEBHOOK_ADMIN_SECRET is not configured');
    }

    let match = false;
    try {
      match = timingSafeEqual(Buffer.from(token), Buffer.from(expected));
    } catch {
      // Buffers differ in length
      match = false;
    }

    if (!match) throw new UnauthorizedException('Invalid admin token');
    return true;
  }
}
