import OpenAI from 'openai';
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

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;
  private client?: OpenAI;

  isConfigured() {
    return Boolean(env().OPENAI_API_KEY && env().OPENAI_MODEL_STANDARD && env().OPENAI_MODEL_ADVANCED);
  }

  modelFor(tier: AiTier) {
    return (tier === 'advanced' ? env().OPENAI_MODEL_ADVANCED : env().OPENAI_MODEL_STANDARD) ?? '';
  }

  generate(req: AiRequest): Promise<AiResult> {
    return this.complete(req, req.system);
  }

  /** JSON mode, with the JSON Schema spelled out in the system prompt. */
  async generateJson<T>(req: AiRequest, schema: ZodType<T>): Promise<AiJsonResult<T>> {
    const system = `${req.system}\n\nRespond with a single JSON object that matches this JSON Schema exactly:\n${JSON.stringify(z.toJSONSchema(schema))}`;
    const result = await this.complete(req, system, true);
    try {
      return { ...result, data: JSON.parse(result.text) as T };
    } catch {
      throw new ProviderOutputError('The AI returned invalid JSON');
    }
  }

  private async complete(req: AiRequest, system: string, json = false): Promise<AiResult> {
    this.client ??= new OpenAI({ apiKey: env().OPENAI_API_KEY, maxRetries: 2 });
    try {
      const completion = await this.client.chat.completions.create({
        model: this.modelFor(req.tier),
        messages: [{ role: 'system', content: system }, ...req.messages],
        ...(json ? { response_format: { type: 'json_object' as const } } : {}),
      });
      return {
        text: completion.choices[0]?.message?.content?.trim() ?? '',
        model: completion.model,
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      };
    } catch (err) {
      if (
        err instanceof OpenAI.RateLimitError ||
        err instanceof OpenAI.InternalServerError ||
        err instanceof OpenAI.APIConnectionError
      ) {
        throw new ProviderUnavailableError(this.name, err);
      }
      throw err;
    }
  }
}
