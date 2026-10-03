import { z } from 'zod';

/**
 * Which AI models the platform uses, set from the console without a
 * redeploy. Features only ever ask for a tier ("standard" for everyday
 * answers, "advanced" for deep work); this maps tiers to each provider's
 * models and sets the order providers are tried in. API keys stay in the
 * server's environment and are never stored here.
 */
export const AI_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];
export const AI_PROVIDER_LABELS: Record<AiProviderName, string> = { anthropic: 'Anthropic (Claude)', openai: 'OpenAI', gemini: 'Google Gemini' };

export const REASONING_EFFORTS = ['auto', 'minimal', 'low', 'medium', 'high'] as const;
export type ReasoningEffortSetting = (typeof REASONING_EFFORTS)[number];

const model = z.string().trim().max(100);
const tierModels = z.object({
  standard: model,
  advanced: model,
  /** OpenAI reasoning models only: how much thinking each tier may do (auto = low for standard, medium for advanced). */
  standardEffort: z.enum(REASONING_EFFORTS).default('auto'),
  advancedEffort: z.enum(REASONING_EFFORTS).default('auto'),
});

export const priceSchema = z.object({
  /** USD per million tokens. */
  input: z.number().min(0).max(1000),
  output: z.number().min(0).max(1000),
  /** Cached input (reads); defaults to a tenth of input. */
  cachedInput: z.number().min(0).max(1000).nullish().transform((v) => v ?? null),
  /** Cache writes (Anthropic); defaults to 1.25 × input. */
  cacheWrite: z.number().min(0).max(1000).nullish().transform((v) => v ?? null),
});
export type ModelPrice = z.infer<typeof priceSchema>;

export const aiSettingsSchema = z.object({
  order: z.array(z.enum(AI_PROVIDERS)).min(1).max(3),
  models: z.object({ anthropic: tierModels, openai: tierModels, gemini: tierModels }),
  prices: z.record(z.string().trim().min(2).max(100), priceSchema),
  /** Reuse repeated instructions and conversation history at a fraction of the price. */
  promptCaching: z.boolean().default(true),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

/**
 * Defaults. Prices are list prices at the time of writing: check each
 * provider's pricing page and correct them in the console.
 */
export const DEFAULT_AI_SETTINGS: AiSettings = {
  order: ['anthropic', 'openai', 'gemini'],
  models: {
    anthropic: { standard: 'claude-haiku-4-5', advanced: 'claude-opus-5-5', standardEffort: 'auto', advancedEffort: 'auto' },
    openai: { standard: 'gpt-5.4-mini', advanced: 'gpt-5', standardEffort: 'auto', advancedEffort: 'auto' },
    gemini: { standard: '', advanced: '', standardEffort: 'auto', advancedEffort: 'auto' },
  },
  prices: {
    'claude-haiku-4-5': { input: 1, output: 5, cachedInput: 0.1, cacheWrite: 1.25 },
    'claude-sonnet-5': { input: 2, output: 10, cachedInput: 0.2, cacheWrite: 2.5 },
    'claude-opus-5-5': { input: 4, output: 20, cachedInput: 0.2, cacheWrite: 5 },
    'claude-opus-5': { input: 5, output: 25, cachedInput: 0.5, cacheWrite: 6.25 },
    'gpt-5.4-nano': { input: 0.2, output: 1.25, cachedInput: 0.02, cacheWrite: null },
    'gpt-5.4-mini': { input: 0.75, output: 4.5, cachedInput: 0.075, cacheWrite: null },
    'gpt-5': { input: 1.25, output: 10, cachedInput: 0.125, cacheWrite: null },
  },
  promptCaching: true,
};

export interface AiProviderStatus {
  provider: AiProviderName;
  label: string;
  /** The API key is set in the server environment. */
  keySet: boolean;
  /** Key and both models are set, so the gateway will use it. */
  ready: boolean;
  models: { standard: string; advanced: string };
  /** 30-day traffic through this provider. */
  calls30d: number;
  failures30d: number;
  costUsd30d: number;
}
export interface AiSettingsView {
  settings: AiSettings;
  providers: AiProviderStatus[];
  /** Models seen in usage without a price (their cost counts as 0). */
  unpricedModels: string[];
}
export const aiTestSchema = z.object({ provider: z.enum(AI_PROVIDERS), tier: z.enum(['standard', 'advanced']) });
export interface AiTestResult {
  ok: boolean;
  provider: AiProviderName;
  model: string;
  reply: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  structuredOk: boolean | null;
  error: string | null;
}
