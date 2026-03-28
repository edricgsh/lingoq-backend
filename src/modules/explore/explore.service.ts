import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Repository } from 'typeorm';
import { ExploreTopicQuery } from 'src/entities/explore-topic-query.entity';
import { ExploreRecommendation } from 'src/entities/explore-recommendation.entity';
import { SubtitleCache } from 'src/entities/subtitle-cache.entity';
import { ClaudeService } from 'src/modules/claude/claude.service';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { v4 as uuidv4 } from 'uuid';

const QUERY_CACHE_TTL_DAYS = 7;
const RESULTS_CACHE_TTL_DAYS = 7;

@Injectable()
export class ExploreService {
  constructor(
    @InjectRepository(ExploreTopicQuery)
    private readonly topicQueryRepo: Repository<ExploreTopicQuery>,
    @InjectRepository(ExploreRecommendation)
    private readonly recommendationRepo: Repository<ExploreRecommendation>,
    @InjectRepository(SubtitleCache)
    private readonly subtitleCacheRepo: Repository<SubtitleCache>,
    private readonly claudeService: ClaudeService,
    private readonly secretsService: AwsSecretsService,
    private readonly logger: LoggerService,
  ) {}

  async generateForUserTopics(topics: string[], targetLanguage: string): Promise<void> {
    const secrets = await this.secretsService.getSecret();
    const apiKey = secrets.SUPADATA_API_KEY;

    for (const topic of topics) {
      try {
        const queries = await this.getOrGenerateQueries(topic, targetLanguage);
        for (const query of queries) {
          await this.fetchAndUpsertResults(topic, targetLanguage, query, apiKey);
        }
      } catch (err) {
        this.logger.error(
          `Failed to generate recommendations for topic "${topic}": ${err.message}`,
          err.stack,
          'ExploreService',
        );
      }
    }
  }

  private async getOrGenerateQueries(topic: string, targetLanguage: string): Promise<string[]> {
    const existing = await this.topicQueryRepo.findOne({
      where: { topic, targetLanguage, expiresAt: MoreThan(new Date()) },
    });
    if (existing) return existing.queries;

    this.logger.log(`Generating search queries for topic "${topic}" (${targetLanguage})`, 'ExploreService');
    const queries = await this.claudeService.generateSearchQueries(topic, targetLanguage);

    const expiresAt = new Date(Date.now() + QUERY_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.topicQueryRepo.upsert(
      { id: uuidv4(), topic, targetLanguage, queries, expiresAt },
      { conflictPaths: ['topic', 'targetLanguage'] },
    );

    return queries;
  }

  private async fetchAndUpsertResults(
    topic: string,
    targetLanguage: string,
    query: string,
    apiKey: string,
  ): Promise<void> {
    const url = `https://api.supadata.ai/v1/youtube/search?query=${encodeURIComponent(query)}&type=video&limit=50&sortBy=relevance&uploadDate=year`;
    const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
    if (!res.ok) {
      this.logger.warn(`Supadata search failed for query "${query}": ${res.status}`, 'ExploreService');
      return;
    }

    const json = await res.json();
    const videos: any[] = Array.isArray(json) ? json : json.results ?? json.data ?? [];

    for (const video of videos) {
      const videoId = video.videoId ?? video.id;
      if (!videoId) continue;

      const existing = await this.recommendationRepo.findOne({
        where: { topic, targetLanguage, videoId },
      });
      if (existing) continue;

      await this.recommendationRepo.save(
        this.recommendationRepo.create({
          id: uuidv4(),
          topic,
          targetLanguage,
          videoId,
          title: video.title ?? null,
          description: video.description ?? null,
          thumbnailUrl: video.thumbnail ?? null,
          viewCount: video.viewCount ?? video.views ?? null,
          uploadDate: video.uploadDate ?? video.publishedAt ?? null,
          channelName: video.channel?.name ?? null,
          channelId: video.channel?.id ?? null,
          duration: video.duration ?? null,
        }),
      );
    }
  }

  async getSubtitlesByVideoId(videoId: string): Promise<string | null> {
    const cached = await this.subtitleCacheRepo.findOne({ where: { youtubeVideoId: videoId } });
    return cached?.subtitlesVtt ?? null;
  }

  async getRecommendations(
    topics: string[],
    targetLanguage: string,
    limit = 20,
    cursor?: string,
  ): Promise<{ data: Array<ExploreRecommendation & { topic: string }>; nextCursor: string | null; hasMore: boolean }> {
    const where: any = { topic: In(topics), targetLanguage };
    if (cursor) {
      const cursorRow = await this.recommendationRepo.findOne({ where: { id: cursor } });
      if (cursorRow) where.createdAt = LessThan(cursorRow.createdAt);
    }

    const rows = await this.recommendationRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    const nextCursor = hasMore ? rows[rows.length - 1].id : null;

    return { data: rows as Array<ExploreRecommendation & { topic: string }>, nextCursor, hasMore };
  }
}
