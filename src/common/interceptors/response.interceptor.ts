import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';
import '../types/express-extend'; // Extend Express request types
import { ApiResponse } from '../types/api-response.interface';
import { v4 as uuidv4 } from 'uuid';

/**
 * Global response interceptor to wrap successful responses into the
 * standardized ApiResponse envelope {success, data, timestamp, requestId}
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResponseInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const requestId = request.id || this.generateRequestId();
    const timestamp = new Date().toISOString();

    (request as any).id = requestId;
    (request as any).timestamp = timestamp;

    return next.handle().pipe(
      map((data: any) => {
        if (this.isApiResponse(data)) {
          return data;
        }

        const apiResponse: ApiResponse = {
          success: true,
          data: data || null,
          timestamp,
          requestId,
        };

        this.logSuccess(request, response, requestId);

        return apiResponse;
      }),
    );
  }

  private isApiResponse(data: any): boolean {
    return (
      typeof data === 'object' &&
      data !== null &&
      'success' in data &&
      'timestamp' in data &&
      'requestId' in data
    );
  }

  private generateRequestId(): string {
    return uuidv4();
  }

  private logSuccess(request: Request, response: Response, requestId: string): void {
    this.logger.debug(
      `${request.method} ${request.path} - ${response.statusCode}`,
      requestId,
    );
  }
}
