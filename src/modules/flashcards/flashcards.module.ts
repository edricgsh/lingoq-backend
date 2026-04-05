import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlashcardProgress } from 'src/entities/flashcard-progress.entity';
import { FlashcardSettings } from 'src/entities/flashcard-settings.entity';
import { VocabItem } from 'src/entities/vocab-item.entity';
import { LearningSession } from 'src/entities/learning-session.entity';
import { EmailModule } from 'src/modules/email/email.module';
import { FlashcardsController } from './flashcards.controller';
import { FlashcardsService } from './flashcards.service';
import { FlashcardsWorker } from './flashcards.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([FlashcardProgress, FlashcardSettings, VocabItem, LearningSession]),
    EmailModule,
  ],
  controllers: [FlashcardsController],
  providers: [FlashcardsService, FlashcardsWorker],
  exports: [FlashcardsService],
})
export class FlashcardsModule {}
