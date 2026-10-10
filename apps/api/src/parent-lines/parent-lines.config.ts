import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DEFAULT_PARENT_LINE_SETTINGS, type ParentLineSettings } from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { decryptSecret, encryptSecret } from '../common/crypto-box';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Where the parent SMS/USSD line keeps its settings:
 *  - the platform's shared line (one USSD code and short code for every
 *    school) in platform_settings under "parent_lines";
 *  - each school's choices, and optionally its own Africa's Talking account
 *    and codes, in tenant_integrations under provider "parent_line".
 * API keys and webhook secrets are encrypted at rest (crypto-box). Webhook
 * secrets are also stored as a SHA-256 hash so an incoming callback can be
 * matched without decrypting every row.
 */

export const PLATFORM_KEY = 'parent_lines';
export const SCHOOL_PROVIDER = 'parent_line';

export interface PlatformLineConfig {
  enabled: boolean;
  provider: 'africastalking';
  username: string;
  apiKeyEncrypted: string | null;
  apiKeyHint: string | null;
  ussdCode: string | null;
  shortCode: string | null;
  sandbox: boolean;
  brandName: string;
  secretEncrypted: string | null;
  secretHash: string | null;
}

export const DEFAULT_PLATFORM_LINE: PlatformLineConfig = {
  enabled: false,
  provider: 'africastalking',
  username: '',
  apiKeyEncrypted: null,
  apiKeyHint: null,
  ussdCode: null,
  shortCode: null,
  sandbox: true,
  brandName: 'AI School OS',
  secretEncrypted: null,
  secretHash: null,
};

export interface SchoolLineOverride {
  username: string;
  apiKeyHint: string;
  ussdCode: string | null;
  shortCode: string | null;
  sandbox: boolean;
  secretEncrypted: string;
  secretHash: string;
}

export interface SchoolLineConfig {
  settings: ParentLineSettings;
  override: SchoolLineOverride | null;
}

/** An outbound SMS account: Africa's Talking credentials, decrypted. */
export interface AtAccount {
  username: string;
  apiKey: string;
  from: string | null;
  sandbox: boolean;
}

export const hashSecret = (s: string) => createHash('sha256').update(s).digest('hex');
export const newSecret = () => randomBytes(24).toString('base64url');

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function loadPlatformLine(prisma: PrismaService): Promise<PlatformLineConfig> {
  const row = await prisma.root.platformSetting.findUnique({ where: { key: PLATFORM_KEY } });
  return { ...DEFAULT_PLATFORM_LINE, ...((row?.value as Partial<PlatformLineConfig> | null) ?? {}) };
}

export async function savePlatformLine(prisma: PrismaService, value: PlatformLineConfig, userId: string | null) {
  await prisma.root.platformSetting.upsert({
    where: { key: PLATFORM_KEY },
    update: { value: value as unknown as Prisma.InputJsonValue, updatedBy: userId },
    create: { key: PLATFORM_KEY, value: value as unknown as Prisma.InputJsonValue, updatedBy: userId },
  });
}

export async function loadSchoolLine(prisma: PrismaService, tenantId: string): Promise<SchoolLineConfig> {
  const row = await prisma.root.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId, provider: SCHOOL_PROVIDER } }, select: { config: true } });
  return parseSchoolLine(row?.config);
}

export function parseSchoolLine(config: unknown): SchoolLineConfig {
  const c = (config as Partial<SchoolLineConfig> | null) ?? {};
  return { settings: { ...DEFAULT_PARENT_LINE_SETTINGS, ...(c.settings ?? {}) }, override: c.override ?? null };
}

/** Saves a school's line settings; apiKey (when given) replaces the stored secret. */
export async function saveSchoolLine(prisma: PrismaService, tenantId: string, config: SchoolLineConfig, apiKey?: string | null) {
  const existing = await prisma.root.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId, provider: SCHOOL_PROVIDER } }, select: { id: true } });
  const secret =
    apiKey !== undefined
      ? { secretEncrypted: encryptSecret(apiKey ?? '-'), secretHint: apiKey ? apiKey.slice(-4) : '' }
      : existing
        ? {}
        : { secretEncrypted: encryptSecret('-'), secretHint: '' };
  const data = { config: config as unknown as Prisma.InputJsonValue, isLive: !!config.override, ...secret };
  await prisma.root.tenantIntegration.upsert({
    where: { tenantId_provider: { tenantId, provider: SCHOOL_PROVIDER } },
    update: data,
    create: { tenantId, provider: SCHOOL_PROVIDER, secretEncrypted: encryptSecret('-'), secretHint: '', ...data },
  });
}

/** The school's own Africa's Talking account, decrypted, or null. */
export async function schoolAtAccount(prisma: PrismaService, tenantId: string): Promise<AtAccount | null> {
  const row = await prisma.root.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId, provider: SCHOOL_PROVIDER } }, select: { config: true, secretEncrypted: true } });
  const o = parseSchoolLine(row?.config).override;
  if (!row || !o) return null;
  try {
    return { username: o.username, apiKey: decryptSecret(row.secretEncrypted), from: o.shortCode, sandbox: o.sandbox };
  } catch {
    return null;
  }
}

export function platformAtAccount(p: PlatformLineConfig): AtAccount | null {
  if (!p.enabled || !p.username || !p.apiKeyEncrypted) return null;
  try {
    return { username: p.username, apiKey: decryptSecret(p.apiKeyEncrypted), from: p.shortCode, sandbox: p.sandbox };
  } catch {
    return null;
  }
}

/** The codes parents of this school use: the school's own if set, otherwise the shared ones. */
export async function lineCodesFor(prisma: PrismaService, tenantId: string): Promise<{ enabled: boolean; ussdCode: string | null; shortCode: string | null }> {
  const [school, platform] = await Promise.all([loadSchoolLine(prisma, tenantId), loadPlatformLine(prisma)]);
  const shared = platform.enabled;
  return {
    enabled: school.settings.enabled,
    ussdCode: school.override?.ussdCode ?? (shared ? platform.ussdCode : null),
    shortCode: school.override?.shortCode ?? (shared ? platform.shortCode : null),
  };
}
