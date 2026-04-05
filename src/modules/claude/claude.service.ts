import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';
import { LoggerService } from 'src/modules/logger/logger.service';
import { ProficiencyLevel } from 'src/enums/proficiency-level.enum';
import { QuestionType } from 'src/enums/question-type.enum';

export interface LearnerContext {
  nativeLanguage: string;
  targetLanguage: string;
  proficiencyLevel: ProficiencyLevel;
  customInstructions?: string | null;
}

export interface VocabResult {
  word: string;
  partOfSpeech: string;
  definition: { targetLang: string; nativeLang: string };
  examples: Array<{ sentence: string; translation: string }>;
}

export interface SummaryResult {
  summaryTargetLang: string;
  keyPhrases: Array<{ phrase: string; translation: string }>;
}

export interface HomeworkQuestionResult {
  questionType: QuestionType;
  questionText: string;
  expectedAnswer: string;
  orderIndex: number;
  options?: string[];
  correctAnswer?: string;
  videoHintUrl?: string | null;
}

export interface HomeworkResult {
  questions: HomeworkQuestionResult[];
}

export interface GradeAnswerResult {
  questionId: string;
  isCorrect: boolean;
  score: number;
  feedback: string;
  correctedText?: string | null;
}

export interface GradeResult {
  overallScore: number;
  overallFeedback: string;
  answers: GradeAnswerResult[];
}

@Injectable()
export class ClaudeService {
  private client: Anthropic;

  constructor(
    private readonly secretsService: AwsSecretsService,
    private readonly logger: LoggerService,
  ) {}

  private async getClient(): Promise<Anthropic> {
    if (!this.client) {
      const secrets = await this.secretsService.getSecret();
      this.client = new Anthropic({ apiKey: secrets.ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  private async callClaude(prompt: string): Promise<string> {
    const client = await this.getClient();
    const response = await client.messages.create({
      temperature: 0.7,
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });
    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type');
    return content.text;
  }

  // Maps a CEFR level to the level one step above (used to make content slightly challenging)
  private readonly cefrStepUp: Record<string, string> = {
    A1: 'A2', A2: 'B1', B1: 'B2', B2: 'C1', C1: 'C2', C2: 'C2',
  };

  // Human-readable difficulty guidance per CEFR level
  private readonly cefrGuidance: Record<string, string> = {
    A1: 'Use only very common, everyday words (top 500 words). Keep sentences short (under 8 words). Avoid idioms and complex grammar.',
    A2: 'Use common words and simple present/past tense. Keep sentences clear. Introduce a few useful phrases.',
    B1: 'Use intermediate vocabulary including some idiomatic expressions. Mix simple and compound sentences. Topics can be slightly abstract.',
    B2: 'Use a wide range of vocabulary including collocations and phrasal verbs. Use complex sentences and subordinate clauses. Topics can be nuanced.',
    C1: 'Use sophisticated vocabulary, advanced grammar structures, and idiomatic language naturally. Expect precise and nuanced answers.',
    C2: 'Use near-native vocabulary and grammar. Expect highly accurate, idiomatic, and nuanced responses.',
  };

  async extractVocab(subtitles: string, context: LearnerContext): Promise<VocabResult[]> {
    const targetLevel = this.cefrStepUp[context.proficiencyLevel] || context.proficiencyLevel;
    const guidance = this.cefrGuidance[context.proficiencyLevel];
    const customBlock = context.customInstructions
      ? `\nCustom instructions from the learner: ${context.customInstructions}\n`
      : '';
    const prompt = `You are a language learning assistant. Extract 5-10 vocabulary words from the following ${context.targetLanguage} transcript for a ${context.proficiencyLevel} level learner whose native language is ${context.nativeLanguage}.
${customBlock}
Difficulty target: Select words at the ${context.proficiencyLevel}–${targetLevel} level — words the learner has likely encountered but would benefit from reinforcing, plus a few words just at the edge of their comfort zone. ${guidance}

For each word, provide:
- word: the word as it appears
- partOfSpeech: noun/verb/adjective/etc
- definition: { targetLang: definition in ${context.targetLanguage}, nativeLang: definition in ${context.nativeLanguage} }
- examples: 2 example sentences [{ sentence: in ${context.targetLanguage}, translation: in ${context.nativeLanguage} }]

Transcript:
${subtitles.substring(0, 8000)}

Respond with ONLY a valid JSON array of vocab objects. No markdown, no explanation.`;

    const response = await this.callClaude(prompt);
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned) as VocabResult[];
  }

  async generateSummary(subtitles: string, context: LearnerContext): Promise<SummaryResult> {
    const targetLevel = this.cefrStepUp[context.proficiencyLevel] || context.proficiencyLevel;
    const guidance = this.cefrGuidance[targetLevel];
    const customBlock = context.customInstructions
      ? `\nCustom instructions from the learner: ${context.customInstructions}\n`
      : '';
    const prompt = `You are a language learning assistant. Create a reading summary for a ${context.proficiencyLevel} level learner of ${context.targetLanguage}.
${customBlock}
Write the summary slightly above their current level (targeting ${targetLevel}) to provide a productive challenge. ${guidance}

Transcript (${context.targetLanguage}):
${subtitles.substring(0, 8000)}

Provide:
- summaryTargetLang: A paragraph summary written in ${context.targetLanguage} at ${targetLevel} level. Use vocabulary and grammar that stretch the learner slightly beyond ${context.proficiencyLevel}.
- keyPhrases: 5-8 key phrases/expressions from the video that are at or just above ${context.proficiencyLevel} level [{ phrase: in ${context.targetLanguage}, translation: in ${context.nativeLanguage} }]

Respond with ONLY a valid JSON object. No markdown, no explanation.`;

    const response = await this.callClaude(prompt);
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned) as SummaryResult;
  }

  async generateHomework(subtitles: string, vocab: VocabResult[], context: LearnerContext, youtubeUrl: string): Promise<HomeworkResult> {
    const vocabWords = vocab.map(v => v.word).join(', ');
    const targetLevel = this.cefrStepUp[context.proficiencyLevel] || context.proficiencyLevel;
    const guidance = this.cefrGuidance[targetLevel];
    const customBlock = context.customInstructions
      ? `\nCustom instructions from the learner: ${context.customInstructions}\n`
      : '';
    const prompt = `You are a language learning teacher. Create 5 homework questions for a ${context.proficiencyLevel} level learner of ${context.targetLanguage} (native language: ${context.nativeLanguage}).
${customBlock}
Difficulty target: Questions should be at ${targetLevel} level — slightly above the learner's current ${context.proficiencyLevel} level to provide a productive challenge without being overwhelming. ${guidance}

Key vocabulary: ${vocabWords}

Transcript:
${subtitles.substring(0, 6000)}

Create exactly 5 questions, ALL written in ${context.targetLanguage}:
- 2 multiple choice questions (type: "multiple_choice") — 4 options each. Include "options" array and "correctAnswer" (exact text of correct option).
- 1 fill in the blank question (type: "fill_in_blank") using key vocabulary. Include "expectedAnswer".
- 1 comprehension question (type: "comprehension") about the content. Include "expectedAnswer".
- 1 free writing question (type: "free_writing") asking for a short opinion or reflection. Include "expectedAnswer" as an example answer.

For each question, include "videoHintUrl": a YouTube URL with a timestamp (e.g. "${youtubeUrl}&t=90") pointing to the part of the video most relevant to answering that question. Estimate the timestamp in seconds based on where the relevant content appears in the transcript. If you cannot determine a specific timestamp, use "${youtubeUrl}" without a timestamp.

Each question object: { questionType, questionText, expectedAnswer, orderIndex (0-4), options (MC only), correctAnswer (MC only), videoHintUrl }

Respond with ONLY a valid JSON object: { "questions": [...] }. No markdown, no explanation.`;

    const response = await this.callClaude(prompt);
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned) as HomeworkResult;
  }

  async generateSearchQueries(topic: string, targetLanguage: string): Promise<string[]> {
    const prompt = `Generate 3 YouTube search queries for the topic "${topic}" that a native ${targetLanguage} speaker would use. Return ONLY a JSON array of exactly 3 strings, no markdown.`;
    const response = await this.callClaude(prompt);
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned) as string[];
  }

  async gradeHomework(
    questions: Array<{ id: string; questionType: string; questionText: string; expectedAnswer: string }>,
    answers: Array<{ questionId: string; answerText: string }>,
    context: LearnerContext,
  ): Promise<GradeResult> {
    const questionsWithAnswers = questions.map(q => {
      const answer = answers.find(a => a.questionId === q.id);
      return {
        questionId: q.id,
        questionType: q.questionType,
        questionText: q.questionText,
        expectedAnswer: q.expectedAnswer,
        studentAnswer: answer?.answerText || '',
      };
    });

    const guidance = this.cefrGuidance[context.proficiencyLevel];
    const prompt = `You are a language learning teacher. Grade the following homework answers for a ${context.proficiencyLevel} level learner.

The learner's native language is ${context.nativeLanguage} and they are learning ${context.targetLanguage}.

Grading guidance for ${context.proficiencyLevel} level: ${guidance}
- Be encouraging and acknowledge what the learner got right before pointing out errors.
- For lower levels (A1/A2): Accept near-correct answers; focus feedback on the most important error only. Do not penalise minor spelling or accent issues.
- For mid levels (B1/B2): Expect reasonable accuracy; note grammar and vocabulary issues constructively.
- For higher levels (C1/C2): Apply stricter grading; point out nuance, register, and idiomatic accuracy.
- Feedback must be written in ${context.nativeLanguage} and be concise (2-3 sentences max).

Questions and Answers:
${JSON.stringify(questionsWithAnswers, null, 2)}

For each answer provide:
- questionId: same as input
- isCorrect: boolean (for comprehension/fill_in_blank; null for free_writing)
- score: 0-100
- feedback: constructive feedback in ${context.nativeLanguage}
- correctedText: for non-multiple-choice questions where the answer has errors, provide a corrected version of the student's answer in ${context.targetLanguage}. Set to null if the answer is already correct or is multiple choice.

Also provide:
- overallScore: 0-100 average
- overallFeedback: 2-3 sentence encouraging overall summary in ${context.nativeLanguage}

Respond with ONLY a valid JSON object: { "overallScore", "overallFeedback", "answers": [...] }. No markdown.`;

    const response = await this.callClaude(prompt);
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned) as GradeResult;
  }
}
