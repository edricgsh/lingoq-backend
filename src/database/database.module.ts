import { Logger, Module } from '@nestjs/common';
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
import { AllowedEmail } from 'src/entities/allowed-email.entity';
import { FlashcardProgress } from 'src/entities/flashcard-progress.entity';
import { FlashcardSettings } from 'src/entities/flashcard-settings.entity';
import { SubtitleCache } from 'src/entities/subtitle-cache.entity';
import { VideoContent } from 'src/entities/video-content.entity';
import { ContentVersion } from 'src/entities/content-version.entity';
import { ExploreTopicQuery } from 'src/entities/explore-topic-query.entity';
import { ExploreRecommendation } from 'src/entities/explore-recommendation.entity';
import { SessionNote } from 'src/entities/session-note.entity';
import { SupadataApiKey } from 'src/entities/supadata-api-key.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [AwsSecretsService],
      useFactory: async (secretsService: AwsSecretsService) => {
        const secrets = await secretsService.getSecret();
        const logger = new Logger('DatabaseModule');
        const host = secrets.DB_HOST || 'localhost';
        const port = parseInt(secrets.DB_PORT || '5433');
        const database = secrets.DB_NAME || 'learn_spanish';
        const username = secrets.DB_USERNAME || 'postgres';
        logger.log(`Connecting to postgres://${username}@${host}:${port}/${database} (schema: lingoq)`);
        return {
          type: 'postgres',
          host,
          port,
          username,
          password: secrets.DB_PASSWORD || 'postgres',
          database,
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
            AllowedEmail,
            FlashcardProgress,
            FlashcardSettings,
            SubtitleCache,
            VideoContent,
            ContentVersion,
            ExploreTopicQuery,
            ExploreRecommendation,
            SessionNote,
            SupadataApiKey,
          ],
          synchronize: false,
          logging: false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
