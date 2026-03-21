import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { GetUser } from 'src/decorators/user.decorator';
import { UserDTO } from 'src/dtos/user.dto';
import { HomeworkService, SubmitQuestionDto } from './homework.service';

@Controller('homework')
@UseGuards(JwtAuthGuard)
export class HomeworkController {
  constructor(private readonly homeworkService: HomeworkService) {}

  @Get(':sessionId')
  async getHomework(@GetUser() user: UserDTO, @Param('sessionId') sessionId: string) {
    return this.homeworkService.getHomework(sessionId, user.userId);
  }

  @Post(':sessionId/submit/:questionId')
  async submitQuestion(
    @GetUser() user: UserDTO,
    @Param('sessionId') sessionId: string,
    @Param('questionId') questionId: string,
    @Body() dto: SubmitQuestionDto,
  ) {
    return this.homeworkService.submitQuestion(sessionId, user.userId, questionId, dto);
  }

  @Get(':sessionId/questions/:questionId/submissions')
  async getQuestionSubmissions(
    @GetUser() user: UserDTO,
    @Param('sessionId') sessionId: string,
    @Param('questionId') questionId: string,
  ) {
    return this.homeworkService.getQuestionSubmissions(sessionId, user.userId, questionId);
  }
}
