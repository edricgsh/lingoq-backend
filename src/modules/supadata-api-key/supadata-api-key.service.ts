import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  SupadataApiKey,
  SupadataKeyStatus,
} from 'src/entities/supadata-api-key.entity';
import { LoggerService } from 'src/modules/logger/logger.service';

const SUPADATA_ME_URL = 'https://api.supadata.ai/v1/me';
const CREDIT_CACHE_MINUTES = 10;

export interface SupadataCreditInfo {
  id: string;
  maxCredits: number | null;
  usedCredits: number | null;
  availableCredits: number | null;
  nextCreditFetch: Date | null;
  fetchedFromCache: boolean;
}

export interface SupadataMeResponse {
  organizationId: string;
  plan: string;
  maxCredits: number;
  usedCredits: number;
}

@Injectable()
export class SupadataApiKeyService {
  constructor(
    @InjectRepository(SupadataApiKey)
    private readonly repo: Repository<SupadataApiKey>,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Returns a usable API key, rotating through keys with AVAILABLE status.
   */
  async getActiveKey(): Promise<SupadataApiKey> {
    await this.reactivateEligibleKeys();

    const key = await this.repo.findOne({
      where: { isActive: true, status: SupadataKeyStatus.AVAILABLE },
      order: { createdAt: 'ASC' },
    });

    if (!key) {
      throw new NotFoundException(
        'No available Supadata API keys. All keys are either inactive or insufficient-fund.',
      );
    }

    return key;
  }

  async markInsufficient(id: string, nextActiveTime?: Date): Promise<SupadataApiKey> {
    const key = await this.findById(id);
    key.status = SupadataKeyStatus.INSUFFICIENT_FUND;
    key.nextActiveTime = nextActiveTime ?? null;
    const saved = await this.repo.save(key);
    this.logger.warn(
      `Supadata key ${id} marked INSUFFICIENT_FUND. nextActiveTime=${nextActiveTime?.toISOString() ?? 'none'}`,
      'SupadataApiKeyService',
    );
    return saved;
  }

  // ---------- Credits ----------

  /**
   * Returns credit info for multiple keys. Serves from DB cache unless
   * next_credit_fetch has passed, in which case it fetches live from Supadata.
   * Only fetches stale keys (never all at once by design — caller sends in batches).
   */
  async getCreditsForKeys(ids: string[]): Promise<SupadataCreditInfo[]> {
    const keys = await this.repo.find({ where: { id: In(ids) } });
    const now = new Date();
    const results: SupadataCreditInfo[] = [];

    for (const key of keys) {
      const needsFetch = !key.nextCreditFetch || key.nextCreditFetch <= now;

      if (needsFetch) {
        const fetched = await this.fetchAndStoreCreditInfo(key);
        results.push({ ...fetched, fetchedFromCache: false });
      } else {
        results.push({
          id: key.id,
          maxCredits: key.maxCredits,
          usedCredits: key.usedCredits,
          availableCredits: key.maxCredits != null && key.usedCredits != null
            ? key.maxCredits - key.usedCredits
            : null,
          nextCreditFetch: key.nextCreditFetch,
          fetchedFromCache: true,
        });
      }
    }

    return results;
  }

  /**
   * Force-refresh credit info for a single key regardless of cache.
   */
  async forceRefreshCredits(id: string): Promise<SupadataCreditInfo> {
    const key = await this.findById(id);
    const result = await this.fetchAndStoreCreditInfo(key);
    return { ...result, fetchedFromCache: false };
  }

  // ---------- Bulk export / import ----------

  /**
   * Export all keys as plaintext (decrypted) — TypeORM transformer handles decryption.
   */
  async exportKeys(): Promise<Array<{ email: string; apiKey: string; isActive: boolean }>> {
    const keys = await this.repo.find({ order: { createdAt: 'ASC' } });
    return keys.map((k) => ({ email: k.email, apiKey: k.apiKey, isActive: k.isActive }));
  }

  /**
   * Import keys in bulk. Skips duplicates by email. Returns counts.
   */
  async importKeys(
    rows: Array<{ email: string; apiKey: string; isActive?: boolean }>,
  ): Promise<{ created: number; skipped: number }> {
    const existing = await this.repo.find();
    const existingEmails = new Set(existing.map((k) => k.email.toLowerCase()));

    let created = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!row.email || !row.apiKey) { skipped++; continue; }
      if (existingEmails.has(row.email.toLowerCase())) { skipped++; continue; }

      const entity = this.repo.create({
        email: row.email,
        apiKey: row.apiKey,
        isActive: row.isActive ?? true,
        status: SupadataKeyStatus.AVAILABLE,
        nextActiveTime: null,
      });
      await this.repo.save(entity);
      existingEmails.add(row.email.toLowerCase());
      created++;
    }

    this.logger.log(`Supadata keys import: created=${created} skipped=${skipped}`, 'SupadataApiKeyService');
    return { created, skipped };
  }

  // ---------- CRUD ----------

  async list(): Promise<SupadataApiKey[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<SupadataApiKey> {
    const key = await this.repo.findOne({ where: { id } });
    if (!key) throw new NotFoundException(`Supadata API key ${id} not found`);
    return key;
  }

  async create(email: string, apiKey: string, isActive = true): Promise<SupadataApiKey> {
    const entity = this.repo.create({
      email,
      apiKey,
      isActive,
      status: SupadataKeyStatus.AVAILABLE,
      nextActiveTime: null,
    });
    const saved = await this.repo.save(entity);
    this.logger.log(`Supadata API key created for ${email} (id=${saved.id})`, 'SupadataApiKeyService');
    return saved;
  }

  async update(
    id: string,
    data: Partial<Pick<SupadataApiKey, 'email' | 'apiKey' | 'status' | 'isActive' | 'nextActiveTime'>>,
  ): Promise<SupadataApiKey> {
    const key = await this.findById(id);
    Object.assign(key, data);
    return this.repo.save(key);
  }

  async remove(id: string): Promise<void> {
    const key = await this.findById(id);
    await this.repo.remove(key);
    this.logger.log(`Supadata API key ${id} deleted`, 'SupadataApiKeyService');
  }

  // ---------- Private helpers ----------

  private async fetchAndStoreCreditInfo(key: SupadataApiKey): Promise<SupadataCreditInfo> {
    try {
      const res = await fetch(SUPADATA_ME_URL, {
        headers: { 'x-api-key': key.apiKey },
      });

      if (!res.ok) {
        this.logger.warn(
          `Supadata /v1/me returned ${res.status} for key ${key.id}`,
          'SupadataApiKeyService',
        );
        // Still advance the cache timer so we don't hammer a broken key
        const nextCreditFetch = this.nextFetchTime();
        await this.repo.update(key.id, { nextCreditFetch });
        return {
          id: key.id,
          maxCredits: key.maxCredits,
          usedCredits: key.usedCredits,
          availableCredits: key.maxCredits != null && key.usedCredits != null
            ? key.maxCredits - key.usedCredits
            : null,
          nextCreditFetch,
          fetchedFromCache: false,
        };
      }

      const data: SupadataMeResponse = await res.json();
      const nextCreditFetch = this.nextFetchTime();

      await this.repo.update(key.id, {
        maxCredits: data.maxCredits,
        usedCredits: data.usedCredits,
        nextCreditFetch,
      });

      return {
        id: key.id,
        maxCredits: data.maxCredits,
        usedCredits: data.usedCredits,
        availableCredits: data.maxCredits - data.usedCredits,
        nextCreditFetch,
        fetchedFromCache: false,
      };
    } catch (err) {
      this.logger.error(
        `Failed to fetch credits for key ${key.id}: ${err.message}`,
        err.stack,
        'SupadataApiKeyService',
      );
      return {
        id: key.id,
        maxCredits: key.maxCredits,
        usedCredits: key.usedCredits,
        availableCredits: key.maxCredits != null && key.usedCredits != null
          ? key.maxCredits - key.usedCredits
          : null,
        nextCreditFetch: key.nextCreditFetch,
        fetchedFromCache: false,
      };
    }
  }

  private nextFetchTime(): Date {
    const d = new Date();
    d.setMinutes(d.getMinutes() + CREDIT_CACHE_MINUTES);
    return d;
  }

  async reactivateEligibleKeys(): Promise<void> {
    const now = new Date();
    await this.repo
      .createQueryBuilder()
      .update(SupadataApiKey)
      .set({ status: SupadataKeyStatus.AVAILABLE, nextActiveTime: null })
      .where('status = :status', { status: SupadataKeyStatus.INSUFFICIENT_FUND })
      .andWhere('next_active_time IS NOT NULL')
      .andWhere('next_active_time <= :now', { now })
      .execute();
  }
}
