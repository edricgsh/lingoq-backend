import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity({ name: 'explore_recommendations', schema: 'lingoq' })
export class ExploreRecommendation extends BaseEntity {
  @Column() topic: string;

  @Column({ name: 'target_language' }) targetLanguage: string;

  @Column({ name: 'video_id' }) videoId: string;

  @Column({ nullable: true }) title: string;

  @Column({ type: 'text', nullable: true }) description: string;

  @Column({ name: 'thumbnail_url', nullable: true }) thumbnailUrl: string;

  @Column({ name: 'view_count', type: 'bigint', nullable: true }) viewCount: number;

  @Column({ name: 'upload_date', nullable: true }) uploadDate: string;

  @Column({ name: 'channel_name', type: 'text', nullable: true }) channelName: string;

  @Column({ name: 'channel_id', type: 'text', nullable: true }) channelId: string;

  @Column({ nullable: true }) duration: number;
}
