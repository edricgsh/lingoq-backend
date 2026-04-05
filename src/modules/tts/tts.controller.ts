import { Controller, Post, Body, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { Readable } from 'stream';

const TTS_CHUNK_SIZE = 3;
const TTS_CHUNK_DELAY_MS = 300;

async function fetchTtsAudio(text: string, lang: string): Promise<Buffer | null> {
  const url =
    `https://translate.google.com/translate_tts` +
    `?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=tw-ob&q=${encodeURIComponent(text)}`;

  const upstream = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!upstream.ok) return null;
  return Buffer.from(await upstream.arrayBuffer());
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Controller('tts')
@UseGuards(JwtAuthGuard)
export class TtsController {
  @Post('speak')
  async speak(
    @Body() body: { text: string; lang?: string },
    @Res() res: Response,
  ) {
    const lang = body.lang ?? 'es';
    const buf = await fetchTtsAudio(body.text, lang);
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
    const result: Record<string, string> = {};

    for (let i = 0; i < words.length; i += TTS_CHUNK_SIZE) {
      const chunk = words.slice(i, i + TTS_CHUNK_SIZE);
      await Promise.allSettled(
        chunk.map(async (word) => {
          const buf = await fetchTtsAudio(word, lang);
          if (buf) result[word] = buf.toString('base64');
        }),
      );
      if (i + TTS_CHUNK_SIZE < words.length) {
        await sleep(TTS_CHUNK_DELAY_MS);
      }
    }

    return result;
  }
}
