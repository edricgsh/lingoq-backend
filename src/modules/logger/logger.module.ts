import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { LoggerService } from './logger.service';
import { TraceContext } from 'src/middleware/trace.middleware';

@Global()
@Module({
  imports: [
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const environment = configService.get<string>('NODE_ENV') || 'local';
        const logLevel = 'debug';

        const sanitizeToSingleLine = (text: any): string => {
          if (text === null) return 'null';
          if (text === undefined) return 'undefined';
          if (text === '') return '';

          let stringValue: string;
          try {
            if (typeof text === 'string') {
              stringValue = text;
            } else if (typeof text === 'number' || typeof text === 'boolean') {
              stringValue = String(text);
            } else if (typeof text === 'object') {
              stringValue = JSON.stringify(text);
            } else {
              stringValue = String(text);
            }
          } catch (error) {
            stringValue = `[Unable to convert: ${error instanceof Error ? error.message : 'Unknown'}]`;
          }

          if (!stringValue) return '';

          return stringValue
            .replace(/\r\n/g, ' | ')
            .replace(/\n/g, ' | ')
            .replace(/\r/g, ' | ')
            .replace(/\t/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        };

        const buildLogLine = (
          timestamp: string,
          level: string,
          message: string,
          context: string | undefined,
          metadata: Record<string, unknown>,
        ): string => {
          const traceId = (() => {
            try { return TraceContext.getStore()?.get('traceId') || 'no-trace'; } catch { return 'no-trace'; }
          })();
          const userId = (() => {
            try { return TraceContext.getStore()?.get('userId'); } catch { return undefined; }
          })();

          let log = `${timestamp} [${traceId}]`;
          if (userId) log += ` [userId: ${userId}]`;
          if (context) log += ` [${context}]`;
          log += ` ${level}: ${sanitizeToSingleLine(String(message))}`;

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { context: _, ...remainingMetadata } = metadata;
          if (Object.keys(remainingMetadata).length > 0) {
            log += ` ${sanitizeToSingleLine(JSON.stringify(remainingMetadata))}`;
          }

          return log;
        };

        const consoleFormat =
          environment === 'local'
            ? format.combine(
                format.colorize({ all: true }),
                format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
                format.printf(({ timestamp, level, message, context, ...metadata }) =>
                  buildLogLine(timestamp as string, level, message as string, context as string | undefined, metadata),
                ),
              )
            : format.combine(
                format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
                format.printf(({ timestamp, level, message, context, ...metadata }) =>
                  buildLogLine(timestamp as string, level, message as string, context as string | undefined, metadata),
                ),
              );

        const fileFormat = format.combine(
          format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
          format.printf(({ timestamp, level, message, context, ...metadata }) =>
            buildLogLine(timestamp as string, level, message as string, context as string | undefined, metadata),
          ),
        );

        const transportsList: any[] = [
          new transports.Console({
            level: logLevel,
            format: consoleFormat,
          }),
          new DailyRotateFile({
            filename: 'logs/application-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxFiles: '3d',
            level: logLevel,
            format: fileFormat,
          }),
        ];

        return {
          level: logLevel,
          transports: transportsList,
        };
      },
    }),
  ],
  providers: [LoggerService],
  exports: [LoggerService, WinstonModule],
})
export class LoggerModule {}
