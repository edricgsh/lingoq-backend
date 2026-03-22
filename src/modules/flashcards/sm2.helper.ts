export interface Sm2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewAt: Date;
}

/**
 * SM-2 algorithm.
 * quality: 0=Again, 1=Hard, 2=Good, 3=Easy
 */
export function applySm2(
  quality: number,
  currentEaseFactor: number,
  currentInterval: number,
  currentRepetitions: number,
): Sm2Result {
  let repetitions = currentRepetitions;
  let interval = currentInterval;

  if (quality < 2) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * currentEaseFactor);
    }
    repetitions += 1;
  }

  const easeFactor = Math.max(
    1.3,
    currentEaseFactor + 0.1 - (3 - quality) * (0.08 + (3 - quality) * 0.02),
  );

  const nextReviewAt = new Date();
  nextReviewAt.setUTCHours(0, 0, 0, 0);
  nextReviewAt.setUTCDate(nextReviewAt.getUTCDate() + interval);

  return { easeFactor, interval, repetitions, nextReviewAt };
}
