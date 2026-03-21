import { Global, Module } from '@nestjs/common';
import { AwsSecretsService } from './aws-secrets.service';

@Global()
@Module({
  providers: [AwsSecretsService],
  exports: [AwsSecretsService],
})
export class AwsSecretsModule {}
