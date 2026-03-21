import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { format, transports } from 'winston';
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

        const consoleFormat =
          environment === 'local'
            ? format.combine(
                format.colorize({ all: true }),
                format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
                format.printf(({ timestamp, level, message, context }) => {
                  const traceId = (() => { try { return TraceContext.getStore()?.get('traceId') || 'no-trace'; } catch { return 'no-trace'; } })();
                  let log = `${timestamp} [${traceId}]`;
                  if (context) log += ` [${context}]`;
                  log += ` ${level}: ${message}`;
                  return log;
                }),
              )
            : format.combine(
                format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
                format.json(),
              );

        return {
          level: logLevel,
          transports: [
            new transports.Console({
              level: logLevel,
              format: consoleFormat,
            }),
          ],
        };
      },
    }),
  ],
  providers: [LoggerService],
  exports: [LoggerService, WinstonModule],
})
export class LoggerModule {}
