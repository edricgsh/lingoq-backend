import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TraceMiddleware } from 'src/middleware/trace.middleware';
import { GlobalExceptionFilter } from 'src/shared/filters/global-exception.filter';
import { ResponseInterceptor } from 'src/shared/interceptors/response.interceptor';
import { AwsSecretsModule } from 'src/modules/aws-secrets/aws-secrets.module';
import { LoggerModule } from 'src/modules/logger/logger.module';
import { DatabaseModule } from 'src/database/database.module';
import { AuthModule } from 'src/modules/auth/auth.module';
import { UserModule } from 'src/modules/user/user.module';
import { OnboardingModule } from 'src/modules/onboarding/onboarding.module';
import { PgBossModule } from 'src/modules/pg-boss/pg-boss.module';
import { SupabaseModule } from 'src/modules/supabase/supabase.module';
import { LambdaModule } from 'src/modules/lambda/lambda.module';
import { ClaudeModule } from 'src/modules/claude/claude.module';
import { SessionsModule } from 'src/modules/sessions/sessions.module';
import { VocabModule } from 'src/modules/vocab/vocab.module';
import { HomeworkModule } from 'src/modules/homework/homework.module';
import { HealthModule } from 'src/modules/health/health.module';
import { TtsModule } from 'src/modules/tts/tts.module';
import { FlashcardsModule } from 'src/modules/flashcards/flashcards.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV ? [`.env.${process.env.NODE_ENV}`, '.env'] : '.env',
    }),
    LoggerModule,
    AwsSecretsModule,
    DatabaseModule,
    AuthModule,
    UserModule,
    OnboardingModule,
    PgBossModule,
    SupabaseModule,
    LambdaModule,
    ClaudeModule,
    SessionsModule,
    VocabModule,
    HomeworkModule,
    HealthModule,
    TtsModule,
    FlashcardsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
