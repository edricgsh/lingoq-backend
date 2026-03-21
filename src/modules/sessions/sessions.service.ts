import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, LessThan, Repository } from 'typeorm';
import { LearningSession } from 'src/entities/learning-session.entity';
import { JobStatus } from 'src/enums/job-status.enum';
import { PgBossService } from 'src/modules/pg-boss/pg-boss.service';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';
import { OnboardingService } from 'src/modules/onboarding/onboarding.service';
import { v4 as uuidv4 } from 'uuid';

export interface CreateSessionDto {
  youtubeUrl: string;
  youtubeVideoId: string;
}

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(LearningSession)
    private readonly sessionRepository: Repository<LearningSession>,
    private readonly pgBossService: PgBossService,
    private readonly onboardingService: OnboardingService,
  ) {}

  async createSession(userId: string, dto: CreateSessionDto): Promise<LearningSession> {
    const onboarding = await this.onboardingService.getOnboarding(userId);

    const session = this.sessionRepository.create({
      id: uuidv4(),
      userId,
      youtubeUrl: dto.youtubeUrl,
      youtubeVideoId: dto.youtubeVideoId,
      jobStatus: JobStatus.PENDING,
    });

    await this.sessionRepository.save(session);

    const jobId = await this.pgBossService.send(
      PgBossQueueEnum.PROCESS_YOUTUBE_URL,
      {
        sessionId: session.id,
        userId,
        youtubeUrl: dto.youtubeUrl,
        youtubeVideoId: dto.youtubeVideoId,
        nativeLanguage: onboarding.nativeLanguage,
        targetLanguage: onboarding.targetLanguage,
        proficiencyLevel: onboarding.proficiencyLevel,
      },
    );

    session.pgBossJobId = jobId;
    await this.sessionRepository.save(session);

    return session;
  }

  async getSessions(
    userId: string,
    limit = 20,
    cursor?: string,
    search?: string,
  ): Promise<{ data: LearningSession[]; nextCursor: string | null; hasMore: boolean }> {
    const where: any = { userId };

    if (search) {
      where.title = ILike(`%${search}%`);
    }

    if (cursor) {
      const cursorSession = await this.sessionRepository.findOne({ where: { id: cursor, userId } });
      if (cursorSession) {
        where.createdAt = LessThan(cursorSession.createdAt);
      }
    }

    const sessions = await this.sessionRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit + 1,
    });

    const hasMore = sessions.length > limit;
    if (hasMore) sessions.pop();

    const nextCursor = hasMore && sessions.length > 0 ? sessions[sessions.length - 1].id : null;

    return { data: sessions, nextCursor, hasMore };
  }

  async getSession(userId: string, sessionId: string): Promise<LearningSession> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
      relations: ['vocabItems', 'summary', 'homework', 'homework.questions'],
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async getSessionStatus(userId: string, sessionId: string): Promise<{ jobStatus: JobStatus; errorMessage?: string }> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException('Session not found');
    return { jobStatus: session.jobStatus, errorMessage: session.errorMessage };
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException('Session not found');
    await this.sessionRepository.remove(session);
  }

  async retrySession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException('Session not found');

    const onboarding = await this.onboardingService.getOnboarding(userId);

    await this.sessionRepository.update(sessionId, {
      jobStatus: JobStatus.PENDING,
      errorMessage: null,
    });

    const jobId = await this.pgBossService.send(
      PgBossQueueEnum.PROCESS_YOUTUBE_URL,
      {
        sessionId: session.id,
        userId,
        youtubeUrl: session.youtubeUrl,
        youtubeVideoId: session.youtubeVideoId,
        nativeLanguage: onboarding.nativeLanguage,
        targetLanguage: onboarding.targetLanguage,
        proficiencyLevel: onboarding.proficiencyLevel,
      },
    );

    await this.sessionRepository.update(sessionId, { pgBossJobId: jobId });
  }

  async updateStatus(sessionId: string, status: JobStatus, errorMessage?: string): Promise<void> {
    await this.sessionRepository.update(sessionId, {
      jobStatus: status,
      ...(errorMessage ? { errorMessage } : {}),
    });
  }
}
