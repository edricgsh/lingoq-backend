import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Homework } from 'src/entities/homework.entity';
import { HomeworkSubmission } from 'src/entities/homework-submission.entity';
import { HomeworkAnswer } from 'src/entities/homework-answer.entity';
import { HomeworkQuestion } from 'src/entities/homework-question.entity';
import { LearningSession } from 'src/entities/learning-session.entity';
import { ClaudeService } from 'src/modules/claude/claude.service';
import { OnboardingService } from 'src/modules/onboarding/onboarding.service';
import { QuestionType } from 'src/enums/question-type.enum';
import { v4 as uuidv4 } from 'uuid';

export interface SubmitQuestionDto {
  answerText: string;
}

@Injectable()
export class HomeworkService {
  constructor(
    @InjectRepository(Homework)
    private readonly homeworkRepository: Repository<Homework>,
    @InjectRepository(HomeworkSubmission)
    private readonly submissionRepository: Repository<HomeworkSubmission>,
    @InjectRepository(HomeworkAnswer)
    private readonly answerRepository: Repository<HomeworkAnswer>,
    @InjectRepository(HomeworkQuestion)
    private readonly questionRepository: Repository<HomeworkQuestion>,
    @InjectRepository(LearningSession)
    private readonly sessionRepository: Repository<LearningSession>,
    private readonly claudeService: ClaudeService,
    private readonly onboardingService: OnboardingService,
  ) {}

  private async resolveSessionAndHomework(sessionId: string, userId: string): Promise<{ session: LearningSession; homework: Homework }> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Session not found');

    const homework = await this.homeworkRepository.findOne({
      where: { videoContentId: session.videoContentId },
      relations: ['questions'],
      order: { createdAt: 'DESC' } as any,
    });
    if (!homework) throw new NotFoundException('Homework not found');

    return { session, homework };
  }

  async getHomework(sessionId: string, userId: string): Promise<Homework> {
    const { homework } = await this.resolveSessionAndHomework(sessionId, userId);
    return homework;
  }

  async submitQuestion(
    sessionId: string,
    userId: string,
    questionId: string,
    dto: SubmitQuestionDto,
  ): Promise<HomeworkSubmission> {
    const { session, homework } = await this.resolveSessionAndHomework(sessionId, userId);

    const question = await this.questionRepository.findOne({ where: { id: questionId, homeworkId: homework.id } });
    if (!question) throw new NotFoundException('Question not found');

    const onboarding = await this.onboardingService.getOnboarding(userId);

    let score: number;
    let isCorrect: boolean | null = null;
    let feedback = '';
    let correctedText: string | null = null;

    if (question.questionType === QuestionType.MULTIPLE_CHOICE) {
      isCorrect = dto.answerText === question.correctAnswer;
      score = isCorrect ? 100 : 0;
    } else {
      const gradeResult = await this.claudeService.gradeHomework(
        [{ id: question.id, questionType: question.questionType, questionText: question.questionText, expectedAnswer: question.expectedAnswer }],
        [{ questionId: question.id, answerText: dto.answerText }],
        {
          nativeLanguage: onboarding.nativeLanguage,
          targetLanguage: onboarding.targetLanguage,
          proficiencyLevel: onboarding.proficiencyLevel,
        },
      );
      const gradedAnswer = gradeResult.answers[0];
      score = gradedAnswer?.score ?? 0;
      isCorrect = gradedAnswer?.isCorrect ?? null;
      feedback = gradedAnswer?.feedback ?? '';
      correctedText = gradedAnswer?.correctedText ?? null;
    }

    const submission = this.submissionRepository.create({
      id: uuidv4(),
      homeworkId: homework.id,
      questionId,
      userId,
      userSessionId: session.id,
      score,
      overallFeedback: feedback,
      submittedAt: new Date(),
    });
    await this.submissionRepository.save(submission);

    const answer = this.answerRepository.create({
      id: uuidv4(),
      submissionId: submission.id,
      questionId,
      answerText: dto.answerText,
      isCorrect,
      score,
      feedback,
      correctedText,
    });
    await this.answerRepository.save(answer);

    return this.submissionRepository.findOne({
      where: { id: submission.id },
      relations: ['answers'],
    });
  }

  async getQuestionSubmissions(sessionId: string, userId: string, questionId: string): Promise<HomeworkSubmission[]> {
    const { homework } = await this.resolveSessionAndHomework(sessionId, userId);

    return this.submissionRepository.find({
      where: { homeworkId: homework.id, questionId, userSessionId: sessionId },
      relations: ['answers'],
      order: { submittedAt: 'DESC' },
    });
  }
}
