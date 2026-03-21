import { MiddlewareConsumer, Module, NestModule, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { User } from 'src/entities/user.entity';
import { UserOnboarding } from 'src/entities/user-onboarding.entity';
import { UserRole } from 'src/enums/user-role.enum';

const SUPER_ADMIN_ID = '00000000-0000-0000-0000-000000000001';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env',
    }),
    LoggerModule,
    AwsSecretsModule,
    DatabaseModule,
    TypeOrmModule.forFeature([User, UserOnboarding]),
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
export class AppModule implements NestModule, OnApplicationBootstrap {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserOnboarding)
    private readonly onboardingRepository: Repository<UserOnboarding>,
  ) {}

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV !== 'local') return;

    let user = await this.userRepository.findOne({ where: { id: SUPER_ADMIN_ID } });
    if (!user) {
      user = this.userRepository.create({
        id: SUPER_ADMIN_ID,
        cognitoId: 'super-admin',
        email: 'super-admin@local.dev',
        name: 'Super Admin',
        role: UserRole.USER,
        isActive: true,
      });
      await this.userRepository.save(user);
    }

    const onboarding = await this.onboardingRepository.findOne({ where: { userId: SUPER_ADMIN_ID } });
    if (!onboarding) {
      await this.onboardingRepository.save(
        this.onboardingRepository.create({
          id: '00000000-0000-0000-0000-000000000002',
          userId: SUPER_ADMIN_ID,
          isComplete: false,
        }),
      );
    }
  }
}
