import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import '../../common/types/express-extend';
import { resolveTraceId } from './trace-context';

/**
 * Assigns a trace id to every request (honouring a valid inbound one) and
 * echoes it as `X-Trace-Id` so downstream systems and clients can correlate.
 */
@Injectable()
export class TraceContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const traceId = resolveTraceId(req.headers);
    req.traceId = traceId;
    res.setHeader('X-Trace-Id', traceId);
    next();
  }
}
