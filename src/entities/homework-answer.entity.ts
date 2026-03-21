import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { HomeworkSubmission } from './homework-submission.entity';

@Entity({ name: 'homework_answers', schema: 'lingoq' })
export class HomeworkAnswer extends BaseEntity {
  @Column({ name: 'submission_id' })
  submissionId: string;

  @Column({ name: 'question_id' })
  questionId: string;

  @Column({ name: 'answer_text', type: 'text' })
  answerText: string;

  @Column({ name: 'is_correct', nullable: true })
  isCorrect: boolean;

  @Column({ type: 'text', nullable: true })
  feedback: string;

  @Column({ nullable: true })
  score: number;

  @ManyToOne(() => HomeworkSubmission, (submission) => submission.answers)
  @JoinColumn({ name: 'submission_id' })
  submission: HomeworkSubmission;
}
