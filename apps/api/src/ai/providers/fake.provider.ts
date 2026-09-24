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
    const prompt = req.messages.at(-1)?.content ?? '';
    // Honour an "exactly N weeks/steps" instruction so counts look realistic.
    const wanted = Number(/exactly (\d+) (?:weeks|steps)/i.exec(prompt)?.[1]) || 3;
    // Echo the references a prompt asks to be returned (report remarks use "S1 | …").
    const refs = [...prompt.matchAll(/^(S\d+) \|/gm)].map((m) => m[1]!);
    const data = sample(z.toJSONSchema(schema) as JsonSchema, '', { count: wanted, refs });
    return { text: '', model: this.modelFor(req.tier), inputTokens: 0, outputTokens: 0, data: data as T };
  }
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
  anyOf?: JsonSchema[];
}

interface Hints {
  count: number;
  refs: string[];
  index?: number;
}

function sample(s: JsonSchema, key: string, h: Hints): unknown {
  if (s.anyOf?.length) return sample(s.anyOf.find((x) => x.type !== 'null') ?? s.anyOf[0]!, key, h);
  if (s.enum?.length) return s.enum[0];
  switch (s.type) {
    case 'object':
      return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, sample(v, k, h)]));
    case 'array': {
      const length =
        key === 'weeks' || key === 'steps' ? h.count : key === 'options' ? 4 : key === 'remarks' && h.refs.length ? h.refs.length : 2;
      return Array.from({ length }, (_, i) => sample(s.items ?? { type: 'string' }, `${key} ${i + 1}`, { ...h, index: i }));
    }
    case 'integer':
    case 'number':
      return 1;
    case 'boolean':
      return false;
    default:
      if (key === 'studentRef' && h.refs.length) return h.refs[h.index ?? 0] ?? h.refs[0];
      return `Placeholder ${key || 'text'}`;
  }
}

function pause() {
  return new Promise((r) => setTimeout(r, 1200));
}
