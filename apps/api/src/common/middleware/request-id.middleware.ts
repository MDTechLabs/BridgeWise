import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../types/express-extend'; // Extend Express request types

/**
 * Middleware that assigns a UUID v4 request id to each incoming request
 * and sets it as response header 'X-Request-Id' for client-side tracing.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestIdMiddleware.name);

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = uuidv4();
    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);

    // Optionally log at debug level
    this.logger.debug(`${req.method} ${req.path} - requestId=${requestId}`);

    next();
  }
}
