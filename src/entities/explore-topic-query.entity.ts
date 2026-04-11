import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity({ name: 'explore_topic_queries', schema: 'lingoq' })
@Unique(['topic', 'targetLanguage'])
export class ExploreTopicQuery extends BaseEntity {
  @Column() topic: string;

  @Column({ name: 'target_language' }) targetLanguage: string;

  @Column({ type: 'jsonb', default: [] }) queries: string[];

  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;

  // Map of query string → ISO timestamp of last Supadata fetch
  @Column({ name: 'query_fetched_at', type: 'jsonb', default: {} })
  queryFetchedAt: Record<string, string>;
}
