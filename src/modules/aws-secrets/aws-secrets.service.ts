import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class SecretData {
  DB_HOST?: string;
  DB_NAME?: string;
  DB_PASSWORD?: string;
  DB_PORT?: string;
  DB_USERNAME?: string;
  COGNITO_CLIENT_ID?: string;
  COGNITO_USERPOOLID?: string;
  COGNITO_REGION?: string;
  COGNITO_AUTH_URL?: string;
  ANTHROPIC_API_KEY?: string;
  SUPADATA_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_API_KEY?: string;
  LINGOQ_BE_API_KEY?: string;
  RESEND_API_KEY?: string;
  LANGSMITH_API_KEY?: string;
}

@Injectable()
export class AwsSecretsService {
  private readonly secretsManagerClient: SecretsManagerClient;
  private secretCache = new Map<string, SecretData>();
  private secretName: string;

  constructor(private configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    const endpoint = this.configService.get<string>('AWS_ENDPOINT');
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    this.secretsManagerClient = new SecretsManagerClient({
      region,
      ...(nodeEnv === 'local' && endpoint ? { endpoint } : {}),
    });
    this.secretName = this.configService.get<string>('AWS_SECRET_NAME');

    if (!this.secretName || this.secretName.trim() === '') {
      throw new Error('AWS_SECRET_NAME is required but not configured.');
    }
  }

  async getSecret(): Promise<SecretData> {
    try {
      const secretName = this.secretName;
      if (this.secretCache.has(secretName)) {
        return this.secretCache.get(secretName);
      }

      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await this.secretsManagerClient.send(command);
      const secretString = response.SecretString;

      if (!secretString) {
        throw new Error('Secret value is empty');
      }

      const parsedSecret = JSON.parse(secretString);
      this.secretCache.set(secretName, parsedSecret);
      return parsedSecret;
    } catch (error) {
      throw new Error(`Failed to get secret: ${error.message}`);
    }
  }
}
