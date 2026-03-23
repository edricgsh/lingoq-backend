import { Logger } from '@nestjs/common';

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 10,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  logger?: Logger,
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;
  let delay = config.initialDelayMs;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      if (logger && attempt > 1) {
        logger.log(`Retry attempt ${attempt}/${config.maxAttempts}...`);
      }
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === config.maxAttempts) {
        if (logger) {
          logger.error(
            `Failed after ${config.maxAttempts} attempts: ${lastError.message}`,
            lastError.stack,
          );
        }
        throw lastError;
      }

      if (logger) {
        logger.warn(
          `Attempt ${attempt} failed: ${lastError.message}. Retrying in ${delay}ms...`,
        );
      }

      await sleep(delay);
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
    }
  }

  throw lastError!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
