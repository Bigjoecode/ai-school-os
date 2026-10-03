import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { ZodType } from 'zod';
import { z } from 'zod';
import { env } from '../../config/env';
import { aiSettings } from '../ai-settings';
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

const REFUSAL_TEXT = "I can't help with that request. Please rephrase it or ask about something else.";
const DEFAULT_MAX = 16000;
/** Room for a reasoning model's hidden thinking on top of the visible answer, so short caps don't come back empty. */
const REASONING_HEADROOM: Record<AiTier, number> = { standard: 2048, advanced: 8192 };

/** GPT-5 family and o-series models think before answering and take reasoning_effort. */
export const isReasoningModel = (model: string) => /^(gpt-5|o\d)/i.test(model);

/** Turns with pictures become multi-part user content (data URLs). */
function turns(req: AiRequest): OpenAI.Chat.ChatCompletionMessageParam[] {
  return req.messages.map((m) =>
    m.role === 'user' && m.images?.length
      ? { role: 'user' as const, content: [{ type: 'text' as const, text: m.content }, ...m.images.map((i) => ({ type: 'image_url' as const, image_url: { url: `data:${i.mediaType};base64,${i.data}` } }))] }
      : { role: m.role, content: m.content },
  );
}

/**
 * Strict structured outputs make optional fields nullable; drop those nulls
 * so the app's own schema (where they are optional) accepts the result.
 */
export function dropNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropNulls);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, dropNulls(x)]));
  return v;
}

function usageOf(c: OpenAI.Chat.ChatCompletion) {
  const prompt = c.usage?.prompt_tokens ?? 0;
  const cached = c.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  return { inputTokens: prompt - cached, cacheReadTokens: cached, outputTokens: c.usage?.completion_tokens ?? 0 };
}

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;
  private client?: OpenAI;

  isConfigured() {
    const m = aiSettings().models.openai;
    return Boolean(env().OPENAI_API_KEY && m.standard && m.advanced);
  }

  modelFor(tier: AiTier) {
    return aiSettings().models.openai[tier];
  }

  private sdk() {
    this.client ??= new OpenAI({ apiKey: env().OPENAI_API_KEY, maxRetries: 2 });
    return this.client;
  }

  /** Length cap and, for reasoning models, how hard to think. */
  private limits(req: AiRequest) {
    const model = this.modelFor(req.tier);
    const cap = req.maxOutputTokens ?? DEFAULT_MAX;
    if (!isReasoningModel(model)) return { model, params: { max_completion_tokens: cap } };
    const set = aiSettings().models.openai[req.tier === 'advanced' ? 'advancedEffort' : 'standardEffort'];
    const effort = set === 'auto' ? (req.tier === 'advanced' ? 'medium' : 'low') : set;
    return { model, params: { max_completion_tokens: cap + REASONING_HEADROOM[req.tier], reasoning_effort: effort as OpenAI.ReasoningEffort } };
  }

  async generate(req: AiRequest): Promise<AiResult> {
    const { model, params } = this.limits(req);
    const c = await this.call(() => this.sdk().chat.completions.create({ model, messages: [{ role: 'system', content: req.system }, ...turns(req)], ...params }));
    const choice = c.choices[0];
    if (choice?.message?.refusal) return { text: REFUSAL_TEXT, model: c.model, ...usageOf(c) };
    const text = choice?.message?.content?.trim() ?? '';
    if (!text && choice?.finish_reason === 'length') throw new ProviderOutputError('The AI ran out of room before answering; try a shorter request');
    return { text, model: c.model, ...usageOf(c) };
  }

  /**
   * Strict structured outputs from the app's own schema, so the answer
   * always has the right shape. Schemas the strict mode can't express fall
   * back to JSON mode with the schema in the prompt; either way the gateway
   * validates the result again before it is used.
   */
  async generateJson<T>(req: AiRequest, schema: ZodType<T>): Promise<AiJsonResult<T>> {
    const { model, params } = this.limits(req);
    let format: OpenAI.ResponseFormatJSONSchema | null = null;
    try {
      format = zodResponseFormat(schema as never, 'output') as unknown as OpenAI.ResponseFormatJSONSchema;
    } catch {
      format = null;
    }
    const send = (strict: boolean) =>
      this.call(() =>
        this.sdk().chat.completions.create({
          model,
          messages: [
            { role: 'system', content: strict ? req.system : `${req.system}\n\nRespond with a single JSON object that matches this JSON Schema exactly:\n${JSON.stringify(z.toJSONSchema(schema))}` },
            ...turns(req),
          ],
          response_format: strict ? { type: 'json_schema', json_schema: format!.json_schema } : { type: 'json_object' },
          ...params,
        }),
      );
    let c: OpenAI.Chat.ChatCompletion;
    try {
      c = await send(!!format);
    } catch (err) {
      // A model or schema that strict mode rejects: try plain JSON mode once.
      if (format && err instanceof OpenAI.BadRequestError && /schema|response_format|json/i.test(err.message)) c = await send(false);
      else throw err;
    }
    const choice = c.choices[0];
    if (choice?.message?.refusal) throw new ProviderOutputError('The AI declined this request');
    if (choice?.finish_reason === 'length') throw new ProviderOutputError('The AI response was cut off; try a shorter request');
    let data: unknown;
    try {
      data = JSON.parse(choice?.message?.content ?? '');
    } catch {
      throw new ProviderOutputError('The AI returned invalid JSON');
    }
    const direct = schema.safeParse(data);
    return { text: '', model: c.model, ...usageOf(c), data: (direct.success ? direct.data : dropNulls(data)) as T };
  }

  /** Function calling: run the requested functions and loop until the model answers. */
  async generateWithTools(req: AiRequest, tools: AiToolSpec[], run: ToolRunner, maxSteps: number): Promise<AiToolResult> {
    const { model, params } = this.limits(req);
    const defs: OpenAI.Chat.ChatCompletionTool[] = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: req.system }, ...turns(req)];
    const total: AiToolResult = { text: '', model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, steps: 0 };
    for (let step = 0; step < maxSteps; step++) {
      const c = await this.call(() => this.sdk().chat.completions.create({ model, messages, tools: defs, ...params, ...(step === maxSteps - 1 ? { tool_choice: 'none' as const } : {}) }));
      const u = usageOf(c);
      total.steps++;
      total.model = c.model;
      total.inputTokens += u.inputTokens;
      total.outputTokens += u.outputTokens;
      total.cacheReadTokens = (total.cacheReadTokens ?? 0) + u.cacheReadTokens;
      const choice = c.choices[0];
      const msg = choice?.message;
      if (msg?.refusal) return { ...total, text: REFUSAL_TEXT };
      const calls = (msg?.tool_calls ?? []).filter((x) => x.type === 'function');
      // Only a clean tool_calls stop runs tools: a call cut off by the length cap may have broken arguments.
      if (!msg || choice?.finish_reason !== 'tool_calls' || !calls.length) {
        const text = msg?.content?.trim() ?? '';
        if (!text && choice?.finish_reason === 'length') return { ...total, text: "I ran out of room answering that. Could you ask a narrower question?" };
        return { ...total, text };
      }
      messages.push(msg);
      const results = await Promise.all(
        calls.map(async (call) => {
          let input: unknown = {};
          try {
            input = JSON.parse(call.function.arguments || '{}');
          } catch {
            return { id: call.id, content: 'Error: the arguments were not valid JSON' };
          }
          const r = await run(call.function.name, input);
          return { id: call.id, content: r.isError ? `Error: ${r.content}` : r.content };
        }),
      );
      for (const r of results) messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
    }
    return { ...total, text: "I couldn't finish looking that up. Please try asking more specifically." };
  }

  /**
   * Outages and rate limits try the next provider; so do a wrong key or a
   * model name that doesn't exist, so one bad setting can't take AI down.
   */
  private async call<R>(fn: () => Promise<R>): Promise<R> {
    try {
      return await fn();
    } catch (err) {
      if (
        err instanceof OpenAI.RateLimitError ||
        err instanceof OpenAI.InternalServerError ||
        err instanceof OpenAI.APIConnectionError ||
        err instanceof OpenAI.AuthenticationError ||
        err instanceof OpenAI.PermissionDeniedError ||
        err instanceof OpenAI.NotFoundError
      ) {
        throw new ProviderUnavailableError(this.name, err);
      }
      throw err;
    }
  }
}
