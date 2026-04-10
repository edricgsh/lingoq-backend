import { Injectable, OnModuleInit } from '@nestjs/common';
import { SupadataApiKey, SupadataKeyStatus } from 'src/entities/supadata-api-key.entity';
import { SupadataApiKeyService } from 'src/modules/supadata-api-key/supadata-api-key.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { SubtitleResponse } from './lambda.service';

interface SupadataTranscriptResponse {
  content: string | Array<{ text: string; offset: number; duration: number; lang: string }>;
  lang: string;
  availableLangs: string[];
}

interface SupadataJobResponse {
  status: 'completed' | 'queued' | 'active' | 'failed';
  content?: string | Array<{ text: string; offset: number; duration: number; lang: string }>;
  lang?: string;
  availableLangs?: string[];
}

const SUPADATA_API_BASE = 'https://api.supadata.ai/v1';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;

// HTTP status codes that indicate the key's credits are exhausted
const CREDIT_EXHAUSTED_STATUSES = new Set([402, 429]);

@Injectable()
export class SupadataService implements OnModuleInit {
  // In-memory pool of active keys, ordered by createdAt ASC (oldest first)
  private keyPool: SupadataApiKey[] = [];
  // Index into keyPool pointing to the current key to try
  private currentIndex = 0;

  constructor(
    private readonly supadataApiKeyService: SupadataApiKeyService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadKeys();
  }

  /**
   * Load (or reload) all active AVAILABLE keys from DB into the in-memory pool.
   */
  async loadKeys(): Promise<void> {
    // Reactivate any keys whose nextActiveTime has passed before building the pool
    await this.supadataApiKeyService.reactivateEligibleKeys();
    const all = await this.supadataApiKeyService.list();
    this.keyPool = all
      .filter((k) => k.isActive && k.status === SupadataKeyStatus.AVAILABLE)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    this.currentIndex = 0;
    this.logger.log(
      `Supadata: loaded ${this.keyPool.length} active key(s) into memory`,
      'SupadataService',
    );
  }

  async extractSubtitles(youtubeUrl: string, videoId: string, lang?: string): Promise<SubtitleResponse> {
    this.logger.log(`Supadata: requesting transcript for videoId=${videoId} url=${youtubeUrl} lang=${lang ?? 'default'}`);

    if (this.keyPool.length === 0) {
      this.logger.error(`Supadata: key pool is empty for videoId=${videoId}`, undefined, 'SupadataService');
      throw new Error('Supadata: no API keys available');
    }

    // Track how many keys we've tried in this request to avoid infinite loops
    const startIndex = this.currentIndex;
    let tried = 0;

    while (tried < this.keyPool.length) {
      const key = this.keyPool[this.currentIndex % this.keyPool.length];
      tried++;

      this.logger.log(`Supadata: using key id=${key.id} (pool attempt ${tried}/${this.keyPool.length}) videoId=${videoId}`);

      const url = new URL(`${SUPADATA_API_BASE}/transcript`);
      url.searchParams.set('url', youtubeUrl);
      if (lang) url.searchParams.set('lang', lang);

      const response = await fetch(url.toString(), {
        headers: { 'x-api-key': key.apiKey },
      });

      this.logger.log(`Supadata: response status=${response.status} keyId=${key.id} videoId=${videoId}`);

      if (CREDIT_EXHAUSTED_STATUSES.has(response.status)) {
        const body = await response.text();
        this.logger.warn(
          `Supadata: key id=${key.id} credit exhausted (status=${response.status}), rotating. body=${body}`,
          'SupadataService',
        );
        // Mark exhausted in DB and remove from in-memory pool
        await this.supadataApiKeyService.markInsufficient(key.id);
        this.keyPool.splice(this.currentIndex % this.keyPool.length, 1);
        // Don't advance currentIndex — the next key has shifted into this slot
        continue;
      }

      if (response.status === 202) {
        const job = (await response.json()) as { jobId: string };
        this.logger.log(`Supadata: async job started jobId=${job.jobId} keyId=${key.id} videoId=${videoId}`);
        this.advanceKey();
        return this.pollJob(job.jobId, key.apiKey, videoId);
      }

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`Supadata: request failed status=${response.status} keyId=${key.id} videoId=${videoId} body=${body}`);
        throw new Error(`Supadata API error ${response.status}: ${body}`);
      }

      const data = (await response.json()) as SupadataTranscriptResponse;
      this.logger.log(`Supadata: transcript received synchronously lang=${data.lang} availableLangs=${data.availableLangs?.join(',')} keyId=${key.id} videoId=${videoId}`);
      this.advanceKey();
      return this.toSubtitleResponse(data, videoId);
    }

    this.logger.error(
      `Supadata: all ${tried} key(s) in pool exhausted for videoId=${videoId}`,
      undefined,
      'SupadataService',
    );
    throw new Error('Supadata: all API keys are exhausted or unavailable');
  }

  private advanceKey(): void {
    if (this.keyPool.length > 0) {
      this.currentIndex = (this.currentIndex + 1) % this.keyPool.length;
    }
  }

  private async pollJob(jobId: string, apiKey: string, videoId: string): Promise<SubtitleResponse> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let attempt = 0;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      attempt++;

      const response = await fetch(`${SUPADATA_API_BASE}/transcript/${jobId}`, {
        headers: { 'x-api-key': apiKey },
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`Supadata: poll failed status=${response.status} jobId=${jobId} attempt=${attempt} body=${body}`);
        throw new Error(`Supadata poll error ${response.status}: ${body}`);
      }

      const job = (await response.json()) as SupadataJobResponse;
      this.logger.log(`Supadata: poll attempt=${attempt} status=${job.status} jobId=${jobId} videoId=${videoId}`);

      if (job.status === 'failed') {
        this.logger.error(`Supadata: job failed jobId=${jobId} videoId=${videoId}`);
        throw new Error('Supadata transcript job failed');
      }

      if (job.status === 'completed' && job.content !== undefined) {
        this.logger.log(`Supadata: job completed jobId=${jobId} videoId=${videoId} attempts=${attempt}`);
        return this.toSubtitleResponse(job as SupadataTranscriptResponse, videoId);
      }
    }

    this.logger.error(`Supadata: job timed out jobId=${jobId} videoId=${videoId} attempts=${attempt}`);
    throw new Error('Supadata transcript job timed out');
  }

  private toSubtitleResponse(data: SupadataTranscriptResponse, videoId: string): SubtitleResponse {
    const subtitles =
      typeof data.content === 'string'
        ? data.content
        : data.content.map((c) => c.text).join(' ');

    if (!subtitles.trim()) {
      this.logger.warn(`Supadata: empty subtitles content videoId=${videoId} lang=${data.lang}`);
      return { statusCode: 422, errorMessage: 'No subtitles content returned by Supadata' };
    }

    const subtitlesVtt =
      Array.isArray(data.content) && data.content.length > 0
        ? this.buildVtt(data.content)
        : undefined;

    this.logger.log(`Supadata: subtitles extracted videoId=${videoId} lang=${data.lang} length=${subtitles.length} hasVtt=${!!subtitlesVtt}`);

    return {
      statusCode: 200,
      language: data.lang,
      spokenLanguage: data.lang,
      subtitles,
      subtitlesVtt,
      // Title must be fetched separately; Supadata transcript endpoint doesn't return it
      title: undefined,
    };
  }

  private buildVtt(cues: Array<{ text: string; offset: number; duration: number }>): string {
    const formatTime = (ms: number): string => {
      const totalSeconds = ms / 1000;
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
    };

    const lines = ['WEBVTT', ''];
    for (const cue of cues) {
      const start = formatTime(cue.offset);
      const end = formatTime(cue.offset + cue.duration);
      lines.push(`${start} --> ${end}`, cue.text, '');
    }
    return lines.join('\n');
  }
}
