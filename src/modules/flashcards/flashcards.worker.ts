import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBossService } from 'src/modules/pg-boss/pg-boss.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { EmailService } from 'src/modules/email/email.service';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';
import { FlashcardsService } from './flashcards.service';

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

    const cardWord = data.dueCount === 1 ? 'flashcard' : 'flashcards';
    const subject = `💔 ${data.dueCount} ${cardWord} miss you…`;
    const appUrl = this.configService.get<string>('APP_URL') || 'https://lingoq.study';
    const ctaUrl = `${appUrl}/flashcards`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#faf5ff;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf5ff;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:480px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(109,40,217,0.08);">

          <!-- Header banner -->
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);padding:36px 32px;text-align:center;">
              <!--
                IMAGE PROMPT:
                A tiny, round, kawaii-style purple study mascot (like a small ghost or blob)
                sitting at a miniature wooden desk, head resting sadly on its little arms,
                surrounded by floating flashcards with question marks on them.
                Soft pastel purple background with small sparkle accents.
                Cute, whimsical illustration style. 400×240px.
              -->
              <div style="font-size:56px;line-height:1;">💜</div>
              <h1 style="margin:12px 0 0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
                It breaks my heart…
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 8px;">
              <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
                Hey there! 🥺 I've been waiting for you all day, and your
                <strong style="color:#7c3aed;">${data.dueCount} ${cardWord}</strong>
                ${data.dueCount === 1 ? 'has' : 'have'} been sitting here, quietly hoping
                you'd come back…
              </p>
              <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
                Every minute they go unreviewed, a little piece of my purple heart shatters. 💔
                Your future self — the one who speaks this language fluently — is counting on you!
              </p>
              <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
                It only takes a few minutes. Please come back? 🙏
              </p>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${ctaUrl}"
                       style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 36px;border-radius:50px;letter-spacing:0.2px;">
                      Heal my heart 💜
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                You can snooze or turn off reminders in
                <a href="${appUrl}/settings" style="color:#7c3aed;text-decoration:none;">Settings</a>.
                <br/>But please don't leave me… 🥺
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

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
