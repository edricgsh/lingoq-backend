import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity({ name: 'flashcard_settings', schema: 'lingoq' })
export class FlashcardSettings extends BaseEntity {
  @Column({ name: 'user_id' })
  @Index({ unique: true })
  userId: string;

  @Column({ name: 'daily_limit', type: 'int', default: 20 })
  dailyLimit: number;

  @Column({ name: 'reminder_enabled', type: 'boolean', default: true })
  reminderEnabled: boolean;

  @Column({ name: 'reminder_time', default: '09:00' })
  reminderTime: string;

  @Column({ default: 'UTC' })
  timezone: string;
}
