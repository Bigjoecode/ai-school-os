import { Body, Controller, Get, Injectable, Put } from '@nestjs/common';
import {
  DEMO_SCHOOL_SLUGS,
  demoModeSchema,
  type DemoModeInput,
  type DemoModeSettings,
  type DemoLoginHint,
  type DemoModeStatus,
} from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { RequirePlatformRole } from '../common/decorators';
import { currentUserId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import type { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const DEMO_MODE_KEY = 'demo-mode';

const DEMO_PASSWORD = 'Greenfield#2026';

/** The demo schools' well-known logins (see prisma/demo-seed.ts). Kept on the server so they are not in the web bundle. Never includes the platform owner. */
export const DEMO_LOGIN_HINTS: DemoLoginHint[] = [
  { label: 'School admin', email: 'admin@greenfield.demo', password: DEMO_PASSWORD, school: 'greenfield' },
  { label: 'Principal', email: 'principal@greenfield.demo', password: DEMO_PASSWORD, school: 'greenfield' },
  { label: 'Teacher', email: 'teacher@greenfield.demo', password: DEMO_PASSWORD, school: 'greenfield' },
  { label: 'Parent (two schools)', email: 'parent@greenfield.demo', password: DEMO_PASSWORD, school: '' },
  { label: 'Student (AI Plus)', email: 'student@greenfield.demo', password: DEMO_PASSWORD, school: 'greenfield' },
];

const CACHE_MS = 10_000;

/** What applies before the operator has saved anything: logins on, hints as the environment always decided. */
export function defaultDemoMode(): DemoModeSettings {
  const e = env();
  return { loginsEnabled: true, publicHints: e.SHOW_DEMO_ACCOUNTS ?? (e.SEED_DEMO_ON_BOOT || e.NODE_ENV !== 'production') };
}

/** Saved settings plus the DEMO_LOGINS=off override (used by boot tasks too, which have their own client). */
export function effectiveDemoMode(saved: DemoModeSettings): DemoModeSettings {
  if (env().DEMO_LOGINS === 'off') return { loginsEnabled: false, publicHints: false };
  // Advertising logins that are refused helps no one.
  return { loginsEnabled: saved.loginsEnabled, publicHints: saved.publicHints && saved.loginsEnabled };
}

export function parseDemoMode(value: unknown): DemoModeSettings {
  const d = defaultDemoMode();
  const v = (value ?? {}) as Partial<DemoModeSettings>;
  return {
    loginsEnabled: typeof v.loginsEnabled === 'boolean' ? v.loginsEnabled : d.loginsEnabled,
    publicHints: typeof v.publicHints === 'boolean' ? v.publicHints : d.publicHints,
  };
}

/**
 * For start-up tasks (their own Prisma client): demo logins are switched off,
 * so demo data must not be (re)created automatically.
 */
export async function demoLoginsOff(prisma: Pick<PrismaClient, 'platformSetting'>): Promise<boolean> {
  if (env().DEMO_LOGINS === 'off') return true;
  const row = await prisma.platformSetting.findUnique({ where: { key: DEMO_MODE_KEY } });
  return !effectiveDemoMode(parseDemoMode(row?.value)).loginsEnabled;
}

/**
 * The demo schools' switch: whether their well-known logins work and whether
 * they are advertised anywhere public. Platform staff (users with a platform
 * role) can always open a demo school, for support and to prepare a demo.
 * Read on every signed-in request into a demo school, so it is cached briefly
 * (a change reaches other API instances within ~10 seconds).
 */
@Injectable()
export class DemoModeService {
  private cache: { at: number; saved: DemoModeSettings; updatedAt: Date | null; updatedBy: string | null } | null = null;
  private demoIds: { at: number; ids: Set<string> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async load() {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache;
    const row = await this.prisma.root.platformSetting.findUnique({ where: { key: DEMO_MODE_KEY } });
    this.cache = { at: Date.now(), saved: parseDemoMode(row?.value), updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null };
    return this.cache;
  }

  async effective(): Promise<DemoModeSettings> {
    return effectiveDemoMode((await this.load()).saved);
  }

  async demoTenantIds(): Promise<Set<string>> {
    if (this.demoIds && Date.now() - this.demoIds.at < 60_000) return this.demoIds.ids;
    const rows = await this.prisma.root.tenant.findMany({ where: { slug: { in: [...DEMO_SCHOOL_SLUGS] } }, select: { id: true } });
    this.demoIds = { at: Date.now(), ids: new Set(rows.map((r) => r.id)) };
    return this.demoIds.ids;
  }

  /** May this user be signed in to this school right now? Only demo schools with logins off say no. */
  async allows(tenantId: string | null | undefined, platformRole: string | null | undefined): Promise<boolean> {
    if (!tenantId || platformRole) return true;
    if (!(await this.demoTenantIds()).has(tenantId)) return true;
    return (await this.effective()).loginsEnabled;
  }

  /** Demo schools that are closed to sign-in now (empty when logins are on). */
  async closedTenantIds(): Promise<string[]> {
    if ((await this.effective()).loginsEnabled) return [];
    return [...(await this.demoTenantIds())];
  }

  async status(): Promise<DemoModeStatus> {
    const c = await this.load();
    const [schools, by] = await Promise.all([
      this.prisma.root.tenant.findMany({ where: { slug: { in: [...DEMO_SCHOOL_SLUGS] } }, select: { slug: true, name: true, status: true }, orderBy: { slug: 'asc' } }),
      c.updatedBy ? this.prisma.root.user.findUnique({ where: { id: c.updatedBy }, select: { firstName: true, lastName: true } }) : null,
    ]);
    return {
      saved: c.saved,
      effective: effectiveDemoMode(c.saved),
      envLocked: env().DEMO_LOGINS === 'off',
      schools,
      updatedAt: c.updatedAt?.toISOString() ?? null,
      updatedBy: by ? `${by.firstName} ${by.lastName}`.trim() : null,
    };
  }

  async save(input: DemoModeInput): Promise<DemoModeStatus> {
    const before = (await this.load()).saved;
    const userId = currentUserId();
    const value = { publicHints: input.publicHints, loginsEnabled: input.loginsEnabled };
    await this.prisma.root.platformSetting.upsert({
      where: { key: DEMO_MODE_KEY },
      update: { value, updatedBy: userId },
      create: { key: DEMO_MODE_KEY, value, updatedBy: userId },
    });
    this.cache = null;
    const changes = [
      before.loginsEnabled !== value.loginsEnabled ? `demo logins ${value.loginsEnabled ? 'ON' : 'OFF'}` : '',
      before.publicHints !== value.publicHints ? `public demo hints ${value.publicHints ? 'shown' : 'hidden'}` : '',
    ].filter(Boolean);
    if (changes.length) {
      await this.audit.log({
        tenantId: null,
        action: 'platform.demo_mode',
        entityType: 'PlatformSetting',
        entityId: DEMO_MODE_KEY,
        summary: `Demo schools: ${changes.join('; ')}${env().DEMO_LOGINS === 'off' ? ' (DEMO_LOGINS=off on the server still keeps logins off)' : ''}`,
        metadata: { before: { ...before }, after: value },
      });
    }
    return this.status();
  }
}

/** Console: the demo schools' switch (super admins only). */
@Controller('platform/demo-mode')
@RequirePlatformRole('SUPER_ADMIN')
export class DemoModeController {
  constructor(private readonly demo: DemoModeService) {}

  @Get()
  status(): Promise<DemoModeStatus> {
    return this.demo.status();
  }

  @Put()
  save(@Body(new ZodPipe(demoModeSchema)) body: DemoModeInput): Promise<DemoModeStatus> {
    return this.demo.save(body);
  }
}
