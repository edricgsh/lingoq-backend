import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningSession } from 'src/entities/learning-session.entity';
import { VocabItem } from 'src/entities/vocab-item.entity';
import { SessionSummary } from 'src/entities/session-summary.entity';
import { Homework } from 'src/entities/homework.entity';
import { HomeworkQuestion } from 'src/entities/homework-question.entity';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { SessionsWorker } from './sessions.worker';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LearningSession, VocabItem, SessionSummary, Homework, HomeworkQuestion]),
    OnboardingModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService, SessionsWorker],
  exports: [SessionsService],
})
export class SessionsModule {}
