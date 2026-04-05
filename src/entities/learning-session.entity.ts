import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { VideoContent } from './video-content.entity';
import { ContentVersion } from './content-version.entity';

@Entity({ name: 'learning_sessions', schema: 'lingoq' })
export class LearningSession extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'video_content_id' })
  videoContentId: string;

  // Points to the ContentVersion the user is currently viewing.
  // null while the initial job is still processing.
  @Column({ name: 'active_content_version_id', nullable: true })
  activeContentVersionId: string | null;

  @ManyToOne(() => User, (user) => user.sessions)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => VideoContent)
  @JoinColumn({ name: 'video_content_id' })
  videoContent: VideoContent;

  @OneToOne(() => ContentVersion)
  @JoinColumn({ name: 'active_content_version_id' })
  activeContentVersion: ContentVersion;
}
