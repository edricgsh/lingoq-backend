import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { RolesGuard } from 'src/shared/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorator';
import { UserRole } from 'src/enums/user-role.enum';
import { VideoContent } from 'src/entities/video-content.entity';
import { LearningSession } from 'src/entities/learning-session.entity';
import { JobStatus } from 'src/enums/job-status.enum';

@Controller('admin/content')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminContentController {
  constructor(
    @InjectRepository(VideoContent)
    private readonly videoContentRepo: Repository<VideoContent>,
    @InjectRepository(LearningSession)
    private readonly sessionRepo: Repository<LearningSession>,
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
