import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from 'src/modules/logger/logger.service';
import { LambdaService, SubtitleResponse } from './lambda.service';
import { SupadataService } from './supadata.service';

export type SubtitleExtractorMode = 'supadata' | 'lambda';

@Injectable()
export class SubtitleExtractorService {
  private readonly mode: SubtitleExtractorMode;

  constructor(
    private readonly configService: ConfigService,
    private readonly lambdaService: LambdaService,
    private readonly supadataService: SupadataService,
    private readonly logger: LoggerService,
  ) {
    const raw = this.configService.get<string>('SUBTITLE_EXTRACTOR_MODE') ?? 'supadata';
    this.mode = raw === 'lambda' ? 'lambda' : 'supadata';
    this.logger.log(`initialized with mode="${this.mode}" (raw env="${raw}")`);
  }

  async extractSubtitles(youtubeUrl: string, videoId: string, lang?: string): Promise<SubtitleResponse> {
    this.logger.log(`SubtitleExtractorService: extracting subtitles mode="${this.mode}" videoId=${videoId}`);
    if (this.mode === 'lambda') {
      return this.lambdaService.extractSubtitles(youtubeUrl, videoId);
    }
    return this.supadataService.extractSubtitles(youtubeUrl, videoId, lang);
  }
}
