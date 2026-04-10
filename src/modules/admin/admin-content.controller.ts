import { BadRequestException, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { RolesGuard } from 'src/shared/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorator';
import { UserRole } from 'src/enums/user-role.enum';
import { VideoContent } from 'src/entities/video-content.entity';
import { LearningSession } from 'src/entities/learning-session.entity';
import { UserOnboarding } from 'src/entities/user-onboarding.entity';
import { JobStatus } from 'src/enums/job-status.enum';
import { PgBossService } from 'src/modules/pg-boss/pg-boss.service';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';
import { LoggerService } from 'src/modules/logger/logger.service';

@Controller('admin/content')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminContentController {
  constructor(
    @InjectRepository(VideoContent)
    private readonly videoContentRepo: Repository<VideoContent>,
    @InjectRepository(LearningSession)
    private readonly sessionRepo: Repository<LearningSession>,
    @InjectRepository(UserOnboarding)
    private readonly onboardingRepo: Repository<UserOnboarding>,
    private readonly pgBossService: PgBossService,
    private readonly logger: LoggerService,
  ) {}

  @Get('videos')
  async listVideos(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const take = limit ? Math.min(+limit, 100) : 20;

    const qb = this.videoContentRepo
      .createQueryBuilder('vc')
      .orderBy('vc.updatedAt', 'DESC')
      .take(take + 1);

    if (search) {
      qb.andWhere('(vc.title ILIKE :q OR vc.youtubeVideoId ILIKE :q)', { q: `%${search}%` });
    }

    if (status && Object.values(JobStatus).includes(status as JobStatus)) {
      qb.andWhere('vc.jobStatus = :status', { status });
    }

    if (cursor) {
      const cursorItem = await this.videoContentRepo.findOne({ where: { id: cursor } });
      if (cursorItem) {
        qb.andWhere('vc.updatedAt < :ts', { ts: cursorItem.updatedAt });
      }
    }

    const videos = await qb.getMany();
    const hasMore = videos.length > take;
    if (hasMore) videos.pop();

    // Attach session counts per video
    const videoIds = videos.map((v) => v.id);
    const sessionCounts: Record<string, number> = {};
    if (videoIds.length) {
      const rows = await this.sessionRepo
        .createQueryBuilder('s')
        .select('s.videoContentId', 'videoContentId')
        .addSelect('COUNT(*)', 'count')
        .where('s.videoContentId IN (:...ids)', { ids: videoIds })
        .groupBy('s.videoContentId')
        .getRawMany();
      for (const row of rows) sessionCounts[row.videoContentId] = parseInt(row.count, 10);
    }

    const data = videos.map((v) => ({
      id: v.id,
      youtubeVideoId: v.youtubeVideoId,
      youtubeUrl: v.youtubeUrl,
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      jobStatus: v.jobStatus,
      errorMessage: v.errorMessage,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      sessionCount: sessionCounts[v.id] ?? 0,
    }));

    return {
      data,
      nextCursor: hasMore ? videos[videos.length - 1].id : null,
      hasMore,
    };
  }

  @Post('videos/:videoId/retrigger')
  async retriggerVideo(@Param('videoId') videoId: string) {
    const video = await this.videoContentRepo.findOne({ where: { id: videoId } });
    if (!video) throw new NotFoundException('Video not found');

    if (video.jobStatus !== JobStatus.FAILED) {
      throw new BadRequestException(`Cannot retrigger video with status "${video.jobStatus}". Only FAILED videos can be retriggered.`);
    }

    // Find a session with onboarding data to use as the job context
    const session = await this.sessionRepo
      .createQueryBuilder('s')
      .where('s.videoContentId = :videoId', { videoId })
      .orderBy('s.createdAt', 'ASC')
      .getOne();

    if (!session) throw new BadRequestException('No sessions found for this video — cannot determine job context');

    const onboarding = await this.onboardingRepo.findOne({ where: { userId: session.userId } });
    if (!onboarding) throw new BadRequestException('Session owner has no onboarding data — cannot determine job context');

    await this.videoContentRepo.update(videoId, { jobStatus: JobStatus.PENDING, errorMessage: null });

    const jobId = await this.pgBossService.send(PgBossQueueEnum.PROCESS_YOUTUBE_URL, {
      videoContentId: video.id,
      userId: session.userId,
      sessionId: session.id,
      youtubeUrl: video.youtubeUrl,
      youtubeVideoId: video.youtubeVideoId,
      nativeLanguage: onboarding.nativeLanguage,
      targetLanguage: onboarding.targetLanguage,
      proficiencyLevel: onboarding.proficiencyLevel,
    });

    await this.videoContentRepo.update(videoId, { pgBossJobId: jobId });

    this.logger.log(
      `Admin retriggered videoId=${videoId} jobId=${jobId} using userId=${session.userId}`,
      'AdminContentController',
    );

    return { jobId, videoId };
  }

  @Get('videos/:videoId')
  async getVideoDetail(@Param('videoId') videoId: string) {
    const video = await this.videoContentRepo.findOne({
      where: { id: videoId },
      relations: ['contentVersions'],
    });
    if (!video) return null;

    const sessions = await this.sessionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'u')
      .where('s.videoContentId = :videoId', { videoId })
      .orderBy('s.createdAt', 'DESC')
      .getMany();

    return {
      id: video.id,
      youtubeVideoId: video.youtubeVideoId,
      youtubeUrl: video.youtubeUrl,
      title: video.title,
      thumbnailUrl: video.thumbnailUrl,
      jobStatus: video.jobStatus,
      errorMessage: video.errorMessage,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
      contentVersions: video.contentVersions?.map((cv) => ({
        id: cv.id,
        status: cv.status,
        proficiencyLevel: cv.proficiencyLevel,
        userId: cv.userId,
        createdAt: cv.createdAt,
      })) ?? [],
      sessions: sessions.map((s) => ({
        id: s.id,
        userId: s.userId,
        userEmail: s.user?.email ?? null,
        userName: s.user?.name ?? null,
        createdAt: s.createdAt,
      })),
    };
  }
}
