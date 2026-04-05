import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentVersion } from 'src/entities/content-version.entity';
import { VocabItem } from 'src/entities/vocab-item.entity';
import { SessionSummary } from 'src/entities/session-summary.entity';
import { Homework } from 'src/entities/homework.entity';
import { HomeworkQuestion } from 'src/entities/homework-question.entity';
import { LearningSession } from 'src/entities/learning-session.entity';
import { VideoContent } from 'src/entities/video-content.entity';
import { SubtitleCache } from 'src/entities/subtitle-cache.entity';
import { PgBossService } from 'src/modules/pg-boss/pg-boss.service';
import { ClaudeService, LearnerContext } from 'src/modules/claude/claude.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';
import { ContentVersionStatus } from 'src/enums/content-version-status.enum';
import { ProficiencyLevel } from 'src/enums/proficiency-level.enum';
import { v4 as uuidv4 } from 'uuid';

export type RegenerateTarget = 'vocab' | 'summary' | 'homework';

export interface RegenerateJobData {
  videoContentId: string;
  userId: string;
  sessionId: string;
  targets: RegenerateTarget[];
  customInstructions?: string;
  nativeLanguage: string;
  targetLanguage: string;
  proficiencyLevel: ProficiencyLevel;
  youtubeUrl: string;
  // Pre-created ContentVersion ID so the frontend can start polling immediately
  contentVersionId: string;
}

@Injectable()
export class RegenerateWorker implements OnModuleInit {
  constructor(
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
    @InjectRepository(VideoContent)
    private readonly videoContentRepository: Repository<VideoContent>,
    @InjectRepository(SubtitleCache)
    private readonly subtitleCacheRepo: Repository<SubtitleCache>,
    private readonly pgBossService: PgBossService,
    private readonly claudeService: ClaudeService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    await this.pgBossService.work<RegenerateJobData>(
      PgBossQueueEnum.REGENERATE_CONTENT,
      async (jobs) => {
        for (const job of jobs) {
          await this.processJob(job.data);
        }
      },
      { batchSize: 1 },
    );
  }

  private async processJob(data: RegenerateJobData) {
    const {
      videoContentId, userId, sessionId, targets,
      customInstructions, nativeLanguage, targetLanguage,
      proficiencyLevel, youtubeUrl, contentVersionId,
    } = data;

    const isPersonal = !!customInstructions;

    this.logger.log(
      `RegenerateWorker: sessionId=${sessionId} contentVersionId=${contentVersionId} targets=${targets.join(',')} personal=${isPersonal}`,
      'RegenerateWorker',
    );

    try {
      await this.contentVersionRepository.update(contentVersionId, { status: ContentVersionStatus.PROCESSING });

      // Retrieve subtitles from cache
      const videoContent = await this.videoContentRepository.findOne({ where: { id: videoContentId } });
      if (!videoContent) throw new Error(`VideoContent ${videoContentId} not found`);

      const subtitleCache = await this.subtitleCacheRepo.findOne({
        where: { youtubeVideoId: videoContent.youtubeVideoId },
      });
      if (!subtitleCache) throw new Error(`No subtitle cache for videoContentId=${videoContentId}`);

      const subtitles = subtitleCache.subtitles;
      const context: LearnerContext = { nativeLanguage, targetLanguage, proficiencyLevel };

      // Generate each requested target and save under the new ContentVersion
      let vocabResults: Awaited<ReturnType<ClaudeService['extractVocab']>> | null = null;

      if (targets.includes('vocab') || targets.includes('homework')) {
        this.logger.log(`RegenerateWorker: extracting vocab for contentVersion ${contentVersionId}`, 'RegenerateWorker');
        vocabResults = await this.claudeService.extractVocab(subtitles, context);
      }

      if (targets.includes('vocab') && vocabResults) {
        const items = vocabResults.map(v =>
          this.vocabRepository.create({
            id: uuidv4(),
            contentVersionId,
            word: v.word,
            partOfSpeech: v.partOfSpeech,
            definition: v.definition,
            examples: v.examples,
          }),
        );
        await this.vocabRepository.save(items);
        this.logger.log(`RegenerateWorker: saved ${items.length} vocab items`, 'RegenerateWorker');
      }

      if (targets.includes('summary')) {
        this.logger.log(`RegenerateWorker: generating summary for contentVersion ${contentVersionId}`, 'RegenerateWorker');
        const summaryResult = await this.claudeService.generateSummary(subtitles, context);
        await this.summaryRepository.save(
          this.summaryRepository.create({
            id: uuidv4(),
            contentVersionId,
            summaryTargetLang: summaryResult.summaryTargetLang,
            keyPhrases: summaryResult.keyPhrases,
          }),
        );
      }

      if (targets.includes('homework') && vocabResults) {
        this.logger.log(`RegenerateWorker: generating homework for contentVersion ${contentVersionId}`, 'RegenerateWorker');
        const homeworkResult = await this.claudeService.generateHomework(subtitles, vocabResults, context, youtubeUrl);
        const homework = this.homeworkRepository.create({
          id: uuidv4(),
          contentVersionId,
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
      }

      // Mark completed and update session's active version
      await this.contentVersionRepository.update(contentVersionId, { status: ContentVersionStatus.COMPLETED });
      await this.sessionRepository.update(sessionId, { activeContentVersionId: contentVersionId });

      this.logger.log(
        `RegenerateWorker: contentVersion ${contentVersionId} completed, session ${sessionId} updated`,
        'RegenerateWorker',
      );
    } catch (error) {
      this.logger.error(
        `RegenerateWorker: failed contentVersion=${contentVersionId}: ${error.message}`,
        error.stack,
        'RegenerateWorker',
      );
      await this.contentVersionRepository.update(contentVersionId, {
        status: ContentVersionStatus.FAILED,
        errorMessage: error.message,
      });
    }
  }
}
