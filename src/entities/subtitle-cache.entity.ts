import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity({ name: 'subtitle_cache', schema: 'lingoq' })
@Index(['youtubeVideoId'], { unique: true })
export class SubtitleCache extends BaseEntity {
  @Column({ name: 'youtube_video_id' })
  youtubeVideoId: string;

  @Column({ type: 'text' })
  subtitles: string;

  @Column({ name: 'subtitles_vtt', type: 'text', nullable: true })
  subtitlesVtt: string | null;

  @Column({ type: 'varchar', nullable: true })
  language: string | null;

  @Column({ type: 'varchar', nullable: true })
  title: string | null;

  @Column({ name: 'spoken_language', type: 'varchar', nullable: true })
  spokenLanguage: string | null;
}
