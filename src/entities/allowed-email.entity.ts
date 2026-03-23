import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity({ name: 'allowed_emails', schema: 'lingoq' })
export class AllowedEmail extends BaseEntity {
  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  note: string;
}
