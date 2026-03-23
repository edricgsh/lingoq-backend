import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { VideoContent } from './video-content.entity';
import { HomeworkQuestion } from './homework-question.entity';
import { HomeworkSubmission } from './homework-submission.entity';

@Entity({ name: 'homework', schema: 'lingoq' })
export class Homework extends BaseEntity {
  @Column({ name: 'video_content_id' })
  videoContentId: string;

  @ManyToOne(() => VideoContent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_content_id' })
  videoContent: VideoContent;

  @OneToMany(() => HomeworkQuestion, (question) => question.homework, { cascade: true })
  questions: HomeworkQuestion[];

  @OneToMany(() => HomeworkSubmission, (submission) => submission.homework)
  submissions: HomeworkSubmission[];
}
