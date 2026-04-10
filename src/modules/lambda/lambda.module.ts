import { Global, Module } from '@nestjs/common';
import { LambdaService } from './lambda.service';
import { SupadataService } from './supadata.service';
import { SubtitleExtractorService } from './subtitle-extractor.service';
import { SupadataApiKeyModule } from 'src/modules/supadata-api-key/supadata-api-key.module';

@Global()
@Module({
  imports: [SupadataApiKeyModule],
  providers: [LambdaService, SupadataService, SubtitleExtractorService],
  exports: [LambdaService, SupadataService, SubtitleExtractorService],
})
export class LambdaModule {}
