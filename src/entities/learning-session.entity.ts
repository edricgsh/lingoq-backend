import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { VocabItem } from './vocab-item.entity';
import { SessionSummary } from './session-summary.entity';
import { Homework } from './homework.entity';
import { JobStatus } from 'src/enums/job-status.enum';

@Entity({ name: 'learning_sessions', schema: 'lingoq' })
export class LearningSession extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'youtube_url' })
  youtubeUrl: string;

  @Column({ name: 'youtube_video_id' })
  youtubeVideoId: string;

  @Column({ nullable: true })
  title: string;

  @Column({ name: 'thumbnail_url', nullable: true })
  thumbnailUrl: string;

  @Column({
    name: 'job_status',
    type: 'enum',
    enum: JobStatus,
    default: JobStatus.PENDING,
  })
  jobStatus: JobStatus;

  @Column({ name: 'pg_boss_job_id', nullable: true })
  pgBossJobId: string;

  @Column({ name: 'subtitles_vtt', type: 'text', nullable: true })
  subtitlesVtt: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @ManyToOne(() => User, (user) => user.sessions)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => VocabItem, (vocab) => vocab.session, { cascade: true })
  vocabItems: VocabItem[];

  @OneToOne(() => SessionSummary, (summary) => summary.session, { cascade: true })
  summary: SessionSummary;

  @OneToOne(() => Homework, (homework) => homework.session, { cascade: true })
  homework: Homework;
}
