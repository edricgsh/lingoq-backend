import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { VideoContent } from './video-content.entity';

@Entity({ name: 'learning_sessions', schema: 'lingoq' })
export class LearningSession extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'video_content_id' })
  videoContentId: string;

  @ManyToOne(() => User, (user) => user.sessions)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => VideoContent)
  @JoinColumn({ name: 'video_content_id' })
  videoContent: VideoContent;
}
