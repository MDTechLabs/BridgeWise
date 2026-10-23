import { Request } from 'express';

/**
 * Augment Express Request with custom properties
 * This allows adding application-specific properties to the Request object
 */
declare global {
  namespace Express {
    interface Request {
      /**
       * Unique request identifier for tracing and logging
       */
      id?: string;

      /**
       * Trace id correlating this request with downstream transaction activity
       */
      traceId?: string;
    }
  }
}
