import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { GetUser } from 'src/decorators/user.decorator';
import { UserDTO } from 'src/dtos/user.dto';
import { SessionsService, CreateSessionDto, RegenerateContentDto } from './sessions.service';

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
    return this.sessionsService.getSessions(user.userId, limit ? parseInt(limit) : 20, cursor, search);
  }

  @Get('by-video/:videoId')
  async getSessionByVideoId(@GetUser() user: UserDTO, @Param('videoId') videoId: string) {
    return this.sessionsService.findSessionByVideoId(user.userId, videoId);
  }

  @Get(':id')
  async getSession(@GetUser() user: UserDTO, @Param('id') id: string) {
    return this.sessionsService.getSession(user.userId, id);
  }

  @Get(':id/status')
  async getSessionStatus(@GetUser() user: UserDTO, @Param('id') id: string) {
    return this.sessionsService.getSessionStatus(user.userId, id);
  }

  @Get(':id/content-versions')
  async getContentVersions(@GetUser() user: UserDTO, @Param('id') id: string) {
    return this.sessionsService.getContentVersions(user.userId, id);
  }

  @Post(':id/retry')
  @HttpCode(204)
  async retrySession(@GetUser() user: UserDTO, @Param('id') id: string) {
    await this.sessionsService.retrySession(user.userId, id);
  }

  @Post(':id/regenerate')
  @HttpCode(202)
  async regenerateContent(@GetUser() user: UserDTO, @Param('id') id: string, @Body() dto: RegenerateContentDto) {
    return this.sessionsService.regenerateContent(user.userId, id, dto);
  }

  @Post(':id/content-versions/:versionId/activate')
  @HttpCode(204)
  async activateContentVersion(
    @GetUser() user: UserDTO,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    await this.sessionsService.activateContentVersion(user.userId, id, versionId);
  }

  @Post(':id/fetch-thumbnail')
  @HttpCode(204)
  async fetchThumbnail(@GetUser() user: UserDTO, @Param('id') id: string) {
    await this.sessionsService.fetchThumbnail(user.userId, id);
  }

  @Delete(':id')
  async deleteSession(@GetUser() user: UserDTO, @Param('id') id: string) {
    await this.sessionsService.deleteSession(user.userId, id);
    return { message: 'Session deleted' };
  }
}
