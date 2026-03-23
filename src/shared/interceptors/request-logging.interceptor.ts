import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { TraceContext } from 'src/middleware/trace.middleware';
import { LoggerService } from 'src/modules/logger/logger.service';

@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const method = request.method;
    const url = request.originalUrl || request.url;

    const safeStringify = (obj: any): string => {
      try {
        return JSON.stringify(obj, (key, value) => {
          if (key === 'password' || key === 'authorization') return '[REDACTED]';
          if (value?.type === 'Buffer') return '[Buffer]';
          if (
            key.toLowerCase().includes('token') &&
            typeof value === 'string' &&
            value.length > 12
          ) {
            return `${value.substring(0, 6)}****${value.substring(value.length - 6)}`;
          }
          return value;
        });
      } catch {
        return '[Circular or complex object]';
      }
    };

    const reqBody = safeStringify(request.body) || '{}';
    const reqQuery = safeStringify(request.query) || '{}';

    this.logger.log(`Incoming: ${method} ${url}`, 'RequestInterceptor', {
      body: reqBody,
      query: reqQuery,
    });

    const traceId = (() => {
      try { return TraceContext.getStore()?.get('traceId') || 'no-trace-id'; } catch { return 'no-trace-id'; }
    })();
    const userId = (() => {
      try { return TraceContext.getStore()?.get('userId'); } catch { return undefined; }
    })();

    return next.handle().pipe(
      finalize(() => {
        const responseTime = Date.now() - now;
        const statusCode = response.statusCode;

        this.logger.log(
          `Complete: ${method} ${url} ${statusCode} ${responseTime}ms`,
          'RequestInterceptor',
          { statusCode, responseTime, traceId, userId },
        );
      }),
    );
  }
}
