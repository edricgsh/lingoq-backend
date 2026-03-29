import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
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

  @Get('subtitles/:videoId')
  async getSubtitles(@Param('videoId') videoId: string) {
    const vtt = await this.exploreService.getSubtitlesByVideoId(videoId);
    return { vtt };
  }

  @Get('recommendations')
  async getRecommendations(
    @GetUser() user: UserDTO,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('topics') topicsParam?: string,
  ) {
    const onboarding = await this.onboardingService.getOnboarding(user.userId);
    if (!onboarding.interestTopics?.length) return { data: [], nextCursor: null, hasMore: false };

    // If caller passes specific topics, intersect with the user's own topics
    const requested = topicsParam ? topicsParam.split(',').map((t) => t.trim()).filter(Boolean) : null;
    const topics = requested
      ? onboarding.interestTopics.filter((t) => requested.includes(t))
      : onboarding.interestTopics;

    if (!topics.length) return { data: [], nextCursor: null, hasMore: false };

    return this.exploreService.getRecommendations(
      topics,
      onboarding.targetLanguage,
      limit ? +limit : 20,
      cursor ? +cursor : 0,
    );
  }
}
