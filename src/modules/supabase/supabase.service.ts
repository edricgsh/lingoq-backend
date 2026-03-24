import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';
import { LoggerService } from 'src/modules/logger/logger.service';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private client: SupabaseClient | null = null;
  private bucket: string | null = null;

  constructor(
    private readonly secretsService: AwsSecretsService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    this.bucket = this.configService.get<string>('SUPABASE_BUCKET') ?? null;
    if (!this.bucket) {
      this.logger.warn('SUPABASE_BUCKET not set — uploads will be skipped', 'SupabaseService');
    }

    const secrets = await this.secretsService.getSecret();
    if (secrets.SUPABASE_URL && secrets.SUPABASE_URL !== 'REPLACE_ME') {
      this.client = createClient(secrets.SUPABASE_URL, secrets.SUPABASE_API_KEY);
    } else {
      this.logger.warn('Supabase not configured (SUPABASE_URL missing or placeholder)', 'SupabaseService');
    }
  }

  async uploadThumbnail(videoId: string, imageBuffer: Buffer, contentType: string): Promise<string | null> {
    if (!this.client || !this.bucket) return null;

    const storagePath = `thumbnails/${videoId}.jpg`;
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(storagePath, imageBuffer, { contentType, upsert: true });

    if (error) {
      this.logger.warn(`Supabase thumbnail upload error: ${error.message}`, 'SupabaseService');
      return null;
    }

    const { data } = this.client.storage.from(this.bucket).getPublicUrl(storagePath);
    return data.publicUrl;
  }

  async uploadAudio(fileName: string, audioBuffer: Buffer, contentType: string): Promise<string | null> {
    if (!this.client || !this.bucket) return null;

    const storagePath = `audio/${fileName}`;
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(storagePath, audioBuffer, { contentType, upsert: true });

    if (error) {
      this.logger.warn(`Supabase audio upload error: ${error.message}`, 'SupabaseService');
      return null;
    }

    const { data } = this.client.storage.from(this.bucket).getPublicUrl(storagePath);
    return data.publicUrl;
  }
}
