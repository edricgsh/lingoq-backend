import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger as WinstonLogger } from 'winston';
import { TraceContext } from 'src/middleware/trace.middleware';

@Injectable()
export class LoggerService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
  ) {}

  log(message: string, context?: string) {
    const traceId = this.getTraceId();
    this.logger.info(message, { context: context || this.getCallerClass(), traceId });
  }

  error(message: string, trace?: any, context?: string) {
    const traceId = this.getTraceId();
    this.logger.error(message, { context: context || this.getCallerClass(), trace, traceId });
  }

  warn(message: string, context?: string) {
    const traceId = this.getTraceId();
    this.logger.warn(message, { context: context || this.getCallerClass(), traceId });
  }

  debug(message: string, context?: string) {
    const traceId = this.getTraceId();
    this.logger.debug(message, { context: context || this.getCallerClass(), traceId });
  }

  private getTraceId(): string {
    try {
      return TraceContext.getStore()?.get('traceId') || 'no-trace-id';
    } catch {
      return 'no-trace-id';
    }
  }

  private getCallerClass(): string {
    try {
      const stack = new Error().stack;
      if (!stack) return 'Unknown';
      const stackLines = stack.split('\n');
      for (let i = 3; i < stackLines.length; i++) {
        const match = stackLines[i].match(/at\s+(?:new\s+)?(\w+)\./);
        if (match && match[1] && match[1] !== 'LoggerService') {
          return match[1];
        }
      }
      return 'Unknown';
    } catch {
      return 'Unknown';
    }
  }
}
