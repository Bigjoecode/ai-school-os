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
  type AiToolResult,
  type AiToolSpec,
  type ToolRunner,
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

  /** Function calling: run the requested functions and loop until the model answers. */
  async generateWithTools(req: AiRequest, tools: AiToolSpec[], run: ToolRunner, maxSteps: number): Promise<AiToolResult> {
    this.client ??= new OpenAI({ apiKey: env().OPENAI_API_KEY, maxRetries: 2 });
    const model = this.modelFor(req.tier);
    const defs: OpenAI.Chat.ChatCompletionTool[] = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: req.system }, ...req.messages];
    const total: AiToolResult = { text: '', model, inputTokens: 0, outputTokens: 0, steps: 0 };
    for (let step = 0; step < maxSteps; step++) {
      let completion: OpenAI.Chat.ChatCompletion;
      try {
        completion = await this.client.chat.completions.create({ model, messages, tools: defs, ...(step === maxSteps - 1 ? { tool_choice: 'none' as const } : {}) });
      } catch (err) {
        if (err instanceof OpenAI.RateLimitError || err instanceof OpenAI.InternalServerError || err instanceof OpenAI.APIConnectionError) {
          throw new ProviderUnavailableError(this.name, err);
        }
        throw err;
      }
      total.steps++;
      total.model = completion.model;
      total.inputTokens += completion.usage?.prompt_tokens ?? 0;
      total.outputTokens += completion.usage?.completion_tokens ?? 0;
      const msg = completion.choices[0]?.message;
      const calls = (msg?.tool_calls ?? []).filter((c) => c.type === 'function');
      if (!msg || completion.choices[0]?.finish_reason !== 'tool_calls' || !calls.length) {
        return { ...total, text: msg?.content?.trim() ?? '' };
      }
      messages.push(msg);
      const results = await Promise.all(
        calls.map(async (c) => {
          let input: unknown = {};
          try {
            input = JSON.parse(c.function.arguments || '{}');
          } catch {
            return { id: c.id, content: 'Error: the arguments were not valid JSON' };
          }
          const r = await run(c.function.name, input);
          return { id: c.id, content: r.isError ? `Error: ${r.content}` : r.content };
        }),
      );
      for (const r of results) messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
    }
    return { ...total, text: "I couldn't finish looking that up. Please try asking more specifically." };
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
