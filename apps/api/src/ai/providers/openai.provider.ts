import OpenAI from 'openai';
import { env } from '../../config/env';
import { ProviderUnavailableError, type AiProvider, type AiRequest, type AiResult, type AiTier } from './provider';

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;
  private client?: OpenAI;

  isConfigured() {
    return Boolean(env().OPENAI_API_KEY && env().OPENAI_MODEL_STANDARD && env().OPENAI_MODEL_ADVANCED);
  }

  modelFor(tier: AiTier) {
    return (tier === 'advanced' ? env().OPENAI_MODEL_ADVANCED : env().OPENAI_MODEL_STANDARD) ?? '';
  }

  async generate(req: AiRequest): Promise<AiResult> {
    this.client ??= new OpenAI({ apiKey: env().OPENAI_API_KEY, maxRetries: 2 });
    const model = this.modelFor(req.tier);
    try {
      const completion = await this.client.chat.completions.create({
        model,
        messages: [{ role: 'system', content: req.system }, ...req.messages],
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
