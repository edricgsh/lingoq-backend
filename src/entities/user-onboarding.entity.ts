import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { ProficiencyLevel } from 'src/enums/proficiency-level.enum';

@Entity({ name: 'user_onboarding', schema: 'lingoq' })
export class UserOnboarding extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'is_complete', default: false })
  isComplete: boolean;

  @Column({ name: 'native_language', nullable: true })
  nativeLanguage: string;

  @Column({ name: 'target_language', nullable: true })
  targetLanguage: string;

  @Column({
    name: 'proficiency_level',
    type: 'enum',
    enum: ProficiencyLevel,
    nullable: true,
  })
  proficiencyLevel: ProficiencyLevel;

  @Column({ name: 'learning_goals', type: 'text', nullable: true })
  learningGoals: string;

  @Column({ name: 'interest_topics', type: 'jsonb', default: [] })
  interestTopics: string[];

  @Column({ name: 'has_seen_tour', default: false })
  hasSeenTour: boolean;

  @OneToOne(() => User, (user) => user.onboarding)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
