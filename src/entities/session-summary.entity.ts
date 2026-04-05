import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { ContentVersion } from './content-version.entity';

@Entity({ name: 'session_summaries', schema: 'lingoq' })
export class SessionSummary extends BaseEntity {
  @Column({ name: 'content_version_id' })
  contentVersionId: string;

  @Column({ name: 'summary_target_lang', type: 'text', nullable: true })
  summaryTargetLang: string;

  @Column({ name: 'key_phrases', type: 'jsonb', nullable: true })
  keyPhrases: Array<{
    phrase: string;
    translation: string;
  }>;

  @OneToOne(() => ContentVersion, (cv) => cv.summary, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'content_version_id' })
  contentVersion: ContentVersion;
}
