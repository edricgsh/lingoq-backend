import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { JobStatus } from 'src/enums/job-status.enum';
import { VocabItem } from './vocab-item.entity';
import { SessionSummary } from './session-summary.entity';
import { Homework } from './homework.entity';

@Entity({ name: 'video_content', schema: 'lingoq' })
export class VideoContent extends BaseEntity {
  @Column({ name: 'youtube_video_id', unique: true })
  youtubeVideoId: string;

  @Column({ name: 'youtube_url' })
  youtubeUrl: string;

  @Column({ nullable: true })
  title: string;

  @Column({ name: 'thumbnail_url', nullable: true })
  thumbnailUrl: string;

  @Column({ name: 'subtitles_vtt', type: 'text', nullable: true })
  subtitlesVtt: string | null;

  @Column({
    name: 'job_status',
    type: 'enum',
    enum: JobStatus,
    default: JobStatus.PENDING,
  })
  jobStatus: JobStatus;

  @Column({ name: 'pg_boss_job_id', nullable: true })
  pgBossJobId: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @OneToMany(() => VocabItem, (v) => v.videoContent)
  vocabItems: VocabItem[];

  @OneToMany(() => SessionSummary, (s) => s.videoContent)
  summaries: SessionSummary[];

  @OneToMany(() => Homework, (h) => h.videoContent)
  homeworks: Homework[];

}
