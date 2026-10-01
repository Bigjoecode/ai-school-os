import { z, type ZodType } from 'zod';
import { env } from '../../config/env';
import type { AiJsonResult, AiProvider, AiRequest, AiResult, AiTier, AiToolResult, AiToolSpec, ToolRunner } from './provider';

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

  /**
   * Calls the tools whose names share a word with the question (or the first
   * tool), with sample arguments, then reports what came back — enough to
   * exercise the tool loop, permissions and the UI without a model.
   */
  async generateWithTools(req: AiRequest, tools: AiToolSpec[], run: ToolRunner): Promise<AiToolResult> {
    await pause();
    const question = (req.messages.at(-1)?.content ?? '').toLowerCase();
    const words = question.split(/[^a-z]+/).filter((w) => w.length > 3);
    // Tests can name exact calls: "call find_students {\"query\":\"Ada\"}".
    const raw = req.messages.at(-1)?.content ?? '';
    const explicit = [...raw.matchAll(/call (\w+) (\{.*?\})(?=\s+call |\s*$)/g)];
    if (explicit.length) {
      const lines: string[] = [];
      for (const m of explicit) {
        const r = tools.some((t) => t.name === m[1]) ? await run(m[1]!, JSON.parse(m[2]!)) : { content: 'not offered to this assistant', isError: true };
        lines.push(`- **${m[1]}**${r.isError ? ' (error)' : ''}: ${r.content.slice(0, 4000)}`);
      }
      return { text: `**[Development placeholder]** Tool results:\n${lines.join('\n')}`, model: this.modelFor(req.tier), inputTokens: 0, outputTokens: 0, steps: explicit.length + 1 };
    }
    const picked = tools.filter((t) => words.some((w) => t.name.includes(w.replace(/s$/, '')) || t.description.toLowerCase().includes(` ${w} `))).slice(0, 2);
    const chosen = picked.length ? picked : tools.slice(0, 1);
    const lines: string[] = [];
    for (const t of chosen) {
      const input = sample(t.inputSchema as JsonSchema, '', { count: 1, refs: [] });
      const r = await run(t.name, input);
      lines.push(`- **${t.name}**${r.isError ? ' (error)' : ''}: ${r.content.slice(0, 240)}`);
    }
    return {
      text: `**[Development placeholder]** No AI provider is connected. I called ${chosen.length} tool${chosen.length === 1 ? '' : 's'} for “${question.slice(0, 120)}”:\n${lines.join('\n')}`,
      model: this.modelFor(req.tier),
      inputTokens: 0,
      outputTokens: 0,
      steps: chosen.length + 1,
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
  type?: string | string[];
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
  if (Array.isArray(s.type)) return sample({ ...s, type: s.type.find((t) => t !== 'null') ?? 'null' }, key, h);
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
