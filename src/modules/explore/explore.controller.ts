import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { GetUser } from 'src/decorators/user.decorator';
import { UserDTO } from 'src/dtos/user.dto';
import { ExploreService } from './explore.service';
import { OnboardingService } from 'src/modules/onboarding/onboarding.service';

@Controller('explore')
@UseGuards(JwtAuthGuard)
export class ExploreController {
  constructor(
    private readonly exploreService: ExploreService,
    private readonly onboardingService: OnboardingService,
  ) {}

  @Get('recommendations')
  async getRecommendations(@GetUser() user: UserDTO) {
    const onboarding = await this.onboardingService.getOnboarding(user.userId);
    if (!onboarding.interestTopics?.length) return [];
    return this.exploreService.getRecommendations(onboarding.interestTopics, onboarding.targetLanguage);
  }
}
