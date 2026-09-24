import { GoogleGenAI } from '@google/genai';
import { z, type ZodType } from 'zod';
import { env } from '../../config/env';
import {
  ProviderOutputError,
  ProviderUnavailableError,
  type AiJsonResult,
  type AiProvider,
  type AiRequest,
  type AiResult,
  type AiTier,
} from './provider';

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;
  private client?: GoogleGenAI;

  isConfigured() {
    return Boolean(env().GEMINI_API_KEY && env().GEMINI_MODEL_STANDARD && env().GEMINI_MODEL_ADVANCED);
  }

  modelFor(tier: AiTier) {
    return (tier === 'advanced' ? env().GEMINI_MODEL_ADVANCED : env().GEMINI_MODEL_STANDARD) ?? '';
  }

  generate(req: AiRequest): Promise<AiResult> {
    return this.complete(req);
  }

  async generateJson<T>(req: AiRequest, schema: ZodType<T>): Promise<AiJsonResult<T>> {
    const result = await this.complete(req, z.toJSONSchema(schema));
    try {
      return { ...result, data: JSON.parse(result.text) as T };
    } catch {
      throw new ProviderOutputError('The AI returned invalid JSON');
    }
  }

  private async complete(req: AiRequest, jsonSchema?: unknown): Promise<AiResult> {
    this.client ??= new GoogleGenAI({ apiKey: env().GEMINI_API_KEY });
    const model = this.modelFor(req.tier);
    try {
      const response = await this.client.models.generateContent({
        model,
        contents: req.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        config: {
          systemInstruction: req.system,
          ...(jsonSchema ? { responseMimeType: 'application/json', responseJsonSchema: jsonSchema } : {}),
        },
      });
      return {
        text: response.text?.trim() ?? '',
        model,
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      };
    } catch (err) {
      // The Gemini SDK surfaces HTTP status on the error; retry the next
      // provider for rate limits, server errors and network failures.
      const status = (err as { status?: number }).status;
      if (status === undefined || status === 429 || status >= 500) {
        throw new ProviderUnavailableError(this.name, err);
      }
      throw err;
    }
  }
}
