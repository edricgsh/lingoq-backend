import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { VocabItem } from './vocab-item.entity';

@Entity({ name: 'flashcard_progress', schema: 'lingoq' })
@Index(['userId', 'nextReviewAt'])
@Index(['userId', 'vocabItemId'], { unique: true })
export class FlashcardProgress extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'vocab_item_id' })
  vocabItemId: string;

  @Column({ name: 'ease_factor', type: 'float', default: 2.5 })
  easeFactor: number;

  @Column({ type: 'int', default: 0 })
  interval: number;

  @Column({ type: 'int', default: 0 })
  repetitions: number;

  @Column({ name: 'next_review_at', type: 'timestamptz' })
  nextReviewAt: Date;

  @Column({ name: 'last_reviewed_at', type: 'timestamptz', nullable: true })
  lastReviewedAt: Date | null;

  @ManyToOne(() => VocabItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vocab_item_id' })
  vocabItem: VocabItem;
}
