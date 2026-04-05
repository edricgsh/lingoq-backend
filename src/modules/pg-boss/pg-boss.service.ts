import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import type { SendOptions, WorkOptions, Job } from 'pg-boss';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';

@Injectable()
export class PgBossService implements OnModuleInit, OnModuleDestroy {
  private boss: PgBoss;
  private readonly SCHEMA = 'lingoq_pgboss';

  constructor(
    private readonly secretsService: AwsSecretsService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    const secrets = await this.secretsService.getSecret();

    const connectionString = `postgresql://${secrets.DB_USERNAME}:${secrets.DB_PASSWORD}@${secrets.DB_HOST}:${secrets.DB_PORT}/${secrets.DB_NAME}`;

    this.boss = new PgBoss({
      connectionString,
      schema: this.SCHEMA,
      monitorIntervalSeconds: 60,
      supervise: true,
      maintenanceIntervalSeconds: 300,
      migrate: true,
    });

    this.boss.on('error', (error) => {
      this.logger.error(`PgBoss error: ${error.message}`, error.stack, 'PgBossService');
    });

    await this.boss.start();
    this.logger.log(`PgBoss initialized with schema: ${this.SCHEMA}`, 'PgBossService');
    await this.registerQueues();
  }

  async onModuleDestroy() {
    if (this.boss) {
      await this.boss.stop();
      this.logger.log('PgBoss stopped', 'PgBossService');
    }
  }

  private async registerQueues() {
    const deadLetterQueues = new Set([PgBossQueueEnum.REGENERATE_CONTENT_DEAD_LETTER]);
    const queues = Object.values(PgBossQueueEnum);
    // Register dead letter queues first so they exist when referenced
    const ordered = [
      ...queues.filter((q) => deadLetterQueues.has(q as PgBossQueueEnum)),
      ...queues.filter((q) => !deadLetterQueues.has(q as PgBossQueueEnum)),
    ];
    for (const queueName of ordered) {
      const options = queueName === PgBossQueueEnum.REGENERATE_CONTENT
        ? { deadLetter: PgBossQueueEnum.REGENERATE_CONTENT_DEAD_LETTER }
        : {};
      await this.boss.createQueue(queueName, options);
      this.logger.log(`Registered PgBoss queue: ${queueName}`, 'PgBossService');
    }
  }

  async send<T extends object = any>(
    queueName: string,
    data: T,
    options?: SendOptions,
  ): Promise<string | null> {
    return this.boss.send(queueName, data, options);
  }

  async work<T = any>(
    queueName: string,
    handler: (jobs: Job<T>[]) => Promise<void>,
    options?: WorkOptions,
  ): Promise<void> {
    await this.boss.work(
      queueName,
      {
        batchSize: options?.batchSize || 1,
        pollingIntervalSeconds: options?.pollingIntervalSeconds || 2,
        ...options,
      },
      handler,
    );
    this.logger.log(`Registered worker for queue: ${queueName}`, 'PgBossService');
  }

  getInstance(): PgBoss {
    return this.boss;
  }
}
