import { Controller, Post, Body, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { Readable } from 'stream';

@Controller('tts')
@UseGuards(JwtAuthGuard)
export class TtsController {
  @Post('speak')
  async speak(
    @Body() body: { text: string; lang?: string },
    @Res() res: Response,
  ) {
    const lang = body.lang ?? 'es';
    const url =
      `https://translate.google.com/translate_tts` +
      `?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=tw-ob&q=${encodeURIComponent(body.text)}`;

    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!upstream.ok) {
      res.status(502).json({ message: 'TTS upstream failed' });
      return;
    }

    res.setHeader('Content-Type', 'audio/mpeg');

    const reader = upstream.body!.getReader();
    const nodeStream = new Readable({
      async read() {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
        } else {
          this.push(Buffer.from(value));
        }
      },
    });
    nodeStream.pipe(res);
  }
}
