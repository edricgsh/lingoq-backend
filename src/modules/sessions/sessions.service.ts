import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { LearningSession } from 'src/entities/learning-session.entity';
import { VideoContent } from 'src/entities/video-content.entity';
import { ContentVersion } from 'src/entities/content-version.entity';
import { VocabItem } from 'src/entities/vocab-item.entity';
import { SessionSummary } from 'src/entities/session-summary.entity';
import { Homework } from 'src/entities/homework.entity';
import { HomeworkSubmission } from 'src/entities/homework-submission.entity';
import { FlashcardProgress } from 'src/entities/flashcard-progress.entity';
import { JobStatus } from 'src/enums/job-status.enum';
import { ContentVersionStatus } from 'src/enums/content-version-status.enum';
import { ProficiencyLevel } from 'src/enums/proficiency-level.enum';
import { PgBossService } from 'src/modules/pg-boss/pg-boss.service';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';
import { OnboardingService } from 'src/modules/onboarding/onboarding.service';
import { SupabaseService } from 'src/modules/supabase/supabase.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { RegenerateJobData, RegenerateTarget } from './regenerate.worker';
import { v4 as uuidv4 } from 'uuid';

export interface CreateSessionDto {
  youtubeUrl: string;
  youtubeVideoId: string;
}

export interface RegenerateContentDto {
  targets: RegenerateTarget[];
  customInstructions?: string;
}

export interface ContentVersionSummary {
  id: string;
  proficiencyLevel: ProficiencyLevel | null;
  userId: string | null;
  customInstructions: string | null;
  status: ContentVersionStatus;
  errorMessage: string | null;
  isActive: boolean;
  createdAt: Date;
  vocabCount: number;
  hasSummary: boolean;
  hasHomework: boolean;
}

export interface SessionResponse {
  id: string;
  userId: string;
  videoContentId: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  title: string | null;
  thumbnailUrl: string | null;
  subtitlesVtt: string | null;
  jobStatus: JobStatus;
  errorMessage: string | null;
  activeContentVersion: ContentVersion | null;
  isOutdated: boolean;
  createdAt: Date;
  updatedAt: Date;
  vocabItems?: VocabItem[];
  summary?: SessionSummary;
  homework?: Homework;
}

function toSessionResponse(
  session: LearningSession,
  currentProficiencyLevel?: ProficiencyLevel,
  vocabItems?: VocabItem[],
  summary?: SessionSummary,
  homework?: Homework,
): SessionResponse {
  const vc = session.videoContent;
  const acv = session.activeContentVersion ?? null;

  const isOutdated =
    !!currentProficiencyLevel &&
    !!acv?.proficiencyLevel &&
    acv.proficiencyLevel !== currentProficiencyLevel;

  return {
    id: session.id,
    userId: session.userId,
    videoContentId: session.videoContentId,
    youtubeVideoId: vc?.youtubeVideoId ?? null,
    youtubeUrl: vc?.youtubeUrl ?? null,
    title: vc?.title ?? null,
    thumbnailUrl: vc?.thumbnailUrl ?? null,
    subtitlesVtt: vc?.subtitlesVtt ?? null,
    jobStatus: vc?.jobStatus ?? JobStatus.PENDING,
    errorMessage: vc?.errorMessage ?? null,
    activeContentVersion: acv,
    isOutdated,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    vocabItems,
    summary,
    homework,
  };
}

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(LearningSession)
    private readonly sessionRepository: Repository<LearningSession>,
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
    @InjectRepository(HomeworkSubmission)
    private readonly submissionRepository: Repository<HomeworkSubmission>,
    @InjectRepository(FlashcardProgress)
    private readonly flashcardProgressRepository: Repository<FlashcardProgress>,
    private readonly pgBossService: PgBossService,
    private readonly onboardingService: OnboardingService,
    private readonly supabaseService: SupabaseService,
    private readonly logger: LoggerService,
  ) {}

  async createSession(userId: string, dto: CreateSessionDto): Promise<SessionResponse> {
    const onboarding = await this.onboardingService.getOnboarding(userId);

    // Check if user already has a session for this video
    const existingSession = await this.sessionRepository
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.videoContent', 'vc')
      .leftJoinAndSelect('s.activeContentVersion', 'acv')
      .where('s.userId = :userId AND vc.youtubeVideoId = :youtubeVideoId', {
        userId,
        youtubeVideoId: dto.youtubeVideoId,
      })
      .getOne();
    if (existingSession) {
      this.logger.log(`Returning existing session ${existingSession.id} for videoId=${dto.youtubeVideoId}`, 'SessionsService');
      return toSessionResponse(existingSession, onboarding.proficiencyLevel);
    }

    // Check if VideoContent already exists
    let videoContent = await this.videoContentRepository.findOne({
      where: { youtubeVideoId: dto.youtubeVideoId },
    });

    // Create session first so we have a sessionId for the job
    const session = this.sessionRepository.create({
      id: uuidv4(),
      userId,
      videoContentId: null as any, // will be set below
      activeContentVersionId: null,
    });

    if (!videoContent) {
      videoContent = this.videoContentRepository.create({
        id: uuidv4(),
        youtubeVideoId: dto.youtubeVideoId,
        youtubeUrl: dto.youtubeUrl,
        jobStatus: JobStatus.PENDING,
      });
      await this.videoContentRepository.save(videoContent);

      session.videoContentId = videoContent.id;
      await this.sessionRepository.save(session);

      const jobId = await this.pgBossService.send(PgBossQueueEnum.PROCESS_YOUTUBE_URL, {
        videoContentId: videoContent.id,
        userId,
        sessionId: session.id,
        youtubeUrl: dto.youtubeUrl,
        youtubeVideoId: dto.youtubeVideoId,
        nativeLanguage: onboarding.nativeLanguage,
        targetLanguage: onboarding.targetLanguage,
        proficiencyLevel: onboarding.proficiencyLevel,
      });
      await this.videoContentRepository.update(videoContent.id, { pgBossJobId: jobId });
      videoContent.pgBossJobId = jobId;
    } else if (videoContent.jobStatus === JobStatus.FAILED) {
      await this.videoContentRepository.update(videoContent.id, {
        jobStatus: JobStatus.PENDING,
        errorMessage: null,
      });

      session.videoContentId = videoContent.id;
      await this.sessionRepository.save(session);

      const jobId = await this.pgBossService.send(PgBossQueueEnum.PROCESS_YOUTUBE_URL, {
        videoContentId: videoContent.id,
        userId,
        sessionId: session.id,
        youtubeUrl: videoContent.youtubeUrl,
        youtubeVideoId: videoContent.youtubeVideoId,
        nativeLanguage: onboarding.nativeLanguage,
        targetLanguage: onboarding.targetLanguage,
        proficiencyLevel: onboarding.proficiencyLevel,
      });
      await this.videoContentRepository.update(videoContent.id, { pgBossJobId: jobId });
    } else {
      // VideoContent exists and is completed — check if a shared ContentVersion exists for this level
      session.videoContentId = videoContent.id;
      await this.sessionRepository.save(session);

      const existingVersion = await this.contentVersionRepository.findOne({
        where: {
          videoContentId: videoContent.id,
          proficiencyLevel: onboarding.proficiencyLevel,
          userId: null,
          status: ContentVersionStatus.COMPLETED,
        },
      });

      if (existingVersion) {
        // Reuse the existing shared version
        await this.sessionRepository.update(session.id, { activeContentVersionId: existingVersion.id });
        session.activeContentVersionId = existingVersion.id;
        session.activeContentVersion = existingVersion;
      } else {
        // Need to generate content at this user's level — enqueue a regeneration job
        const contentVersion = this.contentVersionRepository.create({
          id: uuidv4(),
          videoContentId: videoContent.id,
          proficiencyLevel: onboarding.proficiencyLevel,
          userId: null,
          customInstructions: null,
          status: ContentVersionStatus.PENDING,
        });
        await this.contentVersionRepository.save(contentVersion);

        const jobData: RegenerateJobData = {
          videoContentId: videoContent.id,
          userId,
          sessionId: session.id,
          targets: ['vocab', 'summary', 'homework'],
          nativeLanguage: onboarding.nativeLanguage,
          targetLanguage: onboarding.targetLanguage,
          proficiencyLevel: onboarding.proficiencyLevel,
          youtubeUrl: videoContent.youtubeUrl,
          contentVersionId: contentVersion.id,
        };
        await this.pgBossService.send(PgBossQueueEnum.REGENERATE_CONTENT, jobData);
      }
    }

    session.videoContent = videoContent;
    return toSessionResponse(session, onboarding.proficiencyLevel);
  }

  async getSessions(
    userId: string,
    limit = 20,
    cursor?: string,
    search?: string,
  ): Promise<{ data: SessionResponse[]; nextCursor: string | null; hasMore: boolean }> {
    const qb = this.sessionRepository
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.videoContent', 'vc')
      .leftJoinAndSelect('s.activeContentVersion', 'acv')
      .where('s.userId = :userId', { userId })
      .orderBy('s.createdAt', 'DESC')
      .take(limit + 1);

    if (search) qb.andWhere('vc.title ILIKE :search', { search: `%${search}%` });

    if (cursor) {
      const cursorSession = await this.sessionRepository.findOne({ where: { id: cursor, userId } });
      if (cursorSession) qb.andWhere('s.createdAt < :createdAt', { createdAt: cursorSession.createdAt });
    }

    const sessions = await qb.getMany();
    const hasMore = sessions.length > limit;
    if (hasMore) sessions.pop();

    const onboarding = await this.onboardingService.getOnboarding(userId);

    return {
      data: sessions.map(s => toSessionResponse(s, onboarding.proficiencyLevel)),
      nextCursor: hasMore && sessions.length > 0 ? sessions[sessions.length - 1].id : null,
      hasMore,
    };
  }

  async getSession(userId: string, sessionId: string): Promise<SessionResponse> {
    const session = await this.sessionRepository
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.videoContent', 'vc')
      .leftJoinAndSelect('s.activeContentVersion', 'acv')
      .where('s.id = :sessionId AND s.userId = :userId', { sessionId, userId })
      .getOne();

    if (!session) throw new NotFoundException('Session not found');

    const onboarding = await this.onboardingService.getOnboarding(userId);
    const acv = session.activeContentVersion;

    let vocabItems: VocabItem[] | undefined;
    let summary: SessionSummary | undefined;
    let homework: Homework | undefined;

    if (acv?.status === ContentVersionStatus.COMPLETED) {
      [vocabItems, summary, homework] = await Promise.all([
        this.vocabRepository.find({ where: { contentVersionId: acv.id } }),
        this.summaryRepository.findOne({ where: { contentVersionId: acv.id } }),
        this.homeworkRepository.findOne({
          where: { contentVersionId: acv.id },
          relations: ['questions'],
        }),
      ]);
    }

    return toSessionResponse(session, onboarding.proficiencyLevel, vocabItems, summary ?? undefined, homework ?? undefined);
  }

  async getSessionStatus(userId: string, sessionId: string): Promise<{ jobStatus: JobStatus; errorMessage?: string; activeContentVersion?: { id: string; status: ContentVersionStatus } }> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
      relations: ['videoContent', 'activeContentVersion'],
    });
    if (!session) throw new NotFoundException('Session not found');
    return {
      jobStatus: session.videoContent.jobStatus,
      errorMessage: session.videoContent.errorMessage,
      activeContentVersion: session.activeContentVersion
        ? { id: session.activeContentVersion.id, status: session.activeContentVersion.status }
        : undefined,
    };
  }

  async getContentVersions(userId: string, sessionId: string): Promise<ContentVersionSummary[]> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Session not found');

    // Return all versions for this video that are either shared OR belong to this user
    const versions = await this.contentVersionRepository
      .createQueryBuilder('cv')
      .where('cv.video_content_id = :videoContentId', { videoContentId: session.videoContentId })
      .andWhere('(cv.user_id IS NULL OR cv.user_id = :userId)', { userId })
      .orderBy('cv.created_at', 'DESC')
      .getMany();

    return Promise.all(
      versions.map(async (cv) => {
        const [vocabCount, summary, homework] = await Promise.all([
          this.vocabRepository.count({ where: { contentVersionId: cv.id } }),
          this.summaryRepository.findOne({ where: { contentVersionId: cv.id }, select: ['id'] }),
          this.homeworkRepository.findOne({ where: { contentVersionId: cv.id }, select: ['id'] }),
        ]);
        return {
          id: cv.id,
          proficiencyLevel: cv.proficiencyLevel,
          userId: cv.userId,
          customInstructions: cv.customInstructions,
          status: cv.status,
          errorMessage: cv.errorMessage,
          isActive: session.activeContentVersionId === cv.id,
          createdAt: cv.createdAt,
          vocabCount,
          hasSummary: !!summary,
          hasHomework: !!homework,
        };
      }),
    );
  }

  async regenerateContent(userId: string, sessionId: string, dto: RegenerateContentDto): Promise<{ contentVersionId: string }> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
      relations: ['videoContent', 'activeContentVersion'],
    });
    if (!session) throw new NotFoundException('Session not found');

    const onboarding = await this.onboardingService.getOnboarding(userId);
    const vc = session.videoContent;
    const isPersonal = !!dto.customInstructions?.trim();

    // Pre-create the ContentVersion so the frontend can poll its status immediately
    const contentVersion = this.contentVersionRepository.create({
      id: uuidv4(),
      videoContentId: vc.id,
      proficiencyLevel: onboarding.proficiencyLevel,
      userId: isPersonal ? userId : null,
      customInstructions: dto.customInstructions?.trim() ?? null,
      status: ContentVersionStatus.PENDING,
    });
    await this.contentVersionRepository.save(contentVersion);

    const jobData: RegenerateJobData = {
      videoContentId: vc.id,
      userId,
      sessionId,
      targets: dto.targets,
      customInstructions: dto.customInstructions?.trim(),
      nativeLanguage: onboarding.nativeLanguage,
      targetLanguage: onboarding.targetLanguage,
      proficiencyLevel: onboarding.proficiencyLevel,
      youtubeUrl: vc.youtubeUrl,
      contentVersionId: contentVersion.id,
      previousContentVersionId: session.activeContentVersionId ?? undefined,
    };

    await this.pgBossService.send(PgBossQueueEnum.REGENERATE_CONTENT, jobData);
    this.logger.log(
      `Enqueued regeneration contentVersionId=${contentVersion.id} session=${sessionId} targets=${dto.targets.join(',')} personal=${isPersonal}`,
      'SessionsService',
    );

    return { contentVersionId: contentVersion.id };
  }

  async activateContentVersion(userId: string, sessionId: string, contentVersionId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Session not found');

    // Verify this version belongs to this session's video and is accessible to this user
    const version = await this.contentVersionRepository.findOne({
      where: { id: contentVersionId, videoContentId: session.videoContentId },
    });
    if (!version) throw new NotFoundException('Content version not found');
    if (version.userId !== null && version.userId !== userId) throw new NotFoundException('Content version not found');
    if (version.status !== ContentVersionStatus.COMPLETED) throw new NotFoundException('Content version is not completed');

    await this.sessionRepository.update(sessionId, { activeContentVersionId: contentVersionId });
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
      relations: ['videoContent'],
    });
    if (!session) throw new NotFoundException('Session not found');

    await this.submissionRepository.delete({ userSessionId: sessionId });

    const allVocabItems = await this.vocabRepository
      .createQueryBuilder('vi')
      .innerJoin('vi.contentVersion', 'cv')
      .where('cv.video_content_id = :videoContentId', { videoContentId: session.videoContentId })
      .getMany();

    if (allVocabItems.length > 0) {
      await this.flashcardProgressRepository.delete({
        userId,
        vocabItemId: In(allVocabItems.map(v => v.id)),
      });
    }

    // Delete personal ContentVersions for this user+video (shared versions remain)
    const personalVersions = await this.contentVersionRepository.find({
      where: { videoContentId: session.videoContentId, userId },
    });
    for (const cv of personalVersions) {
      // Cascade deletes vocab/summary/homework under this version
      await this.contentVersionRepository.delete({ id: cv.id });
    }

    await this.sessionRepository.remove(session);
  }

  async retrySession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
      relations: ['videoContent'],
    });
    if (!session) throw new NotFoundException('Session not found');

    const onboarding = await this.onboardingService.getOnboarding(userId);
    const vc = session.videoContent;

    await this.videoContentRepository.update(vc.id, { jobStatus: JobStatus.PENDING, errorMessage: null });

    const jobId = await this.pgBossService.send(PgBossQueueEnum.PROCESS_YOUTUBE_URL, {
      videoContentId: vc.id,
      userId,
      sessionId,
      youtubeUrl: vc.youtubeUrl,
      youtubeVideoId: vc.youtubeVideoId,
      nativeLanguage: onboarding.nativeLanguage,
      targetLanguage: onboarding.targetLanguage,
      proficiencyLevel: onboarding.proficiencyLevel,
    });

    await this.videoContentRepository.update(vc.id, { pgBossJobId: jobId });
  }

  async updateStatus(videoContentId: string, status: JobStatus, errorMessage?: string): Promise<void> {
    await this.videoContentRepository.update(videoContentId, {
      jobStatus: status,
      ...(errorMessage ? { errorMessage } : {}),
    });
  }

  async fetchThumbnail(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
      relations: ['videoContent'],
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.videoContent.thumbnailUrl) return;
    this.doFetchThumbnail(session.videoContentId, session.videoContent.youtubeVideoId).catch(() => {});
  }

  private async doFetchThumbnail(videoContentId: string, youtubeVideoId: string): Promise<void> {
    try {
      const candidates = [
        `https://img.youtube.com/vi/${youtubeVideoId}/maxresdefault.jpg`,
        `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`,
      ];
      let buffer: Buffer | null = null;
      for (const url of candidates) {
        const res = await fetch(url);
        if (res.ok) { buffer = Buffer.from(await res.arrayBuffer()); break; }
      }
      if (!buffer) return;
      const thumbnailUrl = await this.supabaseService.uploadThumbnail(youtubeVideoId, buffer, 'image/jpeg');
      if (thumbnailUrl) await this.videoContentRepository.update(videoContentId, { thumbnailUrl });
    } catch (err) {
      this.logger.warn(`Thumbnail backfill failed: ${err.message}`, 'SessionsService');
    }
  }
}
