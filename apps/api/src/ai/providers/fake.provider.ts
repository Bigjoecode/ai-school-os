import { z, type ZodType } from 'zod';
import { env } from '../../config/env';
import type { AiJsonResult, AiProvider, AiRequest, AiResult, AiTier } from './provider';

/**
 * Development-only stand-in for a real model (AI_FAKE_PROVIDER=true). It
 * returns obviously-placeholder text, and schema-valid JSON built by walking
 * the requested schema, so queues, validation, persistence and the UI can be
 * exercised without an API key or spend. Refused in production (see env.ts).
 */
export class FakeProvider implements AiProvider {
  readonly name = 'fake' as const;

  isConfigured() {
    return env().AI_FAKE_PROVIDER;
  }

  modelFor(tier: AiTier) {
    return `fake-${tier}`;
  }

  async generate(req: AiRequest): Promise<AiResult> {
    await pause();
    const last = req.messages.at(-1)?.content ?? '';
    return {
      text: `**[Development placeholder]** No AI provider is connected, so this is a stand-in reply to: “${last.slice(0, 200)}”.`,
      model: this.modelFor(req.tier),
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  async generateJson<T>(req: AiRequest, schema: ZodType<T>): Promise<AiJsonResult<T>> {
    await pause();
    // Honour an "exactly N weeks/steps" instruction so counts look realistic.
    const wanted = Number(/exactly (\d+) (?:weeks|steps)/i.exec(req.messages.at(-1)?.content ?? '')?.[1]) || 3;
    const data = sample(z.toJSONSchema(schema) as JsonSchema, '', wanted);
    return { text: '', model: this.modelFor(req.tier), inputTokens: 0, outputTokens: 0, data: data as T };
  }
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
}

function sample(s: JsonSchema, key: string, count: number): unknown {
  if (s.enum?.length) return s.enum[0];
  switch (s.type) {
    case 'object':
      return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, sample(v, k, count)]));
    case 'array':
      return Array.from({ length: key === 'weeks' || key === 'steps' ? count : 2 }, (_, i) =>
        sample(s.items ?? { type: 'string' }, `${key} ${i + 1}`, count),
      );
    case 'integer':
    case 'number':
      return 10;
    case 'boolean':
      return false;
    default:
      return `Placeholder ${key || 'text'}`;
  }
}

function pause() {
  return new Promise((r) => setTimeout(r, 1200));
}
