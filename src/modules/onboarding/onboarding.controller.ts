import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { GetUser } from 'src/decorators/user.decorator';
import { UserDTO } from 'src/dtos/user.dto';
import { OnboardingService, CompleteOnboardingDto } from './onboarding.service';

@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get()
  async getOnboarding(@GetUser() user: UserDTO) {
    return this.onboardingService.getOnboarding(user.userId);
  }

  @Post('complete')
  async completeOnboarding(
    @GetUser() user: UserDTO,
    @Body() dto: CompleteOnboardingDto,
  ) {
    return this.onboardingService.completeOnboarding(user.userId, dto);
  }

  @Patch()
  async updateOnboarding(
    @GetUser() user: UserDTO,
    @Body() dto: Partial<CompleteOnboardingDto>,
  ) {
    return this.onboardingService.updateOnboarding(user.userId, dto);
  }
}
