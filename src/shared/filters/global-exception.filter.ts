import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { LoggerService } from 'src/modules/logger/logger.service';
import { AppError } from 'src/shared/utils/error-utils';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string;
    let errorCode: string | undefined;
    let appErrorDetails: unknown;

    if (exception instanceof AppError) {
      status = exception.statusCode;
      message = exception.message;
      errorCode = exception.code;
      appErrorDetails = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();

      if (status === HttpStatus.UNAUTHORIZED) {
        message = 'Unauthorized';
      } else if (status === HttpStatus.BAD_REQUEST) {
        const res = exception.getResponse();
        message = typeof res === 'object' && res['message'] ? res['message'] : exception.message;
        if (Array.isArray(message)) {
          message = message.join(', ');
        }
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (!message) {
      message = HttpStatus[status] || 'An unexpected error occurred';
    }

    const errorPath = `${request.protocol}://${request.get('host')}${request.originalUrl}`;
    const logMessage = `| Path: ${errorPath} | ErrorMessage: ${message} | Status: ${status} | Exception: ${this.serializeError(exception)}`;
    this.logger.error(logMessage);

    response.status(status).json({
      StatusCode: status,
      Message: message,
      ErrorCode: errorCode,
      ErrorDetails: appErrorDetails,
      IsSuccess: false,
      Data: null,
    });
  }

  private serializeError(exception: unknown): string {
    try {
      if (exception instanceof Error) {
        return JSON.stringify({
          name: exception.name,
          message: exception.message,
          stack: exception.stack,
          ...(exception as any).code !== undefined && { code: (exception as any).code },
          ...(exception as any).details !== undefined && { details: (exception as any).details },
        });
      }
      return JSON.stringify({ error: String(exception) });
    } catch {
      return '[Unable to serialize error]';
    }
  }
}
