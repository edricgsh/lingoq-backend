import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { RolesGuard } from 'src/shared/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorator';
import { UserRole } from 'src/enums/user-role.enum';
import { User } from 'src/entities/user.entity';
import { UserOnboarding } from 'src/entities/user-onboarding.entity';
import { LearningSession } from 'src/entities/learning-session.entity';
import { LoggerService } from 'src/modules/logger/logger.service';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminUserAnalyticsController {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserOnboarding)
    private readonly onboardingRepo: Repository<UserOnboarding>,
    @InjectRepository(LearningSession)
    private readonly sessionRepo: Repository<LearningSession>,
    private readonly logger: LoggerService,
  ) {}

  @Get()
  async listUsers(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('search') search?: string,
  ) {
    const take = limit ? Math.min(+limit, 100) : 20;

    const qb = this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.onboarding', 'o')
      .orderBy('u.createdAt', 'DESC')
      .take(take + 1);

    if (search) {
      qb.andWhere('(u.email ILIKE :q OR u.name ILIKE :q)', { q: `%${search}%` });
    }

    if (cursor) {
      const cursorUser = await this.userRepo.findOne({ where: { id: cursor } });
      if (cursorUser) {
        qb.andWhere('u.createdAt < :ts', { ts: cursorUser.createdAt });
      }
    }

    const users = await qb.getMany();
    const hasMore = users.length > take;
    if (hasMore) users.pop();

    // Attach session counts
    const userIds = users.map((u) => u.id);
    const sessionCounts: Record<string, number> = {};
    if (userIds.length) {
      const rows = await this.sessionRepo
        .createQueryBuilder('s')
        .select('s.userId', 'userId')
        .addSelect('COUNT(*)', 'count')
        .where('s.userId IN (:...ids)', { ids: userIds })
        .groupBy('s.userId')
        .getRawMany();
      for (const row of rows) sessionCounts[row.userId] = parseInt(row.count, 10);
    }

    const data = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      nativeLanguage: u.onboarding?.nativeLanguage ?? null,
      targetLanguage: u.onboarding?.targetLanguage ?? null,
      proficiencyLevel: u.onboarding?.proficiencyLevel ?? null,
      onboardingComplete: u.onboarding?.isComplete ?? false,
      sessionCount: sessionCounts[u.id] ?? 0,
    }));

    return {
      data,
      nextCursor: hasMore ? users[users.length - 1].id : null,
      hasMore,
    };
  }

  @Get(':userId')
  async getUserDetail(@Param('userId') userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['onboarding'],
    });
    if (!user) return null;

    const sessions = await this.sessionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.videoContent', 'vc')
      .leftJoinAndSelect('s.activeContentVersion', 'cv')
      .where('s.userId = :userId', { userId })
      .orderBy('s.createdAt', 'DESC')
      .getMany();

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      onboarding: user.onboarding
        ? {
            isComplete: user.onboarding.isComplete,
            nativeLanguage: user.onboarding.nativeLanguage,
            targetLanguage: user.onboarding.targetLanguage,
            proficiencyLevel: user.onboarding.proficiencyLevel,
            learningGoals: user.onboarding.learningGoals,
            interestTopics: user.onboarding.interestTopics,
          }
        : null,
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        videoContentId: s.videoContentId,
        videoTitle: s.videoContent?.title ?? null,
        thumbnailUrl: s.videoContent?.thumbnailUrl ?? null,
        youtubeVideoId: s.videoContent?.youtubeVideoId ?? null,
        contentVersionStatus: s.activeContentVersion?.status ?? null,
      })),
    };
  }

  @Get(':userId/sessions/:sessionId')
  async getSessionDetail(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    const session = await this.sessionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.videoContent', 'vc')
      .leftJoinAndSelect('s.activeContentVersion', 'cv')
      .leftJoinAndSelect('cv.vocabItems', 'vocab')
      .leftJoinAndSelect('cv.summary', 'summary')
      .leftJoinAndSelect('cv.homework', 'hw')
      .leftJoinAndSelect('hw.questions', 'hwq')
      .where('s.id = :sessionId AND s.userId = :userId', { sessionId, userId })
      .getOne();

    if (!session) return null;

    return {
      id: session.id,
      createdAt: session.createdAt,
      userId,
      video: session.videoContent
        ? {
            id: session.videoContent.id,
            youtubeVideoId: session.videoContent.youtubeVideoId,
            youtubeUrl: session.videoContent.youtubeUrl,
            title: session.videoContent.title,
            thumbnailUrl: session.videoContent.thumbnailUrl,
            jobStatus: session.videoContent.jobStatus,
          }
        : null,
      contentVersion: session.activeContentVersion
        ? {
            id: session.activeContentVersion.id,
            status: session.activeContentVersion.status,
            proficiencyLevel: session.activeContentVersion.proficiencyLevel,
            customInstructions: session.activeContentVersion.customInstructions,
            vocabItems: session.activeContentVersion.vocabItems?.map((v) => ({
              id: v.id,
              word: v.word,
              partOfSpeech: v.partOfSpeech,
              definition: v.definition,
            })) ?? [],
            summary: session.activeContentVersion.summary
              ? {
                  summaryTargetLang: session.activeContentVersion.summary.summaryTargetLang,
                  keyPhrases: session.activeContentVersion.summary.keyPhrases,
                }
              : null,
            homeworkQuestionCount: session.activeContentVersion.homework?.questions?.length ?? 0,
          }
        : null,
    };
  }
}
