import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Homework } from './homework.entity';
import { QuestionType } from 'src/enums/question-type.enum';

@Entity({ name: 'homework_questions', schema: 'lingoq' })
export class HomeworkQuestion extends BaseEntity {
  @Column({ name: 'homework_id' })
  homeworkId: string;

  @Column({
    name: 'question_type',
    type: 'enum',
    enum: QuestionType,
  })
  questionType: QuestionType;

  @Column({ name: 'question_text', type: 'text' })
  questionText: string;

  @Column({ name: 'expected_answer', type: 'text', nullable: true })
  expectedAnswer: string;

  @Column({ name: 'options', type: 'jsonb', nullable: true })
  options: string[] | null;

  @Column({ name: 'correct_answer', type: 'text', nullable: true })
  correctAnswer: string | null;

  @Column({ name: 'order_index', default: 0 })
  orderIndex: number;

  @Column({ name: 'video_hint_url', type: 'text', nullable: true })
  videoHintUrl: string | null;

  @ManyToOne(() => Homework, (homework) => homework.questions)
  @JoinColumn({ name: 'homework_id' })
  homework: Homework;
}
