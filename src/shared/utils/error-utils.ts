import { HttpStatus } from '@nestjs/common';

export enum ErrorCodeEnum {
  // General errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',

  // Auth errors
  EMAIL_NOT_IN_BETA_ACCESS_LIST = 'EMAIL_NOT_IN_BETA_ACCESS_LIST',

  // User errors
  USER_NOT_FOUND = 'USER_NOT_FOUND',

  // Session errors
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_ALREADY_PROCESSING = 'SESSION_ALREADY_PROCESSING',

  // Subtitle / video errors
  SUBTITLE_EXTRACTION_FAILED = 'SUBTITLE_EXTRACTION_FAILED',
  INVALID_YOUTUBE_URL = 'INVALID_YOUTUBE_URL',

  // Homework errors
  HOMEWORK_NOT_FOUND = 'HOMEWORK_NOT_FOUND',
  HOMEWORK_ALREADY_SUBMITTED = 'HOMEWORK_ALREADY_SUBMITTED',

  // Flashcard errors
  FLASHCARD_NOT_FOUND = 'FLASHCARD_NOT_FOUND',
  NO_FLASHCARDS_DUE = 'NO_FLASHCARDS_DUE',
}

export interface ErrorDetails {
  message: string;
  statusCode: HttpStatus;
}

export const ErrorCodeMap: Record<ErrorCodeEnum, ErrorDetails> = {
  [ErrorCodeEnum.UNKNOWN_ERROR]: {
    message: 'An unknown error occurred',
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  },
  [ErrorCodeEnum.INTERNAL_SERVER_ERROR]: {
    message: 'Internal server error',
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  },
  [ErrorCodeEnum.UNAUTHORIZED]: {
    message: 'Unauthorized access',
    statusCode: HttpStatus.UNAUTHORIZED,
  },
  [ErrorCodeEnum.FORBIDDEN]: {
    message: 'Access forbidden',
    statusCode: HttpStatus.FORBIDDEN,
  },
  [ErrorCodeEnum.NOT_FOUND]: {
    message: 'Resource not found',
    statusCode: HttpStatus.NOT_FOUND,
  },
  [ErrorCodeEnum.BAD_REQUEST]: {
    message: 'Bad request',
    statusCode: HttpStatus.BAD_REQUEST,
  },
  [ErrorCodeEnum.TOO_MANY_REQUESTS]: {
    message: 'Too many requests',
    statusCode: HttpStatus.TOO_MANY_REQUESTS,
  },
  [ErrorCodeEnum.EXTERNAL_API_ERROR]: {
    message: 'External API error',
    statusCode: HttpStatus.BAD_GATEWAY,
  },
  [ErrorCodeEnum.EMAIL_NOT_IN_BETA_ACCESS_LIST]: {
    message:
      'This app is currently in beta and only open to invited users. Please contact support to request access.',
    statusCode: HttpStatus.FORBIDDEN,
  },
  [ErrorCodeEnum.USER_NOT_FOUND]: {
    message: 'User not found',
    statusCode: HttpStatus.NOT_FOUND,
  },
  [ErrorCodeEnum.SESSION_NOT_FOUND]: {
    message: 'Session not found',
    statusCode: HttpStatus.NOT_FOUND,
  },
  [ErrorCodeEnum.SESSION_ALREADY_PROCESSING]: {
    message: 'Session is already being processed',
    statusCode: HttpStatus.CONFLICT,
  },
  [ErrorCodeEnum.SUBTITLE_EXTRACTION_FAILED]: {
    message: 'Failed to extract subtitles from the video',
    statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  },
  [ErrorCodeEnum.INVALID_YOUTUBE_URL]: {
    message: 'Invalid or unsupported YouTube URL',
    statusCode: HttpStatus.BAD_REQUEST,
  },
  [ErrorCodeEnum.HOMEWORK_NOT_FOUND]: {
    message: 'Homework not found',
    statusCode: HttpStatus.NOT_FOUND,
  },
  [ErrorCodeEnum.HOMEWORK_ALREADY_SUBMITTED]: {
    message: 'Homework has already been submitted',
    statusCode: HttpStatus.CONFLICT,
  },
  [ErrorCodeEnum.FLASHCARD_NOT_FOUND]: {
    message: 'Flashcard not found',
    statusCode: HttpStatus.NOT_FOUND,
  },
  [ErrorCodeEnum.NO_FLASHCARDS_DUE]: {
    message: 'No flashcards are due for review',
    statusCode: HttpStatus.NOT_FOUND,
  },
};

export class AppError extends Error {
  public readonly code: ErrorCodeEnum;
  public readonly statusCode: HttpStatus;
  public readonly details?: any;

  constructor(
    code: ErrorCodeEnum = ErrorCodeEnum.UNKNOWN_ERROR,
    message?: string,
    details?: any,
  ) {
    const errorDetails = ErrorCodeMap[code];
    super(message || errorDetails.message);

    this.code = code;
    this.statusCode = errorDetails.statusCode;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const handleError = (
  error: ErrorCodeEnum,
  message?: string,
  details?: any,
): never => {
  throw new AppError(error, message, details);
};

export const generateError = (
  error: ErrorCodeEnum,
  message?: string,
  details?: any,
): AppError => {
  return new AppError(error, message, details);
};
