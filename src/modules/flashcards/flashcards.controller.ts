import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { GetUser } from 'src/decorators/user.decorator';
import { UserDTO } from 'src/dtos/user.dto';
import { FlashcardsService } from './flashcards.service';
import { ReviewFlashcardDto } from './dto/review-flashcard.dto';
import { UpdateFlashcardSettingsDto } from './dto/update-flashcard-settings.dto';

@Controller('flashcards')
@UseGuards(JwtAuthGuard)
export class FlashcardsController {
  constructor(private readonly flashcardsService: FlashcardsService) {}

  @Get('due')
  async getDueCards(@GetUser() user: UserDTO) {
    return this.flashcardsService.getDueCards(user.userId);
  }

  @Post(':vocabItemId/review')
  async reviewCard(
    @GetUser() user: UserDTO,
    @Param('vocabItemId') vocabItemId: string,
    @Body() dto: ReviewFlashcardDto,
  ) {
    return this.flashcardsService.reviewCard(user.userId, vocabItemId, dto.rating);
  }

  @Get('stats')
  async getStats(@GetUser() user: UserDTO) {
    return this.flashcardsService.getStats(user.userId);
  }

  @Get('settings')
  async getSettings(@GetUser() user: UserDTO) {
    return this.flashcardsService.getSettings(user.userId);
  }

  @Put('settings')
  async updateSettings(@GetUser() user: UserDTO, @Body() dto: UpdateFlashcardSettingsDto) {
    return this.flashcardsService.updateSettings(user.userId, dto);
  }
}
