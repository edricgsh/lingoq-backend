import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { VideoContent } from './video-content.entity';

@Entity({ name: 'session_summaries', schema: 'lingoq' })
export class SessionSummary extends BaseEntity {
  @Column({ name: 'video_content_id' })
  videoContentId: string;

  @Column({ name: 'summary_target_lang', type: 'text', nullable: true })
  summaryTargetLang: string;

  @Column({ name: 'key_phrases', type: 'jsonb', nullable: true })
  keyPhrases: Array<{
    phrase: string;
    translation: string;
  }>;

  @ManyToOne(() => VideoContent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_content_id' })
  videoContent: VideoContent;
}
