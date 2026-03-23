import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { LearningSession } from 'src/entities/learning-session.entity';
import { VideoContent } from 'src/entities/video-content.entity';
import { SessionSummary } from 'src/entities/session-summary.entity';
import { Homework } from 'src/entities/homework.entity';
import { VocabItem } from 'src/entities/vocab-item.entity';
import { HomeworkSubmission } from 'src/entities/homework-submission.entity';
import { FlashcardProgress } from 'src/entities/flashcard-progress.entity';
import { JobStatus } from 'src/enums/job-status.enum';
import { PgBossService } from 'src/modules/pg-boss/pg-boss.service';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';
import { OnboardingService } from 'src/modules/onboarding/onboarding.service';
import { SupabaseService } from 'src/modules/supabase/supabase.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { v4 as uuidv4 } from 'uuid';

export interface CreateSessionDto {
  youtubeUrl: string;
  youtubeVideoId: string;
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
  createdAt: Date;
  updatedAt: Date;
  vocabItems?: VocabItem[];
  summary?: SessionSummary;
  homework?: Homework;
}

function toSessionResponse(session: LearningSession): SessionResponse {
  const vc = session.videoContent;
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
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    vocabItems: vc?.vocabItems,
    summary: vc?.summaries?.[0] ?? undefined,
    homework: vc?.homeworks?.[0] ?? undefined,
  };
}

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(LearningSession)
    private readonly sessionRepository: Repository<LearningSession>,
    @InjectRepository(VideoContent)
    private readonly videoContentRepository: Repository<VideoContent>,
    @InjectRepository(VocabItem)
    private readonly vocabRepository: Repository<VocabItem>,
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
      .where('s.userId = :userId AND vc.youtubeVideoId = :youtubeVideoId', {
        userId,
        youtubeVideoId: dto.youtubeVideoId,
      })
      .getOne();
    if (existingSession) {
      this.logger.log(`Returning existing session ${existingSession.id} for videoId=${dto.youtubeVideoId}`, 'SessionsService');
      return toSessionResponse(existingSession);
    }

    // Check if VideoContent already exists for this video
    let videoContent = await this.videoContentRepository.findOne({
      where: { youtubeVideoId: dto.youtubeVideoId },
    });

    if (!videoContent) {
      // Create new VideoContent and enqueue processing job
      videoContent = this.videoContentRepository.create({
        id: uuidv4(),
        youtubeVideoId: dto.youtubeVideoId,
        youtubeUrl: dto.youtubeUrl,
        jobStatus: JobStatus.PENDING,
      });
      await this.videoContentRepository.save(videoContent);

      const jobId = await this.pgBossService.send(
        PgBossQueueEnum.PROCESS_YOUTUBE_URL,
        {
          videoContentId: videoContent.id,
          userId,
          youtubeUrl: dto.youtubeUrl,
          youtubeVideoId: dto.youtubeVideoId,
          nativeLanguage: onboarding.nativeLanguage,
          targetLanguage: onboarding.targetLanguage,
          proficiencyLevel: onboarding.proficiencyLevel,
        },
      );
      await this.videoContentRepository.update(videoContent.id, { pgBossJobId: jobId });
      videoContent.pgBossJobId = jobId;
    } else if (videoContent.jobStatus === JobStatus.FAILED) {
      // Re-enqueue failed video for this new user
      await this.videoContentRepository.update(videoContent.id, {
        jobStatus: JobStatus.PENDING,
        errorMessage: null,
      });
      const jobId = await this.pgBossService.send(
        PgBossQueueEnum.PROCESS_YOUTUBE_URL,
        {
          videoContentId: videoContent.id,
          userId,
          youtubeUrl: videoContent.youtubeUrl,
          youtubeVideoId: videoContent.youtubeVideoId,
          nativeLanguage: onboarding.nativeLanguage,
          targetLanguage: onboarding.targetLanguage,
          proficiencyLevel: onboarding.proficiencyLevel,
        },
      );
      await this.videoContentRepository.update(videoContent.id, { pgBossJobId: jobId });
    }

    // Create LearningSession linking user ↔ video
    const session = this.sessionRepository.create({
      id: uuidv4(),
      userId,
      videoContentId: videoContent.id,
    });
    await this.sessionRepository.save(session);
    session.videoContent = videoContent;

    return toSessionResponse(session);
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
      .where('s.userId = :userId', { userId })
      .orderBy('s.createdAt', 'DESC')
      .take(limit + 1);

    if (search) {
      qb.andWhere('vc.title ILIKE :search', { search: `%${search}%` });
    }

    if (cursor) {
      const cursorSession = await this.sessionRepository.findOne({ where: { id: cursor, userId } });
      if (cursorSession) {
        qb.andWhere('s.createdAt < :createdAt', { createdAt: cursorSession.createdAt });
      }
    }

    const sessions = await qb.getMany();

    const hasMore = sessions.length > limit;
    if (hasMore) sessions.pop();

    const nextCursor = hasMore && sessions.length > 0 ? sessions[sessions.length - 1].id : null;

    return { data: sessions.map(toSessionResponse), nextCursor, hasMore };
  }

  async getSession(userId: string, sessionId: string): Promise<SessionResponse> {
    const session = await this.sessionRepository
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.videoContent', 'vc')
      .leftJoinAndSelect('vc.vocabItems', 'vi')
      .leftJoinAndSelect('vc.summaries', 'sum')
      .leftJoinAndSelect('vc.homeworks', 'hw')
      .leftJoinAndSelect('hw.questions', 'q')
      .where('s.id = :sessionId AND s.userId = :userId', { sessionId, userId })
      .orderBy('sum.createdAt', 'DESC')
      .addOrderBy('hw.createdAt', 'DESC')
      .getOne();

    if (!session) throw new NotFoundException('Session not found');
    return toSessionResponse(session);
  }

  async getSessionStatus(userId: string, sessionId: string): Promise<{ jobStatus: JobStatus; errorMessage?: string }> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
      relations: ['videoContent'],
    });
    if (!session) throw new NotFoundException('Session not found');
    return {
      jobStatus: session.videoContent.jobStatus,
      errorMessage: session.videoContent.errorMessage,
    };
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
      relations: ['videoContent'],
    });
    if (!session) throw new NotFoundException('Session not found');

    // Delete homework submissions for this user session (cascade deletes answers)
    await this.submissionRepository.delete({ userSessionId: sessionId });

    // Delete flashcard progress for vocab items belonging to this video
    const vocabItems = await this.vocabRepository.find({
      where: { videoContentId: session.videoContentId },
      select: ['id'],
    });
    if (vocabItems.length > 0) {
      const vocabIds = vocabItems.map(v => v.id);
      await this.flashcardProgressRepository.delete({ userId, vocabItemId: In(vocabIds) });
    }

    // Delete just the user's session row — VideoContent and content remain
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

    await this.videoContentRepository.update(vc.id, {
      jobStatus: JobStatus.PENDING,
      errorMessage: null,
    });

    const jobId = await this.pgBossService.send(
      PgBossQueueEnum.PROCESS_YOUTUBE_URL,
      {
        videoContentId: vc.id,
        userId,
        youtubeUrl: vc.youtubeUrl,
        youtubeVideoId: vc.youtubeVideoId,
        nativeLanguage: onboarding.nativeLanguage,
        targetLanguage: onboarding.targetLanguage,
        proficiencyLevel: onboarding.proficiencyLevel,
      },
    );

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
        if (res.ok) {
          buffer = Buffer.from(await res.arrayBuffer());
          break;
        }
      }
      if (!buffer) return;

      const thumbnailUrl = await this.supabaseService.uploadThumbnail(youtubeVideoId, buffer, 'image/jpeg');
      if (thumbnailUrl) {
        await this.videoContentRepository.update(videoContentId, { thumbnailUrl });
        this.logger.log(`Thumbnail backfilled for videoContent ${videoContentId}`, 'SessionsService');
      }
    } catch (err) {
      this.logger.warn(`Thumbnail backfill failed for videoContent ${videoContentId}: ${err.message}`, 'SessionsService');
    }
  }
}
