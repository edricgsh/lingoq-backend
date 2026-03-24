import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoContent } from 'src/entities/video-content.entity';
import { VocabItem } from 'src/entities/vocab-item.entity';
import { SessionSummary } from 'src/entities/session-summary.entity';
import { Homework } from 'src/entities/homework.entity';
import { HomeworkQuestion } from 'src/entities/homework-question.entity';
import { SubtitleCache } from 'src/entities/subtitle-cache.entity';
import { PgBossService } from 'src/modules/pg-boss/pg-boss.service';
import { SubtitleExtractorService } from 'src/modules/lambda/subtitle-extractor.service';
import { SupabaseService } from 'src/modules/supabase/supabase.service';
import { ClaudeService, LearnerContext } from 'src/modules/claude/claude.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';
import { JobStatus } from 'src/enums/job-status.enum';
import { ProficiencyLevel } from 'src/enums/proficiency-level.enum';
import { v4 as uuidv4 } from 'uuid';

interface JobData {
  videoContentId: string;
  userId: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  nativeLanguage: string;
  targetLanguage: string;
  proficiencyLevel: ProficiencyLevel;
}

// Map full language names (from onboarding) to ISO 639-1 codes used by the lambda
const LANGUAGE_NAME_TO_CODES: Record<string, string[]> = {
  spanish: ['es', 'es-auto'],
  english: ['en'],
  french: ['fr'],
  german: ['de'],
  portuguese: ['pt'],
  italian: ['it'],
  japanese: ['ja'],
  korean: ['ko'],
  chinese: ['zh'],
  arabic: ['ar'],
  russian: ['ru'],
};

function isLanguageMismatch(targetLanguage: string, detectedLanguage: string): boolean {
  const codes = LANGUAGE_NAME_TO_CODES[targetLanguage.toLowerCase()];
  if (!codes) return false; // unknown language — don't block
  // Normalise to base code (e.g. 'es-419' → 'es', 'en-US' → 'en')
  const base = detectedLanguage.split('-')[0].toLowerCase();
  return !codes.some(c => c === detectedLanguage || c === base);
}

@Injectable()
export class SessionsWorker implements OnModuleInit {
  constructor(
    @InjectRepository(VideoContent)
    private readonly videoContentRepository: Repository<VideoContent>,
    @InjectRepository(VocabItem)
    private readonly vocabRepository: Repository<VocabItem>,
    @InjectRepository(SessionSummary)
    private readonly summaryRepository: Repository<SessionSummary>,
    @InjectRepository(Homework)
    private readonly homeworkRepository: Repository<Homework>,
    @InjectRepository(HomeworkQuestion)
    private readonly questionRepository: Repository<HomeworkQuestion>,
    @InjectRepository(SubtitleCache)
    private readonly subtitleCacheRepo: Repository<SubtitleCache>,
    private readonly pgBossService: PgBossService,
    private readonly subtitleExtractorService: SubtitleExtractorService,
    private readonly supabaseService: SupabaseService,
    private readonly claudeService: ClaudeService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    await this.pgBossService.work<JobData>(
      PgBossQueueEnum.PROCESS_YOUTUBE_URL,
      async (jobs) => {
        for (const job of jobs) {
          await this.processJob(job.data);
        }
      },
      { batchSize: 1 },
    );
  }

  private async processJob(data: JobData) {
    const { videoContentId, youtubeUrl, youtubeVideoId, nativeLanguage, targetLanguage, proficiencyLevel } = data;

    try {
      // Update status to processing, and clear any partial data from a previous attempt
      await this.videoContentRepository.update(videoContentId, { jobStatus: JobStatus.PROCESSING });
      await this.vocabRepository.delete({ videoContentId });
      await this.summaryRepository.delete({ videoContentId });
      const existingHomework = await this.homeworkRepository.findOne({ where: { videoContentId } });
      if (existingHomework) {
        await this.questionRepository.delete({ homeworkId: existingHomework.id });
        await this.homeworkRepository.delete({ videoContentId });
      }

      const context: LearnerContext = { nativeLanguage, targetLanguage, proficiencyLevel };

      // Step 1: Extract subtitles (via Supadata or Lambda depending on SUBTITLE_EXTRACTOR_MODE)
      // Check cache first
      this.logger.log(`Processing videoContent ${videoContentId}: Checking subtitle cache for videoId=${youtubeVideoId}...`);
      const targetLangCode = LANGUAGE_NAME_TO_CODES[targetLanguage.toLowerCase()]?.[0];
      let lambdaResult: Awaited<ReturnType<SubtitleExtractorService['extractSubtitles']>>;

      const cachedEntry = await this.subtitleCacheRepo.findOne({ where: { youtubeVideoId } });
      if (cachedEntry) {
        this.logger.log(`Cache hit for videoId=${youtubeVideoId}, skipping subtitle extraction`);
        lambdaResult = {
          statusCode: 200,
          subtitles: cachedEntry.subtitles,
          subtitlesVtt: cachedEntry.subtitlesVtt ?? undefined,
          language: cachedEntry.language ?? undefined,
          spokenLanguage: cachedEntry.spokenLanguage ?? undefined,
          title: cachedEntry.title ?? undefined,
        };
      } else {
        this.logger.log(`Processing videoContent ${videoContentId}: Extracting subtitles...`);
        lambdaResult = await this.subtitleExtractorService.extractSubtitles(youtubeUrl, youtubeVideoId, targetLangCode);

        if (lambdaResult.statusCode === 200 && lambdaResult.subtitles) {
          await this.subtitleCacheRepo.save(
            this.subtitleCacheRepo.create({
              id: uuidv4(),
              youtubeVideoId,
              subtitles: lambdaResult.subtitles,
              subtitlesVtt: lambdaResult.subtitlesVtt ?? null,
              language: lambdaResult.language ?? null,
              spokenLanguage: lambdaResult.spokenLanguage ?? null,
              title: lambdaResult.title ?? null,
            }),
          );
          this.logger.log(`Cached subtitles for videoId=${youtubeVideoId}`);
        }
      }

      if (lambdaResult.statusCode !== 200 || !lambdaResult.subtitles) {
        throw new Error(lambdaResult.errorMessage || 'Failed to extract subtitles');
      }

      // Reject videos whose language doesn't match the user's target language.
      const detectedLanguage = lambdaResult.spokenLanguage || lambdaResult.language;
      if (detectedLanguage && isLanguageMismatch(targetLanguage, detectedLanguage)) {
        throw new Error(
          `This video is in a different language than your target language (${targetLanguage}). Please submit a video in ${targetLanguage}.`,
        );
      }

      // Resolve title: prefer extractor result, fall back to YouTube oEmbed (free, no API key)
      let resolvedTitle = lambdaResult.title;
      if (!resolvedTitle) {
        try {
          const oembedRes = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`,
          );
          if (oembedRes.ok) {
            const oembed = (await oembedRes.json()) as { title?: string };
            resolvedTitle = oembed.title;
            this.logger.log(`Resolved title via oEmbed for videoContent ${videoContentId}: "${resolvedTitle}"`);
          }
        } catch (err) {
          this.logger.warn(`oEmbed title fetch failed for videoContent ${videoContentId}: ${err.message}`);
        }
      }

      // Update title and VTT subtitles on VideoContent
      await this.videoContentRepository.update(videoContentId, {
        title: resolvedTitle,
        subtitlesVtt: lambdaResult.subtitlesVtt ?? null,
      });

      // Step 2: Fetch and upload thumbnail to Supabase
      this.logger.log(`Processing videoContent ${videoContentId}: Uploading thumbnail...`);
      try {
        const thumbnailCandidates = [
          `https://img.youtube.com/vi/${youtubeVideoId}/maxresdefault.jpg`,
          `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`,
        ];
        let thumbnailBuffer: Buffer | null = null;
        for (const candidateUrl of thumbnailCandidates) {
          const res = await fetch(candidateUrl);
          if (res.ok) {
            thumbnailBuffer = Buffer.from(await res.arrayBuffer());
            break;
          }
        }
        if (thumbnailBuffer) {
          const thumbnailUrl = await this.supabaseService.uploadThumbnail(
            youtubeVideoId,
            thumbnailBuffer,
            'image/jpeg',
          );
          if (thumbnailUrl) {
            await this.videoContentRepository.update(videoContentId, { thumbnailUrl });
            this.logger.log(`Thumbnail uploaded successfully for videoContent ${videoContentId}: ${thumbnailUrl}`);
          } else {
            this.logger.warn(`uploadThumbnail returned no URL for videoContent ${videoContentId}`);
          }
        } else {
          this.logger.warn(`No thumbnail buffer found for videoContent ${videoContentId} (youtubeVideoId=${youtubeVideoId})`);
        }
      } catch (err) {
        this.logger.warn(`Failed to upload thumbnail for videoContent ${videoContentId}: ${err.message}`);
      }

      // Step 3: Extract vocab via Claude
      this.logger.log(`Processing videoContent ${videoContentId}: Extracting vocabulary...`);
      const vocabResults = await this.claudeService.extractVocab(lambdaResult.subtitles, context);

      const vocabItems = vocabResults.map(v =>
        this.vocabRepository.create({
          id: uuidv4(),
          videoContentId,
          word: v.word,
          partOfSpeech: v.partOfSpeech,
          definition: v.definition,
          examples: v.examples,
        }),
      );
      await this.vocabRepository.save(vocabItems);

      // Step 4: Generate summary via Claude
      this.logger.log(`Processing videoContent ${videoContentId}: Generating summary...`);
      const summaryResult = await this.claudeService.generateSummary(lambdaResult.subtitles, context);

      const summary = this.summaryRepository.create({
        id: uuidv4(),
        videoContentId,
        summaryTargetLang: summaryResult.summaryTargetLang,
        keyPhrases: summaryResult.keyPhrases,
      });
      await this.summaryRepository.save(summary);

      // Step 5: Generate homework via Claude
      this.logger.log(`Processing videoContent ${videoContentId}: Generating homework...`);
      const homeworkResult = await this.claudeService.generateHomework(
        lambdaResult.subtitles,
        vocabResults,
        context,
        youtubeUrl,
      );

      const homework = this.homeworkRepository.create({
        id: uuidv4(),
        videoContentId,
      });
      await this.homeworkRepository.save(homework);

      const questions = homeworkResult.questions.map(q =>
        this.questionRepository.create({
          id: uuidv4(),
          homeworkId: homework.id,
          questionType: q.questionType,
          questionText: q.questionText,
          expectedAnswer: q.expectedAnswer,
          orderIndex: q.orderIndex,
          options: q.options ?? null,
          correctAnswer: q.correctAnswer ?? null,
          videoHintUrl: q.videoHintUrl ?? null,
        }),
      );
      await this.questionRepository.save(questions);

      // Step 6: Mark as completed
      await this.videoContentRepository.update(videoContentId, { jobStatus: JobStatus.COMPLETED });
      this.logger.log(`VideoContent ${videoContentId} processing completed successfully`);
    } catch (error) {
      this.logger.error(`VideoContent ${videoContentId} processing failed: ${error.message}`, error.stack);
      await this.videoContentRepository.update(videoContentId, {
        jobStatus: JobStatus.FAILED,
        errorMessage: error.message,
      });
    }
  }
}
