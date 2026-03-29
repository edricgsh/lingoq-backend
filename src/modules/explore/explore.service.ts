import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { ExploreTopicQuery } from 'src/entities/explore-topic-query.entity';
import { ExploreRecommendation } from 'src/entities/explore-recommendation.entity';
import { SubtitleCache } from 'src/entities/subtitle-cache.entity';
import { ClaudeService } from 'src/modules/claude/claude.service';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { v4 as uuidv4 } from 'uuid';
import { isTargetLanguageMatch } from './language-filter.helper';

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
    const url = `https://api.supadata.ai/v1/youtube/search?query=${encodeURIComponent(query)}&type=video&limit=20&sortBy=relevance&uploadDate=year`;
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

      const title = video.title ?? null;
      const channelName = video.channel?.name ?? null;
      if (!isTargetLanguageMatch(targetLanguage, title, channelName)) {
        this.logger.log(
          `Skipping video "${videoId}" — title/channel does not match target language "${targetLanguage}"`,
          'ExploreService',
        );
        continue;
      }

      await this.recommendationRepo.save(
        this.recommendationRepo.create({
          id: uuidv4(),
          topic,
          targetLanguage,
          videoId,
          title,
          description: video.description ?? null,
          thumbnailUrl: video.thumbnail ?? null,
          viewCount: video.viewCount ?? video.views ?? null,
          uploadDate: video.uploadDate ?? video.publishedAt ?? null,
          channelName,
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

  private parseUploadDate(raw: string): Date | null {
    if (!raw) return null;
    // YYYYMMDD format
    if (/^\d{8}$/.test(raw)) {
      const y = raw.slice(0, 4);
      const m = raw.slice(4, 6);
      const d = raw.slice(6, 8);
      const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
      return isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(raw);
    return isNaN(date.getTime()) ? null : date;
  }

  private computeScore(row: ExploreRecommendation): number {
    // viewScore
    let viewScore = 0;
    if (row.viewCount != null) {
      viewScore = Math.min(1, Math.log10(row.viewCount + 1) / Math.log10(10_000_000));
    }

    // recencyScore
    let recencyScore = 0;
    const refDate = this.parseUploadDate(row.uploadDate ?? '') ?? row.createdAt;
    const ageMs = Date.now() - refDate.getTime();
    const THREE_MONTHS_MS = 3 * 30 * 24 * 60 * 60 * 1000;
    const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
    if (ageMs <= THREE_MONTHS_MS) {
      recencyScore = 1.0;
    } else if (ageMs < TWO_YEARS_MS) {
      recencyScore = 1 - (ageMs - THREE_MONTHS_MS) / (TWO_YEARS_MS - THREE_MONTHS_MS);
    }

    // durationScore
    let durationScore = 0.5;
    if (row.duration != null) {
      const d = row.duration;
      if (d < 60 || d > 3600) {
        durationScore = 0;
      } else if (d >= 180 && d <= 900) {
        durationScore = 1.0;
      } else if (d < 180) {
        durationScore = (d - 60) / (180 - 60);
      } else {
        durationScore = 1 - (d - 900) / (3600 - 900);
      }
    }

    return 0.5 * viewScore + 0.3 * recencyScore + 0.2 * durationScore;
  }

  async getRecommendations(
    topics: string[],
    targetLanguage: string,
    limit = 20,
    offset = 0,
  ): Promise<{ data: Array<ExploreRecommendation & { topic: string }>; nextCursor: number | null; hasMore: boolean }> {
    const rows = await this.recommendationRepo.find({
      where: { topic: In(topics), targetLanguage },
      order: { createdAt: 'DESC' },
      take: 200,
    });

    const filtered = rows.filter((r) => r.viewCount == null || r.viewCount >= 500);
    filtered.sort((a, b) => this.computeScore(b) - this.computeScore(a));

    const slice = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < filtered.length;
    const nextCursor = hasMore ? offset + limit : null;

    return { data: slice as Array<ExploreRecommendation & { topic: string }>, nextCursor, hasMore };
  }
}
