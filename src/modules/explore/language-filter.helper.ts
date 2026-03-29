import { detect } from 'tinyld';

/**
 * Maps LingoQ target language names (as stored in DB) to ISO 639-1 codes.
 * Add more entries as new languages are supported.
 */
const LANGUAGE_TO_ISO: Record<string, string> = {
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Italian: 'it',
  Portuguese: 'pt',
  Japanese: 'ja',
  Korean: 'ko',
  Chinese: 'zh',
  Arabic: 'ar',
  Hindi: 'hi',
  Russian: 'ru',
};

/**
 * Minimum character length before we attempt detection.
 * Short strings like "BBC" or "CNN" produce unreliable results.
 */
const MIN_TEXT_LENGTH = 6;

/**
 * Returns true if the video should be kept (language matches or detection is inconclusive).
 * Returns false only when we are confident the text is in a different language.
 *
 * Best-effort: any error causes the video to be kept (not filtered out).
 */
export function isTargetLanguageMatch(
  targetLanguage: string,
  title: string | null,
  channelName: string | null,
): boolean {
  try {
    const expectedIso = LANGUAGE_TO_ISO[targetLanguage];
    // If we don't know the ISO code for this language, keep the video.
    if (!expectedIso) return true;

    const texts = [title, channelName].filter(
      (t): t is string => typeof t === 'string' && t.trim().length >= MIN_TEXT_LENGTH,
    );

    // No usable text to check — keep the video.
    if (texts.length === 0) return true;

    for (const text of texts) {
      const detected = detect(text);
      // tinyld returns '' when it can't detect — treat as inconclusive, keep.
      if (!detected) continue;
      if (detected === expectedIso) return true;
    }

    // None of the texts matched — filter out.
    return false;
  } catch {
    // Never block on detection errors.
    return true;
  }
}
