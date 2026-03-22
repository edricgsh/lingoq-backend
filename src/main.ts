import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as path from 'path';
import * as fs from 'fs';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  if (process.env.NODE_ENV === 'local') {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    app.useStaticAssets(uploadsDir, { prefix: '/uploads' });
  }

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: ['http://localhost:5005'],
    credentials: true,
  });

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
}
bootstrap();
