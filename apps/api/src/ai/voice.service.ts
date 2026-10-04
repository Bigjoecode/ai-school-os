import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import OpenAI, { toFile } from 'openai';
import { env } from '../config/env';
import { currentContext, RequestContextStore } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

/** Usage rows for voice; kept out of the student's daily fair-use count. */
export const VOICE_AGENTS = ['tutor-voice-in', 'tutor-voice-out'];

/** Longest text read aloud in one request (the client splits replies into parts). */
export const MAX_SPEAK_CHARS = 1500;

// Published list prices, used to estimate cost (audio responses carry no token usage).
const TTS_USD_PER_CHAR = 15 / 1_000_000;
const STT_USD_PER_MINUTE = 0.003;

/**
 * Voice for the AI tutor: speech to text (what the student says) and text
 * to speech (the tutor's reply), through OpenAI's audio models. Anthropic has
 * no audio API, so voice needs OPENAI_API_KEY; without it the app falls back
 * to the browser's own speech features.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private client?: OpenAI;

  constructor(private readonly prisma: PrismaService) {}

  /** Server voice works (an OpenAI key is set). */
  available(): boolean {
    return Boolean(env().OPENAI_API_KEY) && !env().AI_FAKE_PROVIDER;
  }

  private sdk() {
    if (!this.available()) throw new ServiceUnavailableException({ statusCode: 503, code: 'VOICE_UNAVAILABLE', message: 'Voice is not connected on the server' });
    this.client ??= new OpenAI({ apiKey: env().OPENAI_API_KEY, maxRetries: 1, timeout: 60_000 });
    return this.client;
  }

  async transcribe(audio: { buffer: Buffer; mimetype: string; originalname?: string }, hint?: string | null): Promise<string> {
    if (!audio?.buffer?.length) throw new BadRequestException('No recording was received');
    if (env().AI_FAKE_PROVIDER && !env().OPENAI_API_KEY) return 'Can you explain how to solve a quadratic equation?';
    const model = env().OPENAI_TRANSCRIBE_MODEL;
    const started = Date.now();
    const ext = /mp4|m4a|aac/.test(audio.mimetype) ? 'm4a' : /ogg/.test(audio.mimetype) ? 'ogg' : /wav/.test(audio.mimetype) ? 'wav' : /mpeg|mp3/.test(audio.mimetype) ? 'mp3' : 'webm';
    try {
      const file = await toFile(audio.buffer, `speech.${ext}`, { type: audio.mimetype || 'audio/webm' });
      const r = await this.sdk().audio.transcriptions.create({
        file,
        model,
        // Helps with subject words and Nigerian names; never treated as instructions.
        prompt: `A Nigerian secondary school student asking their tutor a question${hint ? ` about ${hint}` : ''}.`,
      });
      const usage = (r as { usage?: { type?: string; seconds?: number; input_tokens?: number; output_tokens?: number } }).usage;
      const cost =
        usage?.type === 'duration' && usage.seconds
          ? (usage.seconds / 60) * STT_USD_PER_MINUTE
          : ((usage?.input_tokens ?? 0) * 3 + (usage?.output_tokens ?? 0) * 5) / 1_000_000 || (audio.buffer.length / 16_000 / 60) * STT_USD_PER_MINUTE;
      await this.record('tutor-voice-in', model, cost, Date.now() - started, usage?.input_tokens ?? 0, usage?.output_tokens ?? 0);
      return r.text.trim();
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      await this.record('tutor-voice-in', model, 0, Date.now() - started, 0, 0, err);
      this.logger.warn(`Transcription failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Your voice could not be understood just now. Please try again or type your question.');
    }
  }

  /** The reply as MP3, in a warm, unhurried teacher's voice. */
  async speak(text: string): Promise<Buffer> {
    const input = speakable(text).slice(0, MAX_SPEAK_CHARS);
    if (!input) throw new BadRequestException('Nothing to read aloud');
    const model = env().OPENAI_TTS_MODEL;
    const started = Date.now();
    try {
      const r = await this.sdk().audio.speech.create({
        model,
        voice: env().OPENAI_TTS_VOICE,
        input,
        response_format: 'mp3',
        ...(model.startsWith('gpt-') ? { instructions: 'A warm, patient teacher talking with a secondary school student in Nigeria. Clear and unhurried, encouraging, natural pauses between steps.' } : {}),
      });
      const audio = Buffer.from(await r.arrayBuffer());
      await this.record('tutor-voice-out', model, input.length * TTS_USD_PER_CHAR, Date.now() - started, input.length, 0);
      return audio;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      await this.record('tutor-voice-out', model, 0, Date.now() - started, 0, 0, err);
      this.logger.warn(`Speech failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('The reply could not be read aloud just now');
    }
  }

  private async record(agent: string, model: string, costUsd: number, latencyMs: number, inputTokens: number, outputTokens: number, err?: unknown) {
    const ctx = RequestContextStore.get();
    await this.prisma.root.aiUsage
      .create({
        data: {
          tenantId: ctx?.tenantId ?? null,
          userId: currentContext().userId,
          studentId: ctx?.aiStudent?.studentId ?? null,
          aiTier: ctx?.aiStudent?.tier ?? null,
          agent,
          provider: 'openai',
          model,
          inputTokens,
          outputTokens,
          costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
          latencyMs,
          success: !err,
          error: err ? (err as Error).message?.slice(0, 500) : null,
        },
      })
      .catch(() => undefined);
  }
}

/**
 * Turns a markdown reply with maths into something that sounds right read
 * aloud: no symbols spoken as punctuation, simple notation said in words.
 */
export function speakable(text: string): string {
  return (
    text
      .replace(/```[\s\S]*?```/g, ' (the code is on your screen) ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\\\(|\\\)|\\\[|\\\]|\$\$?/g, '')
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1 over $2')
      .replace(/\\sqrt\{([^{}]+)\}/g, 'the square root of $1')
      .replace(/√\s*\(?([\w.]+)\)?/g, 'the square root of $1')
      .replace(/\\(times|cdot)/g, ' times ')
      .replace(/\\div/g, ' divided by ')
      .replace(/\\(le|leq)\b/g, ' is less than or equal to ')
      .replace(/\\(ge|geq)\b/g, ' is greater than or equal to ')
      .replace(/\\neq\b|≠/g, ' is not equal to ')
      .replace(/\\pi\b|π/g, ' pi ')
      .replace(/\^\{?2\}?|²/g, ' squared')
      .replace(/\^\{?3\}?|³/g, ' cubed')
      .replace(/\^\{([^{}]+)\}|\^(\w+)/g, (_m, a, b) => ` to the power ${a ?? b}`)
      .replace(/×/g, ' times ')
      .replace(/÷/g, ' divided by ')
      .replace(/≤/g, ' is less than or equal to ')
      .replace(/≥/g, ' is greater than or equal to ')
      .replace(/₦\s?([\d,]+)/g, '$1 naira')
      .replace(/(\w) - (\w)/g, '$1 minus $2')
      .replace(/(\w) \+ (\w)/g, '$1 plus $2')
      .replace(/(\w)\s*=\s*(\w)/g, '$1 equals $2')
      .replace(/\\[a-zA-Z]+/g, ' ')
      .replace(/[{}]/g, '')
      .replace(/^\s*\|?[-:| ]+\|?\s*$/gm, '')
      .replace(/\|/g, ', ')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*(\d+)\.\s+/gm, '$1. ')
      .replace(/[*_`~>]/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim()
  );
}
