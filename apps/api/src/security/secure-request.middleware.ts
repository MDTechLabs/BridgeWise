import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ApiKeyVaultService } from './api-key-vault.service';

/**
 * Secure Request Middleware
 * Intercepts outbound API requests and injects secrets from vault
 * Ensures keys are never exposed to client-side code
 */
@Injectable()
export class SecureRequestMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SecureRequestMiddleware.name);

  constructor(private readonly apiKeyVault: ApiKeyVaultService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Sanitize request to prevent key leaks
    this.sanitizeRequest(req);

    // Log request (but not sensitive data)
    this.logSecureRequest(req);

    next();
  }

  /**
   * Sanitize request to remove any potentially sensitive headers
   */
  private sanitizeRequest(req: Request): void {
    const forbiddenHeaders = [
      'x-api-key',
      'authorization',
      'x-secret-key',
      'api-secret',
    ];

    forbiddenHeaders.forEach((header) => {
      if (req.headers[header.toLowerCase()]) {
        this.logger.warn(
          `Sensitive header detected in client request: ${header}. Removing.`,
        );
        delete req.headers[header.toLowerCase()];
      }
    });
  }

  /**
   * Log request safely without exposing secrets
   */
  private logSecureRequest(req: Request): void {
    const logData = {
      method: req.method,
      path: req.path,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    };

    this.logger.debug(`API Request: ${JSON.stringify(logData)}`);
  }
}
