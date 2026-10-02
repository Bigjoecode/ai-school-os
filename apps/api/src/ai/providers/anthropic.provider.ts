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
  type AiToolResult,
  type AiToolSpec,
  type ToolRunner,
} from './provider';

const MODELS: Record<AiTier, string> = {
  standard: 'claude-haiku-4-5',
  advanced: 'claude-opus-5-5',
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

  /**
   * Manual tool loop: send, run every tool_use block of the turn (in parallel),
   * return all results in one user message, repeat until the model answers.
   * The assistant turn is appended whole, so thinking blocks are preserved.
   */
  async generateWithTools(req: AiRequest, tools: AiToolSpec[], run: ToolRunner, maxSteps: number): Promise<AiToolResult> {
    const model = this.modelFor(req.tier);
    const defs: Anthropic.Beta.BetaTool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
    }));
    const messages: Anthropic.Beta.BetaMessageParam[] = this.messages(req);
    const total: AiToolResult = { text: '', model, inputTokens: 0, outputTokens: 0, steps: 0 };
    for (let step = 0; step < maxSteps; step++) {
      const lastStep = step === maxSteps - 1;
      const response = await this.call(() =>
        this.sdk().beta.messages.create({
          model,
          max_tokens: req.maxOutputTokens ?? 16000,
          system: req.system,
          messages,
          tools: defs,
          // On the last allowed request, answer with what has been gathered.
          ...(lastStep ? { tool_choice: { type: 'none' as const } } : {}),
          ...fallbacksFor(model),
        }),
      );
      total.steps++;
      total.model = response.model;
      total.inputTokens += response.usage.input_tokens;
      total.outputTokens += response.usage.output_tokens;
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (response.stop_reason === 'refusal') return { ...total, text: REFUSAL_TEXT };
      if (response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content });
        continue;
      }
      const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      // Only a clean tool_use stop runs tools: a call cut off at max_tokens may parse as a partial object.
      if (response.stop_reason !== 'tool_use' || !uses.length) {
        return { ...total, text };
      }
      messages.push({ role: 'assistant', content: response.content });
      const results = await Promise.all(
        uses.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          const r = await run(u.name, u.input);
          return { type: 'tool_result', tool_use_id: u.id, content: r.content, ...(r.isError ? { is_error: true } : {}) };
        }),
      );
      messages.push({ role: 'user', content: results });
    }
    return { ...total, text: total.text || "I couldn't finish looking that up. Please try asking more specifically." };
  }

  private sdk() {
    this.client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 2 });
    return this.client;
  }

  private messages(req: AiRequest): Anthropic.Beta.BetaMessageParam[] {
    return req.messages.map((m) =>
      m.images?.length
        ? {
            role: m.role,
            content: [
              ...m.images.map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.mediaType, data: i.data } })),
              { type: 'text' as const, text: m.content },
            ],
          }
        : { role: m.role, content: m.content },
    );
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
