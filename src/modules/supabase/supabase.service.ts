import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private client: SupabaseClient | null = null;
  private isLocal: boolean;
  private uploadsDir: string;
  private backendUrl: string;

  constructor(
    private readonly secretsService: AwsSecretsService,
    private readonly configService: ConfigService,
  ) {
    this.isLocal = this.configService.get<string>('NODE_ENV') === 'local';
    this.uploadsDir = path.join(process.cwd(), 'uploads');
    const port = this.configService.get<string>('PORT') || '5007';
    this.backendUrl = `http://localhost:${port}`;
  }

  async onModuleInit() {
    if (this.isLocal) {
      fs.mkdirSync(path.join(this.uploadsDir, 'thumbnails'), { recursive: true });
      fs.mkdirSync(path.join(this.uploadsDir, 'audio'), { recursive: true });
      return;
    }

    const secrets = await this.secretsService.getSecret();
    if (secrets.SUPABASE_URL && secrets.SUPABASE_URL !== 'REPLACE_ME') {
      this.client = createClient(secrets.SUPABASE_URL, secrets.SUPABASE_API_KEY);
    }
  }

  async uploadThumbnail(videoId: string, imageBuffer: Buffer, contentType: string): Promise<string | null> {
    const fileName = `${videoId}.jpg`;

    if (this.isLocal) {
      const filePath = path.join(this.uploadsDir, 'thumbnails', fileName);
      fs.writeFileSync(filePath, imageBuffer);
      return `${this.backendUrl}/uploads/thumbnails/${fileName}`;
    }

    if (!this.client) return null;

    const storagePath = `thumbnails/${fileName}`;
    const { error } = await this.client.storage
      .from('thumbnails')
      .upload(storagePath, imageBuffer, { contentType, upsert: true });

    if (error) return null;

    const { data } = this.client.storage.from('thumbnails').getPublicUrl(storagePath);
    return data.publicUrl;
  }

  async uploadAudio(fileName: string, audioBuffer: Buffer, contentType: string): Promise<string | null> {
    if (this.isLocal) {
      const filePath = path.join(this.uploadsDir, 'audio', fileName);
      fs.writeFileSync(filePath, audioBuffer);
      return `${this.backendUrl}/uploads/audio/${fileName}`;
    }

    if (!this.client) return null;

    const storagePath = `audio/${fileName}`;
    const { error } = await this.client.storage
      .from('audio')
      .upload(storagePath, audioBuffer, { contentType, upsert: true });

    if (error) return null;

    const { data } = this.client.storage.from('audio').getPublicUrl(storagePath);
    return data.publicUrl;
  }
}
