import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { LoggerService } from 'src/modules/logger/logger.service';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string;

    if (exception instanceof HttpException) {
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
    const stack = exception instanceof Error ? exception.stack : '';
    this.logger.error(`| Path: ${errorPath} | ErrorMessage: ${message} | Status: ${status}\n${stack}`);

    response.status(status).json({
      StatusCode: status,
      Message: message,
      IsSuccess: false,
      Data: null,
    });
  }
}
