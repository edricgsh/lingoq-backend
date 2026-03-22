import { Injectable } from '@nestjs/common';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';
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

@Injectable()
export class SupadataService {
  constructor(
    private readonly secretsService: AwsSecretsService,
    private readonly logger: LoggerService,
  ) {}

  async extractSubtitles(youtubeUrl: string, videoId: string, lang?: string): Promise<SubtitleResponse> {
    this.logger.log(`Supadata: requesting transcript for videoId=${videoId} url=${youtubeUrl} lang=${lang ?? 'default'}`);

    const secrets = await this.secretsService.getSecret();
    const apiKey = secrets.SUPADATA_API_KEY ?? '';

    const url = new URL(`${SUPADATA_API_BASE}/transcript`);
    url.searchParams.set('url', youtubeUrl);
    if (lang) url.searchParams.set('lang', lang);

    const response = await fetch(url.toString(), {
      headers: { 'x-api-key': apiKey },
    });

    this.logger.log(`Supadata: response status=${response.status} videoId=${videoId}`);

    if (response.status === 202) {
      const job = (await response.json()) as { jobId: string };
      this.logger.log(`Supadata: async job started jobId=${job.jobId} videoId=${videoId}`);
      return this.pollJob(job.jobId, videoId);
    }

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Supadata: request failed status=${response.status} videoId=${videoId} body=${body}`);
      throw new Error(`Supadata API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as SupadataTranscriptResponse;
    this.logger.log(`Supadata: transcript received synchronously lang=${data.lang} availableLangs=${data.availableLangs?.join(',')} videoId=${videoId}`);
    return this.toSubtitleResponse(data, videoId);
  }

  private async pollJob(jobId: string, videoId: string): Promise<SubtitleResponse> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let attempt = 0;
    const secrets = await this.secretsService.getSecret();
    const apiKey = secrets.SUPADATA_API_KEY ?? '';

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
