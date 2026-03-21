import { Injectable, OnModuleInit } from '@nestjs/common';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { ConfigService } from '@nestjs/config';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';
import { LoggerService } from 'src/modules/logger/logger.service';

export interface SubtitleResponse {
  statusCode: number;
  title?: string;
  language?: string;       // subtitle language (es, en, es-auto)
  spokenLanguage?: string; // original spoken language from video metadata (es, en, …)
  subtitles?: string;
  subtitlesVtt?: string;
  errorMessage?: string;
}

@Injectable()
export class LambdaService implements OnModuleInit {
  private lambdaClient: LambdaClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    const endpoint = this.configService.get<string>('AWS_ENDPOINT');
    const nodeEnv = this.configService.get<string>('NODE_ENV');

    this.lambdaClient = new LambdaClient({
      region,
      ...(nodeEnv === 'local' && endpoint ? { endpoint } : {}),
    });
  }

  async extractSubtitles(youtubeUrl: string, videoId: string): Promise<SubtitleResponse> {
    const payload = JSON.stringify({ youtube_url: youtubeUrl, video_id: videoId });

    const command = new InvokeCommand({
      FunctionName: 'learn-spanish-subtitle-extractor',
      Payload: Buffer.from(payload),
    });

    const response = await this.lambdaClient.send(command);
    const responsePayload = Buffer.from(response.Payload).toString('utf-8');
    return JSON.parse(responsePayload) as SubtitleResponse;
  }
}
