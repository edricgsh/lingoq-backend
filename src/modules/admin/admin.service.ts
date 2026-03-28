import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { PgBossService } from 'src/modules/pg-boss/pg-boss.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';

export interface JobPayloadField {
  name: string;
  type: 'string' | 'number';
  required: boolean;
  description: string;
}

export interface JobDefinition {
  queue: PgBossQueueEnum;
  label: string;
  description: string;
  payloadFields: JobPayloadField[];
}

export interface EmailTemplateField {
  name: string;
  type: 'string' | 'number';
  required: boolean;
}

export interface EmailTemplate {
  name: string;
  label: string;
  description: string;
  fields: EmailTemplateField[];
}

@Injectable()
export class AdminService {
  private sesClient: SESClient;
  private readonly FROM_EMAIL: string;

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    this.sesClient = new SESClient({ region }); // always use real AWS (never LocalStack)
    this.FROM_EMAIL = this.configService.get<string>('SES_FROM_ADDRESS', 'noreply@dev.lingoq.study');
  }

  async triggerJob(queue: PgBossQueueEnum, payload: Record<string, any>): Promise<{ jobId: string | null; queue: string; triggeredAt: string }> {
    const jobId = await this.pgBossService.send(queue, payload);
    this.logger.log(`Admin triggered job: ${queue}, jobId: ${jobId}`, 'AdminService');
    return { jobId, queue, triggeredAt: new Date().toISOString() };
  }

  getJobDefinitions(): JobDefinition[] {
    return [
      {
        queue: PgBossQueueEnum.SCHEDULE_FLASHCARD_REMINDERS,
        label: 'Schedule Flashcard Reminders',
        description: 'Fan-out reminder emails to users whose reminder hour matches now',
        payloadFields: [],
      },
      {
        queue: PgBossQueueEnum.SEND_FLASHCARD_REMINDER,
        label: 'Send Flashcard Reminder',
        description: 'Send a reminder email to a specific user',
        payloadFields: [
          { name: 'userId', type: 'string', required: true, description: 'User UUID' },
          { name: 'email', type: 'string', required: true, description: 'Recipient email' },
          { name: 'dueCount', type: 'number', required: true, description: 'Number of due cards' },
        ],
      },
      {
        queue: PgBossQueueEnum.EXPLORE_GENERATE_RECOMMENDATIONS,
        label: 'Backfill Explore Recommendations',
        description: 'Generate and cache YouTube recommendations for a user\'s interest topics',
        payloadFields: [
          { name: 'topics', type: 'string', required: true, description: 'Comma-separated topic names (e.g. food,travel,music)' },
          { name: 'targetLanguage', type: 'string', required: true, description: 'Target language (e.g. Spanish)' },
        ],
      },
    ];
  }

  getEmailConfig(): { templates: EmailTemplate[] } {
    return {
      templates: [
        {
          name: 'FLASHCARD_REMINDER',
          label: 'Flashcard Reminder',
          description: 'Reminder email for due flashcards',
          fields: [
            { name: 'recipientEmail', type: 'string', required: true },
            { name: 'dueCount', type: 'number', required: true },
          ],
        },
      ],
    };
  }

  async sendTestEmail(
    recipientEmail: string,
    templateName: string,
    templateData: Record<string, any>,
  ): Promise<{ success: boolean; messageId?: string }> {
    if (templateName === 'FLASHCARD_REMINDER') {
      return this.sendFlashcardReminderEmail(recipientEmail, templateData.dueCount ?? 0);
    }
    throw new Error(`Unknown template: ${templateName}`);
  }

  private async sendFlashcardReminderEmail(
    recipientEmail: string,
    dueCount: number,
  ): Promise<{ success: boolean; messageId?: string }> {
    const subject = `You have ${dueCount} flashcard${dueCount !== 1 ? 's' : ''} due today`;
    const appUrl = this.configService.get<string>('APP_URL') || 'https://lingoq.study';
    const ctaUrl = `${appUrl}/flashcards`;

    const htmlBody = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #6d28d9;">Time to review your flashcards!</h2>
        <p>You have <strong>${dueCount}</strong> flashcard${dueCount !== 1 ? 's' : ''} due for review today.</p>
        <a href="${ctaUrl}" style="display:inline-block;background:#6d28d9;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;">
          Review Now
        </a>
        <p style="margin-top:24px;color:#9ca3af;font-size:12px;">
          You can manage your reminder settings at <a href="${appUrl}/settings">${appUrl}/settings</a>.
        </p>
      </div>
    `;

    const result = await this.sesClient.send(
      new SendEmailCommand({
        Source: this.FROM_EMAIL,
        Destination: { ToAddresses: [recipientEmail] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: { Html: { Data: htmlBody, Charset: 'UTF-8' } },
        },
      }),
    );

    this.logger.log(`Test flashcard reminder sent to ${recipientEmail}`, 'AdminService');
    return { success: true, messageId: result.MessageId };
  }
}
