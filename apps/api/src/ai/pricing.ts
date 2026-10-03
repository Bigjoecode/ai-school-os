import { aiSettings } from './ai-settings';

/**
 * Cost of one call in USD, from the console's price table (USD per million
 * tokens). Cached reads cost a tenth of input and Anthropic cache writes
 * 1.25× unless the table says otherwise. Unknown models cost 0 and are
 * flagged, so usage is still recorded: add their price in Platform → AI models.
 */
export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cache: { read?: number; write?: number } = {},
): { cost: number; known: boolean } {
  const prices = aiSettings().prices;
  // Responses may name a dated snapshot of a configured model ("gpt-5-2026-08-01"); prefer the longest match.
  const key = Object.keys(prices)
    .filter((k) => model === k || model.startsWith(`${k}-`))
    .sort((a, b) => b.length - a.length)[0];
  if (!key) return { cost: 0, known: false };
  const p = prices[key]!;
  const cachedIn = p.cachedInput ?? p.input * 0.1;
  const write = p.cacheWrite ?? p.input * 1.25;
  return {
    cost: (inputTokens * p.input + (cache.read ?? 0) * cachedIn + (cache.write ?? 0) * write + outputTokens * p.output) / 1_000_000,
    known: true,
  };
}
