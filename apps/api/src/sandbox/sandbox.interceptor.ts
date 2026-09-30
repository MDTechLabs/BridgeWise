import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { SandboxService } from './sandbox.service';
import { SandboxScenario } from './sandbox.types';

export interface SandboxRequestContext {
  isSandbox: boolean;
  partnerId: string;
  scenario: SandboxScenario;
  requestId: string;
}

/**
 * Partner Sandbox Interceptor
 * Detects sandbox mode from headers or query parameters, isolates the request context,
 * and stamps sandbox verification headers on outgoing responses.
 */
@Injectable()
export class SandboxInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SandboxInterceptor.name);

  constructor(private readonly sandboxService: SandboxService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const isSandbox = this.detectSandboxMode(request);
    const partnerId = this.extractPartnerId(request);

    if (isSandbox) {
      const partnerConfig = this.sandboxService.getPartnerConfig(partnerId);
      const requestedScenario = (request.headers['x-sandbox-scenario'] as SandboxScenario) || partnerConfig.activeScenario;
      const sandboxRequestId = `sb_req_${randomUUID().slice(0, 8)}`;

      const sandboxContext: SandboxRequestContext = {
        isSandbox: true,
        partnerId,
        scenario: requestedScenario,
        requestId: sandboxRequestId,
      };

      (request as any).sandbox = sandboxContext;

      // Add response headers immediately
      if (response && typeof response.setHeader === 'function') {
        response.setHeader('x-sandbox-mode', 'true');
        response.setHeader('x-sandbox-scenario', requestedScenario);
        response.setHeader('x-sandbox-request-id', sandboxRequestId);
      }

      this.logger.debug(
        `Sandbox request [${sandboxRequestId}] detected for partner [${partnerId}] (scenario: ${requestedScenario})`,
      );
    }

    return next.handle().pipe(
      tap(() => {
        if (isSandbox && response && typeof response.setHeader === 'function') {
          response.setHeader('x-sandbox-mode', 'true');
        }
      }),
    );
  }

  private detectSandboxMode(req: Request): boolean {
    if (!req) return false;

    // Header checks
    const headerMode = req.headers['x-sandbox-mode'] || req.headers['x-partner-sandbox'];
    if (headerMode === 'true' || headerMode === '1') {
      return true;
    }

    // Query param check
    if (req.query && (req.query.sandbox === 'true' || req.query.sandbox === '1')) {
      return true;
    }

    // API key / Bearer token prefix check
    const authHeader = req.headers.authorization;
    if (authHeader && (authHeader.startsWith('Bearer sb_') || authHeader.startsWith('Bearer sandbox_'))) {
      return true;
    }

    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey && (apiKey.startsWith('sb_') || apiKey.startsWith('sandbox_'))) {
      return true;
    }

    // Route check: /sandbox endpoints are always sandbox
    if (req.path && req.path.startsWith('/sandbox')) {
      return true;
    }

    return false;
  }

  private extractPartnerId(req: Request): string {
    if (!req) return 'default';

    const partnerHeader = req.headers['x-partner-id'] as string;
    if (partnerHeader && partnerHeader.trim().length > 0) {
      return partnerHeader.trim();
    }

    const apiKey = (req.headers['x-api-key'] as string) || '';
    if (apiKey.startsWith('sb_') || apiKey.startsWith('sandbox_')) {
      return apiKey.split('_')[1] || 'default';
    }

    return 'default';
  }
}
