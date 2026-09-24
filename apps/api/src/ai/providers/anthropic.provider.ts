import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { ZodType } from 'zod';
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

const MODELS: Record<AiTier, string> = {
  standard: 'claude-haiku-4-5',
  advanced: 'claude-opus-5',
};

const REFUSAL_TEXT = "I can't help with that request. Please rephrase it or ask about something else.";

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic' as const;
  private client?: Anthropic;

  isConfigured() {
    return Boolean(env().ANTHROPIC_API_KEY);
  }

  modelFor(tier: AiTier) {
    return tier === 'advanced'
      ? (env().ANTHROPIC_MODEL_ADVANCED ?? MODELS.advanced)
      : (env().ANTHROPIC_MODEL_STANDARD ?? MODELS.standard);
  }

  async generate(req: AiRequest): Promise<AiResult> {
    const model = this.modelFor(req.tier);
    const response = await this.call(() =>
      this.sdk().beta.messages.create({
        model,
        max_tokens: req.maxOutputTokens ?? 16000,
        system: req.system,
        messages: this.messages(req),
        ...fallbacksFor(model),
      }),
    );

    if (response.stop_reason === 'refusal') return { ...usage(response), text: REFUSAL_TEXT };
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { ...usage(response), text };
  }

  async generateJson<T>(req: AiRequest, schema: ZodType<T>): Promise<AiJsonResult<T>> {
    const model = this.modelFor(req.tier);
    const response = await this.call(() =>
      this.sdk().beta.messages.parse({
        model,
        max_tokens: req.maxOutputTokens ?? 16000,
        system: req.system,
        messages: this.messages(req),
        output_config: { format: betaZodOutputFormat(schema) },
        ...fallbacksFor(model),
      }),
    );

    if (response.stop_reason === 'refusal') throw new ProviderOutputError('The AI declined this request');
    if (response.stop_reason === 'max_tokens') throw new ProviderOutputError('The AI response was cut off; try a shorter request');
    if (response.parsed_output == null) throw new ProviderOutputError('The AI returned content in an unexpected shape');
    return { ...usage(response), text: '', data: response.parsed_output as T };
  }

  private sdk() {
    this.client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 2 });
    return this.client;
  }

  private messages(req: AiRequest): Anthropic.Beta.BetaMessageParam[] {
    return req.messages.map((m) => ({ role: m.role, content: m.content }));
  }

  private async call<R>(fn: () => Promise<R>): Promise<R> {
    try {
      return await fn();
    } catch (err) {
      if (
        err instanceof Anthropic.RateLimitError ||
        err instanceof Anthropic.InternalServerError ||
        err instanceof Anthropic.APIConnectionError
      ) {
        throw new ProviderUnavailableError(this.name, err);
      }
      throw err;
    }
  }
}

/**
 * Opus runs adaptive thinking by default. If a request is declined, the API
 * re-runs it on a suitable fallback model within the same call.
 */
function fallbacksFor(model: string) {
  return model.startsWith('claude-opus')
    ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
    : {};
}

function usage(response: Anthropic.Beta.BetaMessage): AiResult {
  return {
    text: '',
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
