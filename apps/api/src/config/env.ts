import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(24, 'JWT_SECRET must be at least 24 characters'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  RUN_MIGRATIONS_ON_BOOT: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  BOOTSTRAP_OWNER_EMAIL: z.email().optional(),
  BOOTSTRAP_OWNER_PASSWORD: z.string().min(12, 'Use at least 12 characters').optional(),
  BOOTSTRAP_OWNER_FIRST_NAME: z.string().default('Platform'),
  BOOTSTRAP_OWNER_LAST_NAME: z.string().default('Owner'),
  SEED_DEMO_ON_BOOT: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL_STANDARD: z.string().optional(),
  ANTHROPIC_MODEL_ADVANCED: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL_STANDARD: z.string().optional(),
  OPENAI_MODEL_ADVANCED: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL_STANDARD: z.string().optional(),
  GEMINI_MODEL_ADVANCED: z.string().optional(),
  AI_PROVIDER_ORDER: z.string().default('anthropic,openai,gemini'),
  AI_PRICES: z.string().optional(),
  AI_DEFAULT_MONTHLY_BUDGET_USD: z.coerce.number().min(0).default(25),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated environment. Fails fast at boot with a readable message. */
export function env(): Env {
  if (cached) return cached;
  // `KEY=` with nothing after it means "not set", not "set to empty".
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => env().NODE_ENV === 'production';
