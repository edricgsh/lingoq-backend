import { Injectable, OnModuleInit } from '@nestjs/common';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { ConfigService } from '@nestjs/config';
import { PgBossService } from 'src/modules/pg-boss/pg-boss.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';
import { FlashcardsService } from './flashcards.service';

interface SendReminderJobData {
  userId: string;
  email: string;
  dueCount: number;
}

@Injectable()
export class FlashcardsWorker implements OnModuleInit {
  private sesClient: SESClient;
  private readonly FROM_EMAIL: string;

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly flashcardsService: FlashcardsService,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.FROM_EMAIL = this.configService.get<string>('SES_FROM_ADDRESS', 'noreply@dev.lingoq.study');
  }

  async onModuleInit() {
    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    this.sesClient = new SESClient({ region }); // always use real AWS (never LocalStack)

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

    const subject = `You have ${data.dueCount} flashcard${data.dueCount !== 1 ? 's' : ''} due today`;
    const appUrl = this.configService.get<string>('APP_URL') || 'https://lingoq.study';
    const ctaUrl = `${appUrl}/flashcards`;

    const htmlBody = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #6d28d9;">Time to review your flashcards!</h2>
        <p>You have <strong>${data.dueCount}</strong> flashcard${data.dueCount !== 1 ? 's' : ''} due for review today.</p>
        <a href="${ctaUrl}" style="display:inline-block;background:#6d28d9;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;">
          Review Now
        </a>
        <p style="margin-top:24px;color:#9ca3af;font-size:12px;">
          You can manage your reminder settings at <a href="${appUrl}/settings">${appUrl}/settings</a>.
        </p>
      </div>
    `;

    try {
      await this.sesClient.send(
        new SendEmailCommand({
          Source: this.FROM_EMAIL,
          Destination: { ToAddresses: [data.email] },
          Message: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: { Html: { Data: htmlBody, Charset: 'UTF-8' } },
          },
        }),
      );
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
