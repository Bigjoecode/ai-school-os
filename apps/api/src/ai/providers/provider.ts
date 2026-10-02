import type { ZodType } from 'zod';

/**
 * The contract every AI vendor implements. The rest of the app talks to the
 * gateway, never to a vendor SDK, so providers can be added, swapped or
 * re-ordered without touching features.
 */
export type AiTier = 'standard' | 'advanced';

/** A picture sent with a turn (a photo of a question), base64-encoded. */
export interface AiImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  data: string;
}

export interface AiTurn {
  role: 'user' | 'assistant';
  content: string;
  images?: AiImage[];
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

/** A function the model may call. `inputSchema` is a JSON Schema object. */
export interface AiToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Runs one tool call; errors come back to the model as an error result, not an exception. */
export type ToolRunner = (name: string, input: unknown) => Promise<{ content: string; isError?: boolean }>;

export interface AiToolResult extends AiResult {
  /** Model requests made, including the final answer. */
  steps: number;
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
  /**
   * Lets the model call tools until it answers (at most `maxSteps` requests).
   * Providers without tool use leave this out; the gateway then answers from
   * pre-fetched data instead.
   */
  generateWithTools?(req: AiRequest, tools: AiToolSpec[], run: ToolRunner, maxSteps: number): Promise<AiToolResult>;
}

/** Raised for failures worth retrying on the next provider (outages, rate limits). */
export class ProviderUnavailableError extends Error {
  constructor(provider: string, cause: unknown) {
    super(`${provider} is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

/** The model answered, but not with usable content (refusal, bad JSON). */
export class ProviderOutputError extends Error {}
