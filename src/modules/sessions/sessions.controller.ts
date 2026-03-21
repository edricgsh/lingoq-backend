import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { GetUser } from 'src/decorators/user.decorator';
import { UserDTO } from 'src/dtos/user.dto';
import { SessionsService, CreateSessionDto } from './sessions.service';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  async createSession(@GetUser() user: UserDTO, @Body() dto: CreateSessionDto) {
    return this.sessionsService.createSession(user.userId, dto);
  }

  @Get()
  async getSessions(
    @GetUser() user: UserDTO,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('search') search?: string,
  ) {
    return this.sessionsService.getSessions(
      user.userId,
      limit ? parseInt(limit) : 20,
      cursor,
      search,
    );
  }

  @Get(':id')
  async getSession(@GetUser() user: UserDTO, @Param('id') id: string) {
    return this.sessionsService.getSession(user.userId, id);
  }

  @Get(':id/status')
  async getSessionStatus(@GetUser() user: UserDTO, @Param('id') id: string) {
    return this.sessionsService.getSessionStatus(user.userId, id);
  }

  @Post(':id/retry')
  @HttpCode(204)
  async retrySession(@GetUser() user: UserDTO, @Param('id') id: string) {
    await this.sessionsService.retrySession(user.userId, id);
  }

  @Delete(':id')
  async deleteSession(@GetUser() user: UserDTO, @Param('id') id: string) {
    await this.sessionsService.deleteSession(user.userId, id);
    return { message: 'Session deleted' };
  }
}
