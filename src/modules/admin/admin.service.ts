import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  MessageActionType,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { PgBossService } from 'src/modules/pg-boss/pg-boss.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';
import { AuthService } from 'src/modules/auth/auth.service';
import { EmailService } from 'src/modules/email/email.service';
import { buildFlashcardReminderEmail } from 'src/modules/flashcards/flashcard-reminder.template';
import { User } from 'src/entities/user.entity';

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
  private cognitoClient: CognitoIdentityProviderClient;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly pgBossService: PgBossService,
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly secretsService: AwsSecretsService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
  ) {
    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    this.cognitoClient = new CognitoIdentityProviderClient({ region });
  }

  async adminCreateUser(name: string, email: string, password: string): Promise<{ id: string; email: string; name: string; cognitoId: string }> {
    const normalizedEmail = email.toLowerCase();
    const secrets = await this.secretsService.getSecret();

    const listResult = await this.cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: secrets.COGNITO_USERPOOLID,
        Filter: `email = "${normalizedEmail}"`,
      }),
    );
    if (listResult.Users && listResult.Users.length > 0) {
      throw new BadRequestException(`User with email ${normalizedEmail} already exists in Cognito`);
    }

    const existingUser = await this.userRepository.findOne({ where: { email: normalizedEmail } });
    if (existingUser) {
      throw new BadRequestException(`User with email ${normalizedEmail} already exists in database`);
    }

    const createResult = await this.cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: secrets.COGNITO_USERPOOLID,
        Username: normalizedEmail,
        UserAttributes: [
          { Name: 'email', Value: normalizedEmail },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: name },
        ],
        MessageAction: MessageActionType.SUPPRESS,
        TemporaryPassword: password,
      }),
    );

    const cognitoId = createResult.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
    if (!cognitoId) throw new BadRequestException('Failed to retrieve Cognito sub from created user');

    await this.cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: secrets.COGNITO_USERPOOLID,
        Username: normalizedEmail,
        Password: password,
        Permanent: true,
      }),
    );

    const user = await this.authService.syncUser({ cognitoId, email: normalizedEmail, name });

    this.logger.log(`Admin created user: ${normalizedEmail}`, 'AdminService');
    return { id: user.id, email: user.email, name: user.name, cognitoId: user.cognitoId };
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
  ): Promise<{ success: boolean }> {
    const appUrl = this.configService.get<string>('APP_URL') || 'https://lingoq.study';
    const { subject, html } = buildFlashcardReminderEmail({
      dueCount,
      ctaUrl: `${appUrl}/flashcards`,
      settingsUrl: `${appUrl}/settings`,
    });

    await this.emailService.send({ to: recipientEmail, subject, html });

    this.logger.log(`Test flashcard reminder sent to ${recipientEmail}`, 'AdminService');
    return { success: true };
  }
}
