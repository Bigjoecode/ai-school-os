import { AI_PROVIDERS, DEFAULT_AI_SETTINGS, aiSettingsSchema, type AiProviderName, type AiSettings } from '@aischool/shared';
import { env } from '../config/env';

/**
 * The live AI settings (console-edited, stored in platform_settings under
 * "ai"), held in memory so providers can read them synchronously. The
 * gateway refreshes them every 30 seconds and immediately after a save.
 * Environment variables still work and fill anything the console hasn't set.
 */
let current: AiSettings | null = null;

/** Settings from the environment alone (the starting point before anything is saved). */
export function envAiSettings(): AiSettings {
  const e = env();
  const d = DEFAULT_AI_SETTINGS;
  const order = e.AI_PROVIDER_ORDER.split(',')
    .map((s) => s.trim())
    .filter((s): s is AiProviderName => (AI_PROVIDERS as readonly string[]).includes(s));
  let envPrices: AiSettings['prices'] = {};
  try {
    const raw = e.AI_PRICES ? (JSON.parse(e.AI_PRICES) as Record<string, { input: number; output: number }>) : {};
    envPrices = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, { input: v.input, output: v.output, cachedInput: null, cacheWrite: null }]));
  } catch {
    // Invalid AI_PRICES: ignored, as before.
  }
  return {
    order: [...new Set([...order, ...AI_PROVIDERS])],
    models: {
      anthropic: { ...d.models.anthropic, standard: e.ANTHROPIC_MODEL_STANDARD ?? d.models.anthropic.standard, advanced: e.ANTHROPIC_MODEL_ADVANCED ?? d.models.anthropic.advanced },
      openai: { ...d.models.openai, standard: e.OPENAI_MODEL_STANDARD ?? d.models.openai.standard, advanced: e.OPENAI_MODEL_ADVANCED ?? d.models.openai.advanced },
      gemini: { ...d.models.gemini, standard: e.GEMINI_MODEL_STANDARD ?? d.models.gemini.standard, advanced: e.GEMINI_MODEL_ADVANCED ?? d.models.gemini.advanced },
    },
    prices: { ...d.prices, ...envPrices },
    promptCaching: d.promptCaching,
  };
}

/** Saved console settings layered over the environment ones. */
export function mergeAiSettings(saved: unknown): AiSettings {
  const base = envAiSettings();
  const parsed = aiSettingsSchema.partial().safeParse(saved ?? {});
  if (!parsed.success) return base;
  const s = parsed.data;
  return {
    order: s.order?.length ? [...new Set([...s.order, ...AI_PROVIDERS])] : base.order,
    models: {
      anthropic: { ...base.models.anthropic, ...(s.models?.anthropic ?? {}) },
      openai: { ...base.models.openai, ...(s.models?.openai ?? {}) },
      gemini: { ...base.models.gemini, ...(s.models?.gemini ?? {}) },
    },
    prices: { ...base.prices, ...(s.prices ?? {}) },
    promptCaching: s.promptCaching ?? base.promptCaching,
  };
}

export function setAiSettings(s: AiSettings) {
  current = s;
}

export function aiSettings(): AiSettings {
  return current ?? envAiSettings();
}
