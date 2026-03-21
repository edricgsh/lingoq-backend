import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Homework } from './homework.entity';
import { HomeworkAnswer } from './homework-answer.entity';

@Entity({ name: 'homework_submissions', schema: 'lingoq' })
export class HomeworkSubmission extends BaseEntity {
  @Column({ name: 'homework_id' })
  homeworkId: string;

  @Column({ name: 'question_id' })
  questionId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ nullable: true })
  score: number;

  @Column({ name: 'overall_feedback', type: 'text', nullable: true })
  overallFeedback: string;

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true })
  submittedAt: Date;

  @ManyToOne(() => Homework, (homework) => homework.submissions)
  @JoinColumn({ name: 'homework_id' })
  homework: Homework;

  @OneToMany(() => HomeworkAnswer, (answer) => answer.submission, { cascade: true })
  answers: HomeworkAnswer[];
}
