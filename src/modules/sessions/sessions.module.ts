import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningSession } from 'src/entities/learning-session.entity';
import { VideoContent } from 'src/entities/video-content.entity';
import { VocabItem } from 'src/entities/vocab-item.entity';
import { SessionSummary } from 'src/entities/session-summary.entity';
import { Homework } from 'src/entities/homework.entity';
import { HomeworkQuestion } from 'src/entities/homework-question.entity';
import { HomeworkSubmission } from 'src/entities/homework-submission.entity';
import { FlashcardProgress } from 'src/entities/flashcard-progress.entity';
import { SubtitleCache } from 'src/entities/subtitle-cache.entity';
import { ContentVersion } from 'src/entities/content-version.entity';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { SessionsWorker } from './sessions.worker';
import { RegenerateWorker } from './regenerate.worker';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LearningSession,
      VideoContent,
      VocabItem,
      SessionSummary,
      Homework,
      HomeworkQuestion,
      HomeworkSubmission,
      FlashcardProgress,
      SubtitleCache,
      ContentVersion,
    ]),
    OnboardingModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService, SessionsWorker, RegenerateWorker],
  exports: [SessionsService],
})
export class SessionsModule {}
