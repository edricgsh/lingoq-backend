import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
  async getRecommendations(
    @GetUser() user: UserDTO,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const onboarding = await this.onboardingService.getOnboarding(user.userId);
    if (!onboarding.interestTopics?.length) return { data: [], nextCursor: null, hasMore: false };
    return this.exploreService.getRecommendations(
      onboarding.interestTopics,
      onboarding.targetLanguage,
      limit ? +limit : 20,
      cursor,
    );
  }
}
