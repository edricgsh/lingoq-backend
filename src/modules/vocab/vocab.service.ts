import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VocabItem } from 'src/entities/vocab-item.entity';
import { LearningSession } from 'src/entities/learning-session.entity';

@Injectable()
export class VocabService {
  constructor(
    @InjectRepository(VocabItem)
    private readonly vocabRepository: Repository<VocabItem>,
    @InjectRepository(LearningSession)
    private readonly sessionRepository: Repository<LearningSession>,
  ) {}

  async getVocabBySession(sessionId: string, userId: string): Promise<VocabItem[]> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Session not found');
    if (!session.activeContentVersionId) return [];
    return this.vocabRepository.find({ where: { contentVersionId: session.activeContentVersionId } });
  }
}
