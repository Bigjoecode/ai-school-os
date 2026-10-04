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
  /** Show the demo accounts box on the login page (default: on when the demo school is loaded). Set false before real schools join. */
  SHOW_DEMO_ACCOUNTS: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : v === 'true' || v === '1')),
  /** Operator alerts: where to email problems, and the platform's own mail server (e.g. a cPanel mailbox). */
  ALERT_EMAIL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
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
  /** Development only: answer AI requests with schema-valid placeholders. */
  AI_FAKE_PROVIDER: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  AI_PRICES: z.string().optional(),
  AI_DEFAULT_MONTHLY_BUDGET_USD: z.coerce.number().min(0).default(25),
  /** Encrypts stored third-party secrets (e.g. each school's Paystack key). Long random string; never change it once set. */
  APP_ENCRYPTION_KEY: z.string().min(32, 'APP_ENCRYPTION_KEY must be at least 32 characters').optional(),
  PAYSTACK_BASE_URL: z.string().url().default('https://api.paystack.co'),
  TERMII_BASE_URL: z.string().url().default('https://api.ng.termii.com'),
  WHATSAPP_BASE_URL: z.string().url().default('https://graph.facebook.com/v21.0'),
  /** Web push (browser notifications). Generate once: `npx web-push generate-vapid-keys`. */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),
  /**
   * Google Meet: one OAuth client for the whole platform (Google Cloud console →
   * Credentials → OAuth client, web application). Each school then connects its
   * own Google Workspace account. Redirect URI: <site>/api/live/google/callback
   */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_AUTH_URL: z.string().url().default('https://accounts.google.com/o/oauth2/v2/auth'),
  GOOGLE_OAUTH_BASE: z.string().url().default('https://oauth2.googleapis.com'),
  GOOGLE_API_BASE: z.string().url().default('https://www.googleapis.com'),
  GOOGLE_MEET_BASE: z.string().url().default('https://meet.googleapis.com'),
  ZOOM_OAUTH_BASE: z.string().url().default('https://zoom.us'),
  ZOOM_API_BASE: z.string().url().default('https://api.zoom.us/v2'),
  /** Where uploaded files are kept (default: ./uploads in the app folder; the deploy never deletes it). */
  UPLOAD_DIR: z.string().optional(),
  UPLOAD_MAX_MB: z.coerce.number().min(1).max(50).default(10),
  /** Video and audio (assignments and projects). Larger files should be shared as links. */
  UPLOAD_MEDIA_MAX_MB: z.coerce.number().min(1).max(500).default(50),
  /** The platform's own Paystack secret key, for schools paying their subscription online. */
  PLATFORM_PAYSTACK_SECRET_KEY: z.string().optional(),
  /** Bank details printed on subscription invoices for transfers. Use 
 for new lines. */
  PLATFORM_BANK_DETAILS: z.string().optional(),
  /** For unit economics: AI is billed in dollars, revenue in naira. */
  NAIRA_PER_USD: z.coerce.number().min(1).default(1600),
  PLATFORM_INVOICE_DUE_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  /** The hostname schools point their own domains at (CNAME), e.g. ai-schoolportal.mejortechworld.com. */
  PLATFORM_DOMAIN_TARGET: z.string().optional(),
  /** Lets a cPanel cron job wake the API to send scheduled messages and automations. */
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters').optional(),
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
  if (parsed.data.AI_FAKE_PROVIDER && parsed.data.NODE_ENV === 'production') {
    throw new Error('Invalid environment:\n  AI_FAKE_PROVIDER: placeholder AI is for development only');
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => env().NODE_ENV === 'production';
