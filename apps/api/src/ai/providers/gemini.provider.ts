import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env';
import { ProviderUnavailableError, type AiProvider, type AiRequest, type AiResult, type AiTier } from './provider';

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;
  private client?: GoogleGenAI;

  isConfigured() {
    return Boolean(env().GEMINI_API_KEY && env().GEMINI_MODEL_STANDARD && env().GEMINI_MODEL_ADVANCED);
  }

  modelFor(tier: AiTier) {
    return (tier === 'advanced' ? env().GEMINI_MODEL_ADVANCED : env().GEMINI_MODEL_STANDARD) ?? '';
  }

  async generate(req: AiRequest): Promise<AiResult> {
    this.client ??= new GoogleGenAI({ apiKey: env().GEMINI_API_KEY });
    const model = this.modelFor(req.tier);
    try {
      const response = await this.client.models.generateContent({
        model,
        contents: req.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        config: { systemInstruction: req.system },
      });
      return {
        text: response.text?.trim() ?? '',
        model,
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      };
    } catch (err) {
      // The Gemini SDK surfaces HTTP status on the error; retry the next
      // provider for rate limits and server errors.
      const status = (err as { status?: number }).status;
      if (status === 429 || (status !== undefined && status >= 500) || status === undefined) {
        throw new ProviderUnavailableError(this.name, err);
      }
      throw err;
    }
  }
}
