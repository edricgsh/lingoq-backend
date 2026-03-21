import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';
import { User } from 'src/entities/user.entity';
import { UserOnboarding } from 'src/entities/user-onboarding.entity';
import { LearningSession } from 'src/entities/learning-session.entity';
import { VocabItem } from 'src/entities/vocab-item.entity';
import { SessionSummary } from 'src/entities/session-summary.entity';
import { Homework } from 'src/entities/homework.entity';
import { HomeworkQuestion } from 'src/entities/homework-question.entity';
import { HomeworkSubmission } from 'src/entities/homework-submission.entity';
import { HomeworkAnswer } from 'src/entities/homework-answer.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [AwsSecretsService],
      useFactory: async (secretsService: AwsSecretsService) => {
        const secrets = await secretsService.getSecret();
        return {
          type: 'postgres',
          host: secrets.DB_HOST || 'localhost',
          port: parseInt(secrets.DB_PORT || '5432'),
          username: secrets.DB_USERNAME || 'postgres',
          password: secrets.DB_PASSWORD || 'postgres',
          database: secrets.DB_NAME || 'learn_spanish',
          schema: 'lingoq',
          extra: {
            options: `-c search_path=lingoq`,
          },
          entities: [
            User,
            UserOnboarding,
            LearningSession,
            VocabItem,
            SessionSummary,
            Homework,
            HomeworkQuestion,
            HomeworkSubmission,
            HomeworkAnswer,
          ],
          synchronize: true, // Use only in development; use migrations in prod
          logging: false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
