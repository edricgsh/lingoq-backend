import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoContent } from 'src/entities/video-content.entity';
import { ContentVersion } from 'src/entities/content-version.entity';
import { VocabItem } from 'src/entities/vocab-item.entity';
import { SessionSummary } from 'src/entities/session-summary.entity';
import { Homework } from 'src/entities/homework.entity';
import { HomeworkQuestion } from 'src/entities/homework-question.entity';
import { LearningSession } from 'src/entities/learning-session.entity';
import { SubtitleCache } from 'src/entities/subtitle-cache.entity';
import { PgBossService } from 'src/modules/pg-boss/pg-boss.service';
import { SubtitleExtractorService } from 'src/modules/lambda/subtitle-extractor.service';
import { SupabaseService } from 'src/modules/supabase/supabase.service';
import { ClaudeService, LearnerContext } from 'src/modules/claude/claude.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';
import { JobStatus } from 'src/enums/job-status.enum';
import { ContentVersionStatus } from 'src/enums/content-version-status.enum';
import { ProficiencyLevel } from 'src/enums/proficiency-level.enum';
import { v4 as uuidv4 } from 'uuid';

interface JobData {
  videoContentId: string;
  userId: string;
  sessionId: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  nativeLanguage: string;
  targetLanguage: string;
  proficiencyLevel: ProficiencyLevel;
  customInstructions?: string | null;
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
  if (!codes) return false;
  const base = detectedLanguage.split('-')[0].toLowerCase();
  return !codes.some(c => c === detectedLanguage || c === base);
}

@Injectable()
export class SessionsWorker implements OnModuleInit {
  constructor(
    @InjectRepository(VideoContent)
    private readonly videoContentRepository: Repository<VideoContent>,
    @InjectRepository(ContentVersion)
    private readonly contentVersionRepository: Repository<ContentVersion>,
    @InjectRepository(VocabItem)
    private readonly vocabRepository: Repository<VocabItem>,
    @InjectRepository(SessionSummary)
    private readonly summaryRepository: Repository<SessionSummary>,
    @InjectRepository(Homework)
    private readonly homeworkRepository: Repository<Homework>,
    @InjectRepository(HomeworkQuestion)
    private readonly questionRepository: Repository<HomeworkQuestion>,
    @InjectRepository(LearningSession)
    private readonly sessionRepository: Repository<LearningSession>,
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
    const { videoContentId, userId, sessionId, youtubeUrl, youtubeVideoId, nativeLanguage, targetLanguage, proficiencyLevel, customInstructions } = data;

    // Create the shared ContentVersion for this video+level (pending → processing → completed/failed)
    const contentVersion = this.contentVersionRepository.create({
      id: uuidv4(),
      videoContentId,
      proficiencyLevel,
      userId: null,
      customInstructions: customInstructions ?? null,
      status: ContentVersionStatus.PROCESSING,
    });
    await this.contentVersionRepository.save(contentVersion);

    try {
      // VideoContent.jobStatus tracks subtitle extraction (the shared, non-level-specific work)
      await this.videoContentRepository.update(videoContentId, { jobStatus: JobStatus.PROCESSING });

      const context: LearnerContext = { nativeLanguage, targetLanguage, proficiencyLevel, customInstructions };

      // Step 1: Extract subtitles — check cache first
      this.logger.log(`Processing videoContent ${videoContentId}: Checking subtitle cache...`);
      const targetLangCode = LANGUAGE_NAME_TO_CODES[targetLanguage.toLowerCase()]?.[0];
      let lambdaResult: Awaited<ReturnType<SubtitleExtractorService['extractSubtitles']>>;

      const cachedEntry = await this.subtitleCacheRepo.findOne({ where: { youtubeVideoId } });
      if (cachedEntry) {
        this.logger.log(`Cache hit for videoId=${youtubeVideoId}`);
        lambdaResult = {
          statusCode: 200,
          subtitles: cachedEntry.subtitles,
          subtitlesVtt: cachedEntry.subtitlesVtt ?? undefined,
          language: cachedEntry.language ?? undefined,
          spokenLanguage: cachedEntry.spokenLanguage ?? undefined,
          title: cachedEntry.title ?? undefined,
        };
      } else {
        this.logger.log(`Extracting subtitles for videoContent ${videoContentId}...`);
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
        }
      }

      if (lambdaResult.statusCode !== 200 || !lambdaResult.subtitles) {
        throw new Error(lambdaResult.errorMessage || 'Failed to extract subtitles');
      }

      const detectedLanguage = lambdaResult.spokenLanguage || lambdaResult.language;
      if (detectedLanguage && isLanguageMismatch(targetLanguage, detectedLanguage)) {
        throw new Error(
          `This video is in a different language than your target language (${targetLanguage}). Please submit a video in ${targetLanguage}.`,
        );
      }

      // Resolve title
      let resolvedTitle = lambdaResult.title;
      if (!resolvedTitle) {
        try {
          const oembedRes = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`,
          );
          if (oembedRes.ok) {
            const oembed = (await oembedRes.json()) as { title?: string };
            resolvedTitle = oembed.title;
          }
        } catch (err) {
          this.logger.warn(`oEmbed title fetch failed: ${err.message}`);
        }
      }

      await this.videoContentRepository.update(videoContentId, {
        title: resolvedTitle,
        subtitlesVtt: lambdaResult.subtitlesVtt ?? null,
      });

      // Step 2: Thumbnail
      this.logger.log(`Uploading thumbnail for videoContent ${videoContentId}...`);
      try {
        const thumbnailCandidates = [
          `https://img.youtube.com/vi/${youtubeVideoId}/maxresdefault.jpg`,
          `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`,
        ];
        let thumbnailBuffer: Buffer | null = null;
        for (const candidateUrl of thumbnailCandidates) {
          const res = await fetch(candidateUrl);
          if (res.ok) { thumbnailBuffer = Buffer.from(await res.arrayBuffer()); break; }
        }
        if (thumbnailBuffer) {
          const thumbnailUrl = await this.supabaseService.uploadThumbnail(youtubeVideoId, thumbnailBuffer, 'image/jpeg');
          if (thumbnailUrl) await this.videoContentRepository.update(videoContentId, { thumbnailUrl });
        }
      } catch (err) {
        this.logger.warn(`Thumbnail upload failed: ${err.message}`);
      }

      // VideoContent extraction is done — mark completed
      await this.videoContentRepository.update(videoContentId, { jobStatus: JobStatus.COMPLETED });

      // Step 3: Generate content via Claude (tracked on ContentVersion)
      this.logger.log(`Generating vocab for contentVersion ${contentVersion.id}...`);
      const vocabResults = await this.claudeService.extractVocab(lambdaResult.subtitles, context);
      const vocabItems = vocabResults.map(v =>
        this.vocabRepository.create({
          id: uuidv4(),
          contentVersionId: contentVersion.id,
          word: v.word,
          partOfSpeech: v.partOfSpeech,
          definition: v.definition,
          examples: v.examples,
        }),
      );
      await this.vocabRepository.save(vocabItems);

      this.logger.log(`Generating summary for contentVersion ${contentVersion.id}...`);
      const summaryResult = await this.claudeService.generateSummary(lambdaResult.subtitles, context);
      await this.summaryRepository.save(
        this.summaryRepository.create({
          id: uuidv4(),
          contentVersionId: contentVersion.id,
          summaryTargetLang: summaryResult.summaryTargetLang,
          keyPhrases: summaryResult.keyPhrases,
        }),
      );

      this.logger.log(`Generating homework for contentVersion ${contentVersion.id}...`);
      const homeworkResult = await this.claudeService.generateHomework(
        lambdaResult.subtitles, vocabResults, summaryResult, context, youtubeUrl,
      );
      const homework = this.homeworkRepository.create({
        id: uuidv4(),
        contentVersionId: contentVersion.id,
      });
      await this.homeworkRepository.save(homework);
      await this.questionRepository.save(
        homeworkResult.questions.map(q =>
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
        ),
      );

      // Mark ContentVersion completed and point session at it
      await this.contentVersionRepository.update(contentVersion.id, { status: ContentVersionStatus.COMPLETED });
      await this.sessionRepository.update(sessionId, { activeContentVersionId: contentVersion.id });

      this.logger.log(`ContentVersion ${contentVersion.id} completed for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Processing failed for videoContent ${videoContentId}: ${error.message}`, error.stack);
      await this.videoContentRepository.update(videoContentId, {
        jobStatus: JobStatus.FAILED,
        errorMessage: error.message,
      });
      await this.contentVersionRepository.update(contentVersion.id, {
        status: ContentVersionStatus.FAILED,
        errorMessage: error.message,
      });
    }
  }
}
