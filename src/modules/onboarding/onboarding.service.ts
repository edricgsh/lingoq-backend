import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserOnboarding } from 'src/entities/user-onboarding.entity';
import { ProficiencyLevel } from 'src/enums/proficiency-level.enum';
import { User } from 'src/entities/user.entity';
import { PgBossService } from 'src/modules/pg-boss/pg-boss.service';
import { PgBossQueueEnum } from 'src/enums/pg-boss-queue.enum';

export interface CompleteOnboardingDto {
  nativeLanguage: string;
  targetLanguage: string;
  proficiencyLevel: ProficiencyLevel;
  learningGoals?: string;
  interestTopics?: string[];
  hasSeenTour?: boolean;
}

@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(UserOnboarding)
    private readonly onboardingRepository: Repository<UserOnboarding>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly pgBossService: PgBossService,
  ) {}

  async getOnboarding(userId: string): Promise<UserOnboarding> {
    const onboarding = await this.onboardingRepository.findOne({ where: { userId } });
    if (!onboarding) throw new NotFoundException('Onboarding not found');
    return onboarding;
  }

  async completeOnboarding(userId: string, dto: CompleteOnboardingDto): Promise<UserOnboarding> {
    let onboarding = await this.onboardingRepository.findOne({ where: { userId } });
    if (!onboarding) {
      const { v4: uuidv4 } = await import('uuid');
      onboarding = this.onboardingRepository.create({ id: uuidv4(), userId });
    }

    onboarding.nativeLanguage = dto.nativeLanguage;
    onboarding.targetLanguage = dto.targetLanguage;
    onboarding.proficiencyLevel = dto.proficiencyLevel;
    onboarding.learningGoals = dto.learningGoals;
    onboarding.interestTopics = dto.interestTopics ?? [];
    onboarding.isComplete = true;

    const saved = await this.onboardingRepository.save(onboarding);

    if (dto.interestTopics?.length > 0) {
      await this.pgBossService.send(PgBossQueueEnum.EXPLORE_GENERATE_RECOMMENDATIONS, {
        userId,
        topics: dto.interestTopics,
        targetLanguage: dto.targetLanguage,
      });
    }

    return saved;
  }

  async updateOnboarding(userId: string, dto: Partial<CompleteOnboardingDto>): Promise<UserOnboarding> {
    const onboarding = await this.onboardingRepository.findOne({ where: { userId } });
    if (!onboarding) throw new NotFoundException('Onboarding not found');

    Object.assign(onboarding, dto);
    return this.onboardingRepository.save(onboarding);
  }
}
