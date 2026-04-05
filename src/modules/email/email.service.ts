import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { LoggerService } from 'src/modules/logger/logger.service';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';
import { EMAIL_PROVIDER, EmailProvider } from 'src/constants/feature-flags';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  /** HTML body (preferred) */
  html?: string;
  /** Plain-text fallback */
  text?: string;
}

@Injectable()
export class EmailService {
  private sesClient: SESClient | null = null;
  private readonly fromAddress: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly secretsService: AwsSecretsService,
  ) {
    this.fromAddress = this.configService.get<string>(
      'EMAIL_FROM_ADDRESS',
      'noreply@dev.lingoq.study',
    );

    if (EMAIL_PROVIDER === EmailProvider.SES) {
      const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
      this.sesClient = new SESClient({ region });
    }
  }

  async send(opts: SendEmailOptions): Promise<void> {
    const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];

    if (EMAIL_PROVIDER === EmailProvider.RESEND) {
      await this.sendViaResend(recipients, opts);
    } else {
      await this.sendViaSes(recipients, opts);
    }
  }

  // ---------------------------------------------------------------------------
  // SES
  // ---------------------------------------------------------------------------

  private async sendViaSes(
    recipients: string[],
    opts: SendEmailOptions,
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (opts.html) body['Html'] = { Data: opts.html, Charset: 'UTF-8' };
    if (opts.text) body['Text'] = { Data: opts.text, Charset: 'UTF-8' };

    try {
      await this.sesClient!.send(
        new SendEmailCommand({
          Source: this.fromAddress,
          Destination: { ToAddresses: recipients },
          Message: {
            Subject: { Data: opts.subject, Charset: 'UTF-8' },
            Body: body as any,
          },
        }),
      );
      this.logger.log(
        `[SES] Email sent to ${recipients.join(', ')}: "${opts.subject}"`,
        'EmailService',
      );
    } catch (err) {
      this.logger.error(
        `[SES] Failed to send email to ${recipients.join(', ')}: ${err.message}`,
        err.stack,
        'EmailService',
      );
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Resend
  // ---------------------------------------------------------------------------

  private async sendViaResend(
    recipients: string[],
    opts: SendEmailOptions,
  ): Promise<void> {
    const secrets = await this.secretsService.getSecret();
    const apiKey = secrets.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured in secrets');
    }

    const payload: Record<string, unknown> = {
      from: this.fromAddress,
      to: recipients,
      subject: opts.subject,
    };
    if (opts.html) payload['html'] = opts.html;
    if (opts.text) payload['text'] = opts.text;

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Resend API error ${response.status}: ${body}`);
      }

      this.logger.log(
        `[Resend] Email sent to ${recipients.join(', ')}: "${opts.subject}"`,
        'EmailService',
      );
    } catch (err) {
      this.logger.error(
        `[Resend] Failed to send email to ${recipients.join(', ')}: ${err.message}`,
        err.stack,
        'EmailService',
      );
      throw err;
    }
  }
}
