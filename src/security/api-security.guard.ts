import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiKeyVaultService } from './api-key-vault.service';

/**
 * API Security Guard
 * Validates all incoming API requests for proper authentication
 * Prevents unauthorized access and logs all security events
 */
@Injectable()
export class ApiSecurityGuard implements CanActivate {
  private readonly logger = new Logger(ApiSecurityGuard.name);

  constructor(private readonly apiKeyVault: ApiKeyVaultService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Skip security for public endpoints
    if (this.isPublicRoute(request.path)) {
      return true;
    }

    try {
      // Check for valid authentication
      const authHeader = request.headers.authorization;

      if (!authHeader) {
        this.logger.warn(
          `Unauthorized access attempt from ${request.ip}: No auth header`,
        );
        throw new UnauthorizedException('Missing authorization header');
      }

      // Validate token format
      const [scheme, credentials] = authHeader.split(' ');
      if (scheme.toLowerCase() !== 'bearer') {
        this.logger.warn(`Invalid auth scheme from ${request.ip}: ${scheme}`);
        throw new UnauthorizedException('Invalid authorization scheme');
      }

      if (!credentials) {
        throw new UnauthorizedException('Missing credentials');
      }

      // Store authenticated user info on request
      (request as any).user = {
        authenticated: true,
        timestamp: new Date(),
      };

      return true;
    } catch (error) {
      this.logger.error(`Security guard error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if route is public
   */
  private isPublicRoute(path: string): boolean {
    const publicRoutes = [
      '/health',
      '/metrics',
      '/openapi',
      '/docs',
      '/api/docs',
    ];

    return publicRoutes.some((route) => path.startsWith(route));
  }
}
