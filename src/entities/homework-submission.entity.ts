import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Homework } from './homework.entity';
import { HomeworkAnswer } from './homework-answer.entity';
import { LearningSession } from './learning-session.entity';
import { ContentVersion } from './content-version.entity';

@Entity({ name: 'homework_submissions', schema: 'lingoq' })
export class HomeworkSubmission extends BaseEntity {
  @Column({ name: 'homework_id' })
  homeworkId: string;

  @Column({ name: 'question_id' })
  questionId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'user_session_id', nullable: true })
  userSessionId: string;

  // The ContentVersion this submission was answered against
  @Column({ name: 'content_version_id', nullable: true })
  contentVersionId: string | null;

  @Column({ nullable: true })
  score: number;

  @Column({ name: 'overall_feedback', type: 'text', nullable: true })
  overallFeedback: string;

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true })
  submittedAt: Date;

  @ManyToOne(() => Homework, (homework) => homework.submissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'homework_id' })
  homework: Homework;

  @ManyToOne(() => LearningSession, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_session_id' })
  userSession: LearningSession;

  @ManyToOne(() => ContentVersion, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'content_version_id' })
  contentVersion: ContentVersion;

  @OneToMany(() => HomeworkAnswer, (answer) => answer.submission, { cascade: true })
  answers: HomeworkAnswer[];
}
