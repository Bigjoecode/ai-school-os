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

export interface AiProvider {
  readonly name: 'anthropic' | 'openai' | 'gemini';
  isConfigured(): boolean;
  modelFor(tier: AiTier): string;
  generate(req: AiRequest): Promise<AiResult>;
}

/** Raised for failures worth retrying on the next provider (outages, rate limits). */
export class ProviderUnavailableError extends Error {
  constructor(provider: string, cause: unknown) {
    super(`${provider} is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}
