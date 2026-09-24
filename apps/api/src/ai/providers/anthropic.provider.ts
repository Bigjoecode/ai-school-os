import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { ProviderUnavailableError, type AiProvider, type AiRequest, type AiResult, type AiTier } from './provider';

const MODELS: Record<AiTier, string> = {
  standard: 'claude-haiku-4-5',
  advanced: 'claude-opus-5',
};

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
    this.client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 2 });
    const model = this.modelFor(req.tier);
    const messages: Anthropic.Beta.BetaMessageParam[] = req.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model,
        max_tokens: req.maxOutputTokens ?? 16000,
        system: req.system,
        messages,
        // Opus runs adaptive thinking by default. If a request is declined,
        // the API re-runs it on a suitable fallback model within this call.
        ...(model.startsWith('claude-opus')
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
      });
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

    if (response.stop_reason === 'refusal') {
      return {
        text: "I can't help with that request. Please rephrase it or ask about something else.",
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return {
      text,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}
