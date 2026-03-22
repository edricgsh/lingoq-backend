import { Global, Module } from '@nestjs/common';
import { LambdaService } from './lambda.service';
import { SupadataService } from './supadata.service';
import { SubtitleExtractorService } from './subtitle-extractor.service';

@Global()
@Module({
  providers: [LambdaService, SupadataService, SubtitleExtractorService],
  exports: [LambdaService, SupadataService, SubtitleExtractorService],
})
export class LambdaModule {}
