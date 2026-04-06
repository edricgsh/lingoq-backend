import { Controller, Post, Body, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { LoggerService } from 'src/modules/logger/logger.service';
import { Readable } from 'stream';

const TTS_CHUNK_SIZE = 3;
const TTS_CHUNK_DELAY_MS = 300;

async function fetchTtsAudio(
  text: string,
  lang: string,
  logger: LoggerService,
): Promise<Buffer | null> {
  const url =
    `https://translate.google.com/translate_tts` +
    `?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=tw-ob&q=${encodeURIComponent(text)}`;

  logger.log(`[TTS] fetching audio — lang=${lang} text="${text.slice(0, 60)}"`);

  const upstream = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });

  if (!upstream.ok) {
    logger.warn(
      `[TTS] upstream failed — lang=${lang} status=${upstream.status} text="${text.slice(0, 60)}"`,
    );
    return null;
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  logger.log(`[TTS] audio fetched — lang=${lang} bytes=${buf.byteLength} text="${text.slice(0, 60)}"`);
  return buf;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Controller('tts')
@UseGuards(JwtAuthGuard)
export class TtsController {
  constructor(private readonly logger: LoggerService) {}

  @Post('speak')
  async speak(
    @Body() body: { text: string; lang?: string },
    @Res() res: Response,
  ) {
    const lang = body.lang ?? 'es';
    this.logger.log(`[TTS] /speak — lang=${lang} text="${(body.text ?? '').slice(0, 60)}"`);
    const buf = await fetchTtsAudio(body.text, lang, this.logger);
    if (!buf) {
      res.status(502).json({ message: 'TTS upstream failed' });
      return;
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    const nodeStream = new Readable({ read() {} });
    nodeStream.push(buf);
    nodeStream.push(null);
    nodeStream.pipe(res);
  }

  /**
   * Batch TTS: accepts up to 50 words, fetches audio in sequential chunks
   * to avoid overloading Google TTS, and returns a map of word → base64 audio.
   */
  @Post('speak-batch')
  async speakBatch(
    @Body() body: { words: string[]; lang?: string },
  ): Promise<Record<string, string>> {
    const lang = body.lang ?? 'es';
    const words = (body.words ?? []).slice(0, 50);
    this.logger.log(`[TTS] /speak-batch — lang=${lang} count=${words.length}`);
    const result: Record<string, string> = {};
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < words.length; i += TTS_CHUNK_SIZE) {
      const chunk = words.slice(i, i + TTS_CHUNK_SIZE);
      await Promise.allSettled(
        chunk.map(async (word) => {
          const buf = await fetchTtsAudio(word, lang, this.logger);
          if (buf) {
            result[word] = buf.toString('base64');
            successCount++;
          } else {
            failCount++;
          }
        }),
      );
      if (i + TTS_CHUNK_SIZE < words.length) {
        await sleep(TTS_CHUNK_DELAY_MS);
      }
    }

    this.logger.log(
      `[TTS] /speak-batch done — lang=${lang} success=${successCount} fail=${failCount}`,
    );
    return result;
  }
}
