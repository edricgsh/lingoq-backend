import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VocabItem } from 'src/entities/vocab-item.entity';
import { LearningSession } from 'src/entities/learning-session.entity';
import { VocabService } from './vocab.service';

@Module({
  imports: [TypeOrmModule.forFeature([VocabItem, LearningSession])],
  providers: [VocabService],
  exports: [VocabService],
})
export class VocabModule {}
