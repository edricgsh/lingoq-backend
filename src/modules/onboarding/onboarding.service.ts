import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserOnboarding } from 'src/entities/user-onboarding.entity';
import { ProficiencyLevel } from 'src/enums/proficiency-level.enum';
import { User } from 'src/entities/user.entity';

export interface CompleteOnboardingDto {
  nativeLanguage: string;
  targetLanguage: string;
  proficiencyLevel: ProficiencyLevel;
  learningGoals?: string;
}

@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(UserOnboarding)
    private readonly onboardingRepository: Repository<UserOnboarding>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
    onboarding.isComplete = true;

    return this.onboardingRepository.save(onboarding);
  }

  async updateOnboarding(userId: string, dto: Partial<CompleteOnboardingDto>): Promise<UserOnboarding> {
    const onboarding = await this.onboardingRepository.findOne({ where: { userId } });
    if (!onboarding) throw new NotFoundException('Onboarding not found');

    Object.assign(onboarding, dto);
    return this.onboardingRepository.save(onboarding);
  }
}
