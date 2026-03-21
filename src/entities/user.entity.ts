import { Column, Entity, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { UserRole } from 'src/enums/user-role.enum';
import { UserOnboarding } from './user-onboarding.entity';
import { LearningSession } from './learning-session.entity';

@Entity({ name: 'users', schema: 'lingoq' })
export class User extends BaseEntity {
  @Column({ name: 'cognito_id', unique: true })
  cognitoId: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @OneToOne(() => UserOnboarding, (onboarding) => onboarding.user, {
    cascade: true,
    eager: false,
  })
  onboarding: UserOnboarding;

  @OneToMany(() => LearningSession, (session) => session.user)
  sessions: LearningSession[];
}
