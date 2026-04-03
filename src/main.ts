import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { LoggerService } from 'src/modules/logger/logger.service';
import { RequestLoggerInterceptor } from 'src/shared/interceptors/request-logging.interceptor';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(helmet());
  app.use(cookieParser());
  const corsOrigin = process.env.CORS_ORIGIN ?? '';
  const origins: (string | RegExp)[] = [
    'http://localhost:5005',
    /lingoq\.study/,
    /lingoq.*vercel/,
    ...corsOrigin.split(',').map((o) => o.trim()).filter(Boolean),
  ];

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
    exposedHeaders: ['set-cookie'],
  });

  const loggerService = app.get(LoggerService);
  app.useGlobalInterceptors(new RequestLoggerInterceptor(loggerService));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = process.env.PORT || 5007;
  await app.listen(port);
  logger.log(`LingoQ backend running on port ${port}`);
  logger.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  logger.log(`Started at: ${new Date().toISOString()}`);
}
bootstrap();
