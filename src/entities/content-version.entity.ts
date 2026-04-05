import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { VideoContent } from './video-content.entity';
import { ProficiencyLevel } from 'src/enums/proficiency-level.enum';
import { ContentVersionStatus } from 'src/enums/content-version-status.enum';
import { VocabItem } from './vocab-item.entity';
import { SessionSummary } from './session-summary.entity';
import { Homework } from './homework.entity';

@Entity({ name: 'content_versions', schema: 'lingoq' })
export class ContentVersion extends BaseEntity {
  @Column({ name: 'video_content_id' })
  videoContentId: string;

  @Column({
    name: 'proficiency_level',
    type: 'enum',
    enum: ProficiencyLevel,
    nullable: true,
  })
  proficiencyLevel: ProficiencyLevel | null;

  // null = shared version (benefits all users at same level)
  // set  = personal version (custom instructions, visible only to this user)
  @Column({ name: 'user_id', nullable: true })
  userId: string | null;

  @Column({ name: 'custom_instructions', type: 'text', nullable: true })
  customInstructions: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ContentVersionStatus,
    default: ContentVersionStatus.PENDING,
  })
  status: ContentVersionStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @ManyToOne(() => VideoContent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_content_id' })
  videoContent: VideoContent;

  @OneToMany(() => VocabItem, (v) => v.contentVersion)
  vocabItems: VocabItem[];

  @OneToOne(() => SessionSummary, (s) => s.contentVersion)
  summary: SessionSummary;

  @OneToOne(() => Homework, (h) => h.contentVersion)
  homework: Homework;
}
