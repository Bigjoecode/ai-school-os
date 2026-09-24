import { env } from '../config/env';

/** USD per million tokens. Anthropic list prices; others come from AI_PRICES. */
const BUILT_IN: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

let overrides: Record<string, { input: number; output: number }> | undefined;

function table() {
  if (!overrides) {
    try {
      overrides = env().AI_PRICES ? JSON.parse(env().AI_PRICES!) : {};
    } catch {
      overrides = {};
    }
  }
  return { ...BUILT_IN, ...overrides };
}

/**
 * Cost of one call in USD. Unknown models cost 0 and are flagged, so usage is
 * still recorded but budgets can't see it — set AI_PRICES for those models.
 */
export function costUsd(model: string, inputTokens: number, outputTokens: number): { cost: number; known: boolean } {
  const prices = table();
  // Responses may name a dated snapshot of a configured model.
  const key = Object.keys(prices).find((k) => model === k || model.startsWith(`${k}-`));
  if (!key) return { cost: 0, known: false };
  const p = prices[key]!;
  return { cost: (inputTokens * p.input + outputTokens * p.output) / 1_000_000, known: true };
}
