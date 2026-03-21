import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VocabItem } from 'src/entities/vocab-item.entity';

@Injectable()
export class VocabService {
  constructor(
    @InjectRepository(VocabItem)
    private readonly vocabRepository: Repository<VocabItem>,
  ) {}

  async getVocabBySession(sessionId: string): Promise<VocabItem[]> {
    return this.vocabRepository.find({ where: { sessionId } });
  }
}
