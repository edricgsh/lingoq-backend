import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { LearningSession } from './learning-session.entity';

@Entity({ name: 'session_notes', schema: 'lingoq' })
@Index(['userId', 'sessionId'])
export class SessionNote extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'session_id' })
  sessionId: string;

  @Column({ nullable: true })
  title: string | null;

  @Column({ type: 'text' })
  content: string;

  @ManyToOne(() => LearningSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: LearningSession;
}
