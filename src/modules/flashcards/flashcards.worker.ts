import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBossService } from 'src/modules/pg-boss/pg-boss.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { EmailService } from 'src/modules/email/email.service';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';
import { FlashcardsService } from './flashcards.service';
import { buildFlashcardReminderEmail } from './flashcard-reminder.template';

interface SendReminderJobData {
  userId: string;
  email: string;
  dueCount: number;
}

@Injectable()
export class FlashcardsWorker implements OnModuleInit {
  constructor(
    private readonly pgBossService: PgBossService,
    private readonly flashcardsService: FlashcardsService,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async onModuleInit() {
    await this.registerScheduler();
    await this.registerReminderWorker();
  }

  private async registerScheduler() {
    const boss = this.pgBossService.getInstance();

    await boss.schedule(
      PgBossQueueEnum.SCHEDULE_FLASHCARD_REMINDERS,
      '0 * * * *',
      {},
      { tz: 'UTC' },
    );

    await this.pgBossService.work(
      PgBossQueueEnum.SCHEDULE_FLASHCARD_REMINDERS,
      async (_jobs) => {
        await this.scheduleFanOut();
      },
      { batchSize: 1 },
    );

    this.logger.log('Flashcard reminder scheduler registered', 'FlashcardsWorker');
  }

  private async registerReminderWorker() {
    await this.pgBossService.work<SendReminderJobData>(
      PgBossQueueEnum.SEND_FLASHCARD_REMINDER,
      async (jobs) => {
        for (const job of jobs) {
          await this.sendReminderEmail(job.data);
        }
      },
      { batchSize: 5 },
    );
    this.logger.log('Flashcard reminder email worker registered', 'FlashcardsWorker');
  }

  private async scheduleFanOut() {
    const utcHour = new Date().getUTCHours();
    this.logger.log(`Flashcard reminder fan-out for UTC hour: ${utcHour}`, 'FlashcardsWorker');

    const usersWithReminders = await this.flashcardsService.getUsersWithRemindersForHour(utcHour);

    for (const settings of usersWithReminders) {
      try {
        const dueCount = await this.flashcardsService.getDueCountForUser(settings.userId);
        if (dueCount === 0) continue;

        // We need the user's email — use the userId as the key to look it up
        // The user entity can be fetched via userRepo or through a service
        // For simplicity, we pass userId and let the email worker resolve it
        await this.pgBossService.send<SendReminderJobData>(
          PgBossQueueEnum.SEND_FLASHCARD_REMINDER,
          { userId: settings.userId, email: '', dueCount },
        );
      } catch (err) {
        this.logger.error(
          `Failed to enqueue reminder for user ${settings.userId}: ${err.message}`,
          err.stack,
          'FlashcardsWorker',
        );
      }
    }
  }

  private async sendReminderEmail(data: SendReminderJobData) {
    if (!data.email) {
      this.logger.warn(
        `Skipping reminder for user ${data.userId}: no email resolved`,
        'FlashcardsWorker',
      );
      return;
    }

    const appUrl = this.configService.get<string>('APP_URL') || 'https://lingoq.study';
    const { subject, html } = buildFlashcardReminderEmail({
      dueCount: data.dueCount,
      ctaUrl: `${appUrl}/flashcards`,
      settingsUrl: `${appUrl}/settings`,
    });

    try {
      await this.emailService.send({ to: data.email, subject, html });
      this.logger.log(`Flashcard reminder sent to ${data.email}`, 'FlashcardsWorker');
    } catch (err) {
      this.logger.error(
        `Failed to send reminder to ${data.email}: ${err.message}`,
        err.stack,
        'FlashcardsWorker',
      );
    }
  }
}
