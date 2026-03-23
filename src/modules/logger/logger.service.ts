import { Inject, Injectable } from '@nestjs/common';
import { stringify } from 'flatted';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger as WinstonLogger } from 'winston';
import { TraceContext } from 'src/middleware/trace.middleware';

@Injectable()
export class LoggerService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
  ) {}

  private safeStringify(obj: any): string {
    try {
      return stringify(obj);
    } catch {
      return '[Unable to stringify object]';
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

  private getTraceId(): string {
    try {
      return TraceContext.getStore()?.get('traceId') || 'no-trace-id';
    } catch {
      return 'no-trace-id';
    }
  }

  private getUserId(): string | undefined {
    try {
      return TraceContext.getStore()?.get('userId');
    } catch {
      return undefined;
    }
  }

  log(message: string, context?: string, metadata?: any) {
    try {
      const logData: any = { context: context || this.getCallerClass() };
      if (metadata) Object.assign(logData, metadata);
      this.logger.info(message, logData);
    } catch {
      this.logger.error('LoggerService.log: Failed to log message', { context: 'LoggerService' });
    }
  }

  error(message: string, trace?: any, context?: string) {
    try {
      const logData: any = { context: context || this.getCallerClass() };
      if (trace instanceof Error) {
        logData.stack = trace.stack;
      } else if (trace !== undefined) {
        logData.trace = this.safeStringify(trace);
      }
      this.logger.error(message, logData);
    } catch {
      this.logger.error('LoggerService.error: Failed to log error', { context: 'LoggerService' });
    }
  }

  warn(message: string, context?: string, metadata?: any) {
    try {
      const logData: any = { context: context || this.getCallerClass() };
      if (metadata) Object.assign(logData, metadata);
      this.logger.warn(message, logData);
    } catch {
      this.logger.error('LoggerService.warn: Failed to log warning', { context: 'LoggerService' });
    }
  }

  debug(message: string, context?: string) {
    try {
      const logData: any = { context: context || this.getCallerClass() };
      this.logger.debug(message, logData);
    } catch {
      this.logger.error('LoggerService.debug: Failed to log debug message', { context: 'LoggerService' });
    }
  }
}
