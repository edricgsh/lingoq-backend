import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { GetUser } from 'src/decorators/user.decorator';
import { UserDTO } from 'src/dtos/user.dto';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';

@Controller('sessions/:sessionId/notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  async getNotes(@GetUser() user: UserDTO, @Param('sessionId') sessionId: string) {
    return this.notesService.getNotes(user.userId, sessionId);
  }

  @Post()
  async createNote(
    @GetUser() user: UserDTO,
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateNoteDto,
  ) {
    return this.notesService.createNote(user.userId, sessionId, dto);
  }

  @Patch(':noteId')
  async updateNote(
    @GetUser() user: UserDTO,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notesService.updateNote(user.userId, noteId, dto);
  }

  @Delete(':noteId')
  async deleteNote(@GetUser() user: UserDTO, @Param('noteId') noteId: string) {
    await this.notesService.deleteNote(user.userId, noteId);
  }
}
