import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { LearningSession } from './learning-session.entity';

@Entity({ name: 'session_summaries', schema: 'lingoq' })
export class SessionSummary extends BaseEntity {
  @Column({ name: 'session_id' })
  sessionId: string;

  @Column({ name: 'summary_target_lang', type: 'text', nullable: true })
  summaryTargetLang: string;

  @Column({ name: 'key_phrases', type: 'jsonb', nullable: true })
  keyPhrases: Array<{
    phrase: string;
    translation: string;
  }>;

  @OneToOne(() => LearningSession, (session) => session.summary)
  @JoinColumn({ name: 'session_id' })
  session: LearningSession;
}
