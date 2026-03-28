import { Injectable, OnModuleInit } from '@nestjs/common';
import { PgBossService } from 'src/modules/pg-boss/pg-boss.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';
import { ExploreService } from './explore.service';

interface ExploreJobData {
  userId?: string;
  topics: string[] | string;
  targetLanguage: string;
}

@Injectable()
export class ExploreWorker implements OnModuleInit {
  constructor(
    private readonly pgBossService: PgBossService,
    private readonly exploreService: ExploreService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    await this.pgBossService.work<ExploreJobData>(
      PgBossQueueEnum.EXPLORE_GENERATE_RECOMMENDATIONS,
      async (jobs) => {
        for (const job of jobs) {
          const topics = Array.isArray(job.data.topics)
            ? job.data.topics
            : job.data.topics.split(',').map((t) => t.trim()).filter(Boolean);
          this.logger.log(
            `Processing explore job (${topics.length} topics): ${topics.join(', ')}`,
            'ExploreWorker',
          );
          await this.exploreService.generateForUserTopics(topics, job.data.targetLanguage);
        }
      },
      { batchSize: 1 },
    );
    this.logger.log('Explore recommendations worker registered', 'ExploreWorker');
  }
}
