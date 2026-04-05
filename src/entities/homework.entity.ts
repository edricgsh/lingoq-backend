import { Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { ContentVersion } from './content-version.entity';
import { HomeworkQuestion } from './homework-question.entity';
import { HomeworkSubmission } from './homework-submission.entity';

@Entity({ name: 'homework', schema: 'lingoq' })
export class Homework extends BaseEntity {
  @Column({ name: 'content_version_id' })
  contentVersionId: string;

  @OneToOne(() => ContentVersion, (cv) => cv.homework, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'content_version_id' })
  contentVersion: ContentVersion;

  @OneToMany(() => HomeworkQuestion, (question) => question.homework, { cascade: true })
  questions: HomeworkQuestion[];

  @OneToMany(() => HomeworkSubmission, (submission) => submission.homework)
  submissions: HomeworkSubmission[];
}
