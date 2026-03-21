import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { LearningSession } from './learning-session.entity';

@Entity({ name: 'vocab_items', schema: 'lingoq' })
export class VocabItem extends BaseEntity {
  @Column({ name: 'session_id' })
  sessionId: string;

  @Column()
  word: string;

  @Column({ name: 'part_of_speech', nullable: true })
  partOfSpeech: string;

  @Column({ type: 'jsonb', nullable: true })
  definition: {
    targetLang: string;
    nativeLang: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  examples: Array<{
    sentence: string;
    translation: string;
  }>;

  @Column({ name: 'audio_url', nullable: true })
  audioUrl: string;

  @ManyToOne(() => LearningSession, (session) => session.vocabItems)
  @JoinColumn({ name: 'session_id' })
  session: LearningSession;
}
