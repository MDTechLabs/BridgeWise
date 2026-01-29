import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiResponse, ErrorType } from '../types/api-response.interface';
import '../types/express-extend'; // Extend Express request types
import { AppException, mapHttpExceptionToAppException } from '../exceptions/app.exception';
import { v4 as uuidv4 } from 'uuid';

/**
 * Global exception filter that catches ALL exceptions and formats responses
 * to the standardized ApiResponse envelope {success, error, timestamp, requestId}
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Get requestId from request or generate a fallback
    const requestId = request.id || this.generateRequestId();
    const timestamp = new Date().toISOString();

    let httpStatus: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let apiError: any = {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      type: ErrorType.INTERNAL,
      details: { requestId },
    };

    if (exception instanceof AppException) {
      httpStatus = exception.httpStatus;
      apiError = exception.apiError;
    } else if (exception instanceof HttpException) {
      const mappedException = mapHttpExceptionToAppException(exception, requestId);
      httpStatus = mappedException.httpStatus;
      apiError = mappedException.apiError;
    } else if (exception instanceof Error) {
      httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
      apiError = {
        code: 'INTERNAL_SERVER_ERROR',
        message: exception.message || 'An unexpected error occurred',
        type: ErrorType.INTERNAL,
        details: {
          requestId,
          errorName: exception.name,
          stack: process.env.NODE_ENV === 'development' ? exception.stack : undefined,
        },
      };
    } else {
      httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
      apiError = {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        type: ErrorType.INTERNAL,
        details: {
          requestId,
          error: String(exception),
        },
      };
    }

    this.logError(request, httpStatus, apiError, exception);

    const errorResponse: ApiResponse = {
      success: false,
      error: apiError,
      timestamp,
      requestId,
    };

    response.status(httpStatus).json(errorResponse);
  }

  private generateRequestId(): string {
    return uuidv4();
  }

  private logError(
    request: Request,
    httpStatus: HttpStatus,
    apiError: any,
    exception: unknown,
  ): void {
    const logData = {
      timestamp: new Date().toISOString(),
      method: request.method,
      path: request.path,
      statusCode: httpStatus,
      errorCode: apiError.code,
      errorMessage: apiError.message,
      errorType: apiError.type,
      requestId: apiError.details?.requestId,
    };

    if (httpStatus >= 500) {
      this.logger.error(
        `Request failed: ${request.method} ${request.path}`,
        exception instanceof Error ? exception.stack : String(exception),
        { meta: logData },
      );
    } else {
      this.logger.warn(
        `Request error: ${request.method} ${request.path}`,
        JSON.stringify(logData),
      );
    }
  }
}
