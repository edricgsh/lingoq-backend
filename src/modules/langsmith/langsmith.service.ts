import { Injectable, OnModuleInit } from '@nestjs/common';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';
import { LoggerService } from 'src/modules/logger/logger.service';

@Injectable()
export class LangSmithService implements OnModuleInit {
  constructor(
    private readonly secretsService: AwsSecretsService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    const secrets = await this.secretsService.getSecret();
    if (secrets.LANGSMITH_API_KEY) {
      process.env.LANGSMITH_API_KEY = secrets.LANGSMITH_API_KEY;
      this.logger.log('LangSmith tracing enabled');
    } else {
      this.logger.warn('LANGSMITH_API_KEY not found — tracing disabled');
    }
  }
}
