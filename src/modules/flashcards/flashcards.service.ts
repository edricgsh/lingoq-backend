import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, LessThan, LessThanOrEqual, Not, In, Repository } from 'typeorm';
import { FlashcardProgress } from 'src/entities/flashcard-progress.entity';
import { FlashcardSettings } from 'src/entities/flashcard-settings.entity';
import { VocabItem } from 'src/entities/vocab-item.entity';
import { LearningSession } from 'src/entities/learning-session.entity';
import { LoggerService } from 'src/modules/logger/logger.service';
import { applySm2 } from './sm2.helper';
import { UpdateFlashcardSettingsDto } from './dto/update-flashcard-settings.dto';
import { v4 as uuidv4 } from 'uuid';

export interface DueCard {
  vocabItemId: string;
  word: string;
  partOfSpeech: string | null;
  definition: { targetLang: string; nativeLang: string } | null;
  examples: Array<{ sentence: string; translation: string }> | null;
  audioUrl: string | null;
  isNew: boolean;
  easeFactor: number;
  interval: number;
  repetitions: number;
}

@Injectable()
export class FlashcardsService {
  constructor(
    @InjectRepository(FlashcardProgress)
    private readonly progressRepo: Repository<FlashcardProgress>,
    @InjectRepository(FlashcardSettings)
    private readonly settingsRepo: Repository<FlashcardSettings>,
    @InjectRepository(VocabItem)
    private readonly vocabRepo: Repository<VocabItem>,
    @InjectRepository(LearningSession)
    private readonly sessionRepo: Repository<LearningSession>,
    private readonly logger: LoggerService,
  ) {}

  async getSettings(userId: string): Promise<FlashcardSettings> {
    let settings = await this.settingsRepo.findOne({ where: { userId } });
    if (!settings) {
      settings = this.settingsRepo.create({ id: uuidv4(), userId });
      await this.settingsRepo.save(settings);
    }
    return settings;
  }

  async updateSettings(userId: string, dto: UpdateFlashcardSettingsDto): Promise<FlashcardSettings> {
    let settings = await this.settingsRepo.findOne({ where: { userId } });
    if (!settings) {
      settings = this.settingsRepo.create({ id: uuidv4(), userId });
    }
    Object.assign(settings, dto);
    return this.settingsRepo.save(settings);
  }

  async getDueCards(userId: string): Promise<{ cards: DueCard[]; totalDue: number }> {
    const settings = await this.getSettings(userId);
    const { dailyLimit } = settings;

    const now = new Date();

    // Review cards: existing progress where nextReviewAt <= now
    const dueProgress = await this.progressRepo.find({
      where: { userId, nextReviewAt: LessThanOrEqual(now) },
      relations: ['vocabItem'],
      order: { nextReviewAt: 'ASC' },
    });

    const seenReviewWords = new Set<string>();
    const reviewCards: DueCard[] = dueProgress
      .filter((p) => {
        if (!p.vocabItem) return false;
        const key = p.vocabItem.word.toLowerCase().trim();
        if (seenReviewWords.has(key)) return false;
        seenReviewWords.add(key);
        return true;
      })
      .slice(0, dailyLimit)
      .map((p) => ({
        vocabItemId: p.vocabItemId,
        word: p.vocabItem.word,
        partOfSpeech: p.vocabItem.partOfSpeech ?? null,
        definition: p.vocabItem.definition ?? null,
        examples: p.vocabItem.examples ?? null,
        audioUrl: p.vocabItem.audioUrl ?? null,
        isNew: false,
        easeFactor: p.easeFactor,
        interval: p.interval,
        repetitions: p.repetitions,
      }));

    const remaining = dailyLimit - reviewCards.length;

    let newCards: DueCard[] = [];
    if (remaining > 0) {
      // Get all vocab item IDs that already have progress for this user
      const existingProgressIds = await this.progressRepo.find({
        where: { userId },
        select: ['vocabItemId'],
      });
      const seenVocabIds = existingProgressIds.map((p) => p.vocabItemId);

      // Get activeContentVersionIds for sessions belonging to this user (with completed content)
      const sessions = await this.sessionRepo
        .createQueryBuilder('s')
        .where('s.userId = :userId', { userId })
        .andWhere('s.active_content_version_id IS NOT NULL')
        .select('s.activeContentVersionId', 'activeContentVersionId')
        .orderBy('s.createdAt', 'DESC')
        .getRawMany();

      const contentVersionIds = sessions
        .map((s) => s.activeContentVersionId)
        .filter(Boolean);

      if (contentVersionIds.length > 0) {
        const whereClause: any = { contentVersionId: In(contentVersionIds) };
        if (seenVocabIds.length > 0) {
          whereClause.id = Not(In(seenVocabIds));
        }

        const newVocabItemsRaw = await this.vocabRepo.find({
          where: whereClause,
          order: { createdAt: 'ASC' },
          take: remaining * 5, // over-fetch to allow dedup
        });

        const seenNewWords = new Set<string>();
        const newVocabItems = newVocabItemsRaw.filter((v) => {
          const key = v.word.toLowerCase().trim();
          if (seenNewWords.has(key)) return false;
          seenNewWords.add(key);
          return true;
        }).slice(0, remaining);

        newCards = newVocabItems.map((v) => ({
          vocabItemId: v.id,
          word: v.word,
          partOfSpeech: v.partOfSpeech ?? null,
          definition: v.definition ?? null,
          examples: v.examples ?? null,
          audioUrl: v.audioUrl ?? null,
          isNew: true,
          easeFactor: 2.5,
          interval: 0,
          repetitions: 0,
        }));
      }
    }

    const cards = [...reviewCards, ...newCards];
    this.logger.log(
      `[getDueCards] userId=${userId} dailyLimit=${dailyLimit} reviewCards=${reviewCards.length} newCards=${newCards.length} total=${cards.length}`,
      'FlashcardsService',
    );
    return { cards, totalDue: cards.length };
  }

  async reviewCard(userId: string, vocabItemId: string, rating: number): Promise<FlashcardProgress> {
    let progress = await this.progressRepo.findOne({ where: { userId, vocabItemId } });

    if (!progress) {
      progress = this.progressRepo.create({
        id: uuidv4(),
        userId,
        vocabItemId,
        easeFactor: 2.5,
        interval: 0,
        repetitions: 0,
      });
    }

    const result = applySm2(rating, progress.easeFactor, progress.interval, progress.repetitions);
    progress.easeFactor = result.easeFactor;
    progress.interval = result.interval;
    progress.repetitions = result.repetitions;
    progress.nextReviewAt = result.nextReviewAt;
    progress.lastReviewedAt = new Date();

    this.logger.log(
      `Flashcard review: user=${userId} vocab=${vocabItemId} rating=${rating} interval=${result.interval} nextReview=${result.nextReviewAt.toISOString()}`,
      'FlashcardsService',
    );

    return this.progressRepo.save(progress);
  }

  async getStats(userId: string): Promise<{ reviewedToday: number; remainingToday: number }> {
    const settings = await this.getSettings(userId);

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setUTCHours(23, 59, 59, 999);

    const reviewedToday = await this.progressRepo
      .createQueryBuilder('p')
      .where('p.user_id = :userId', { userId })
      .andWhere('p.last_reviewed_at >= :startOfDay', { startOfDay })
      .andWhere('p.last_reviewed_at <= :endOfDay', { endOfDay })
      .getCount();

    const { totalDue } = await this.getDueCards(userId);
    const remainingToday = Math.max(0, totalDue);

    this.logger.log(
      `[getStats] userId=${userId} dailyLimit=${settings.dailyLimit} reviewedToday=${reviewedToday} totalDue=${totalDue} remainingToday=${remainingToday}`,
      'FlashcardsService',
    );

    return { reviewedToday, remainingToday };
  }

  async getUsersWithRemindersForHour(utcHour: number): Promise<FlashcardSettings[]> {
    const hourStr = String(utcHour).padStart(2, '0') + ':';
    return this.settingsRepo
      .createQueryBuilder('s')
      .where('s.reminder_enabled = true')
      .andWhere('s.reminder_time LIKE :pattern', { pattern: `${hourStr}%` })
      .getMany();
  }

  async getDueCountForUser(userId: string): Promise<number> {
    const { totalDue } = await this.getDueCards(userId);
    return totalDue;
  }

  async getVocabBrowse(
    userId: string,
    limit = 20,
    cursor?: string,
    search?: string,
  ): Promise<{ data: VocabItem[]; nextCursor: string | null; hasMore: boolean }> {
    // Get all active content version IDs for this user
    const sessions = await this.sessionRepo
      .createQueryBuilder('s')
      .where('s.userId = :userId', { userId })
      .andWhere('s.active_content_version_id IS NOT NULL')
      .select('s.activeContentVersionId', 'activeContentVersionId')
      .getRawMany();

    const contentVersionIds = sessions.map((s) => s.activeContentVersionId).filter(Boolean);
    if (contentVersionIds.length === 0) {
      return { data: [], nextCursor: null, hasMore: false };
    }

    const where: any = { contentVersionId: In(contentVersionIds) };
    if (search) {
      where.word = ILike(`%${search}%`);
    }

    if (cursor) {
      const cursorItem = await this.vocabRepo.findOne({ where: { id: cursor } });
      if (cursorItem) {
        where.createdAt = LessThan(cursorItem.createdAt);
      }
    }

    const items = await this.vocabRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit + 1,
    });

    const hasMore = items.length > limit;
    if (hasMore) items.pop();
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { data: items, nextCursor, hasMore };
  }

  async getExtraCards(userId: string, limit: number): Promise<{ cards: DueCard[] }> {
    const progress = await this.progressRepo.find({
      where: { userId },
      relations: ['vocabItem'],
      order: { easeFactor: 'ASC', interval: 'ASC' },
      take: limit,
    });

    const seenExtraWords = new Set<string>();
    const cards: DueCard[] = progress
      .filter((p) => {
        if (!p.vocabItem) return false;
        const key = p.vocabItem.word.toLowerCase().trim();
        if (seenExtraWords.has(key)) return false;
        seenExtraWords.add(key);
        return true;
      })
      .map((p) => ({
        vocabItemId: p.vocabItemId,
        word: p.vocabItem.word,
        partOfSpeech: p.vocabItem.partOfSpeech ?? null,
        definition: p.vocabItem.definition ?? null,
        examples: p.vocabItem.examples ?? null,
        audioUrl: p.vocabItem.audioUrl ?? null,
        isNew: false,
        easeFactor: p.easeFactor,
        interval: p.interval,
        repetitions: p.repetitions,
      }));

    return { cards };
  }
}
