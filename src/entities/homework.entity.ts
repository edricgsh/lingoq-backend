import { Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { LearningSession } from './learning-session.entity';
import { HomeworkQuestion } from './homework-question.entity';
import { HomeworkSubmission } from './homework-submission.entity';

@Entity({ name: 'homework', schema: 'lingoq' })
export class Homework extends BaseEntity {
  @Column({ name: 'session_id' })
  sessionId: string;

  @OneToOne(() => LearningSession, (session) => session.homework)
  @JoinColumn({ name: 'session_id' })
  session: LearningSession;

  @OneToMany(() => HomeworkQuestion, (question) => question.homework, { cascade: true })
  questions: HomeworkQuestion[];

  @OneToMany(() => HomeworkSubmission, (submission) => submission.homework)
  submissions: HomeworkSubmission[];
}
