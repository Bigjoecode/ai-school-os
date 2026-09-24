import type { ZodType } from 'zod';

/**
 * The contract every AI vendor implements. The rest of the app talks to the
 * gateway, never to a vendor SDK, so providers can be added, swapped or
 * re-ordered without touching features.
 */
export type AiTier = 'standard' | 'advanced';

export interface AiTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiRequest {
  tier: AiTier;
  system: string;
  messages: AiTurn[];
  maxOutputTokens?: number;
}

export interface AiResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiJsonResult<T> extends AiResult {
  data: T;
}

export interface AiProvider {
  readonly name: 'anthropic' | 'openai' | 'gemini' | 'fake';
  isConfigured(): boolean;
  modelFor(tier: AiTier): string;
  generate(req: AiRequest): Promise<AiResult>;
  /**
   * Returns data matching `schema`. Providers use their native structured
   * output where they have one; the gateway validates every result against
   * the schema again before it is used.
   */
  generateJson<T>(req: AiRequest, schema: ZodType<T>): Promise<AiJsonResult<T>>;
}

/** Raised for failures worth retrying on the next provider (outages, rate limits). */
export class ProviderUnavailableError extends Error {
  constructor(provider: string, cause: unknown) {
    super(`${provider} is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

/** The model answered, but not with usable content (refusal, bad JSON). */
export class ProviderOutputError extends Error {}
