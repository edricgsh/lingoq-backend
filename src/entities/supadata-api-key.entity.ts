import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';
import { EncryptedFieldTransformer } from 'src/shared/transformers/encrypted-field.transformer';

export enum SupadataKeyStatus {
  AVAILABLE = 'AVAILABLE',
  INSUFFICIENT_FUND = 'INSUFFICIENT_FUND',
}

@Entity({ name: 'supadata_api_keys', schema: 'lingoq' })
export class SupadataApiKey extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({
    name: 'api_key',
    type: 'varchar',
    length: 1024,
    transformer: EncryptedFieldTransformer.getTransformer(),
  })
  apiKey: string;

  @Column({
    type: 'varchar',
    length: 32,
    default: SupadataKeyStatus.AVAILABLE,
  })
  status: SupadataKeyStatus;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'next_active_time', type: 'timestamptz', nullable: true })
  nextActiveTime: Date | null;

  @Column({ name: 'max_credits', type: 'int', nullable: true })
  maxCredits: number | null;

  @Column({ name: 'used_credits', type: 'int', nullable: true })
  usedCredits: number | null;

  @Column({ name: 'next_credit_fetch', type: 'timestamptz', nullable: true })
  nextCreditFetch: Date | null;
}
