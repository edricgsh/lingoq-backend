import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Homework } from 'src/entities/homework.entity';
import { HomeworkSubmission } from 'src/entities/homework-submission.entity';
import { HomeworkAnswer } from 'src/entities/homework-answer.entity';
import { HomeworkQuestion } from 'src/entities/homework-question.entity';
import { LearningSession } from 'src/entities/learning-session.entity';
import { HomeworkController } from './homework.controller';
import { HomeworkService } from './homework.service';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Homework, HomeworkSubmission, HomeworkAnswer, HomeworkQuestion, LearningSession]),
    OnboardingModule,
  ],
  controllers: [HomeworkController],
  providers: [HomeworkService],
  exports: [HomeworkService],
})
export class HomeworkModule {}
