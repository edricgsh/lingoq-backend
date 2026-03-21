import { Global, Module } from '@nestjs/common';
import { LambdaService } from './lambda.service';

@Global()
@Module({
  providers: [LambdaService],
  exports: [LambdaService],
})
export class LambdaModule {}
