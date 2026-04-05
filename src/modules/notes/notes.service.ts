import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionNote } from 'src/entities/session-note.entity';
import { LoggerService } from 'src/modules/logger/logger.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(SessionNote)
    private readonly noteRepo: Repository<SessionNote>,
    private readonly logger: LoggerService,
  ) {}

  async getNotes(userId: string, sessionId: string): Promise<SessionNote[]> {
    return this.noteRepo.find({
      where: { userId, sessionId },
      order: { createdAt: 'DESC' },
    });
  }

  async createNote(userId: string, sessionId: string, dto: CreateNoteDto): Promise<SessionNote> {
    const note = this.noteRepo.create({
      id: uuidv4(),
      userId,
      sessionId,
      title: dto.title?.trim() || null,
      content: dto.content,
    });
    const saved = await this.noteRepo.save(note);
    this.logger.log(`Note created: user=${userId} session=${sessionId} note=${saved.id}`, 'NotesService');
    return saved;
  }

  async updateNote(userId: string, noteId: string, dto: UpdateNoteDto): Promise<SessionNote> {
    const note = await this.noteRepo.findOne({ where: { id: noteId, userId } });
    if (!note) throw new NotFoundException('Note not found');
    note.title = dto.title?.trim() || null;
    note.content = dto.content;
    return this.noteRepo.save(note);
  }

  async deleteNote(userId: string, noteId: string): Promise<void> {
    const note = await this.noteRepo.findOne({ where: { id: noteId, userId } });
    if (!note) throw new NotFoundException('Note not found');
    await this.noteRepo.remove(note);
    this.logger.log(`Note deleted: user=${userId} note=${noteId}`, 'NotesService');
  }
}
