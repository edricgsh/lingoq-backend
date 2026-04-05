import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionNote } from 'src/entities/session-note.entity';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [TypeOrmModule.forFeature([SessionNote])],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
