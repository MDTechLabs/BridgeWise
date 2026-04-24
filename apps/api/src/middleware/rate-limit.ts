import { Injectable, NestMiddleware, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
}

interface RateLimitEntry {
  count: number;
  expiresAt: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly store = new Map<string, RateLimitEntry>();

  constructor(options?: RateLimitOptions) {
    this.windowMs = options?.windowMs ?? 15 * 60 * 1000;
    this.maxRequests = options?.maxRequests ?? 100;
  }

  private getClientKey(req: Request): string {
    const userId =
      req.header?.('x-user-id') ||
      req.header?.('x-api-key') ||
      req.headers.authorization;

    if (userId) {
      return `user:${userId}`;
    }

    return `ip:${req.ip || req.connection?.remoteAddress || 'unknown'}`;
  }

  private getEntry(key: string): RateLimitEntry | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry;
  }

  private createEntry(key: string): RateLimitEntry {
    const entry = {
      count: 0,
      expiresAt: Date.now() + this.windowMs,
    };
    this.store.set(key, entry);
    return entry;
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const key = this.getClientKey(req);
    const now = Date.now();
    const entry = this.getEntry(key) ?? this.createEntry(key);

    entry.count += 1;

    const remaining = Math.max(this.maxRequests - entry.count, 0);
    const resetSeconds = Math.ceil((entry.expiresAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', this.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', resetSeconds.toString());

    if (entry.count > this.maxRequests) {
      this.logger.warn(
        `Rate limit exceeded for ${key}: ${entry.count}/${this.maxRequests}`,
      );
      res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests, please try again later.',
      });
      return;
    }

    next();
  }
}
