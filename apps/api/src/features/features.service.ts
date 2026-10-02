import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { MODULE_FEATURES, type FlagKind, type ModuleFeature, type TenantFeatureState } from '@aischool/shared';
import { PrismaService } from '../prisma/prisma.service';

const TTL_MS = 30_000;

interface FlagDef {
  key: string;
  name: string;
  kind: FlagKind;
  enabled: boolean;
  rolloutPercent: number;
}

/** A stable 0–99 bucket per school and flag, so a rollout doesn't flicker. */
export function rolloutBucket(tenantId: string, key: string): number {
  return createHash('sha256').update(`${tenantId}:${key}`).digest().readUInt16BE(0) % 100;
}

/**
 * Which modules and beta flags are on for a school.
 *
 *  1. A flag switched off in the console is off everywhere.
 *  2. Otherwise a per-school override wins.
 *  3. Module flags follow the school's plan (a plan listing no modules
 *     includes them all; a school with no plan gets them all).
 *  4. Beta flags are on for the rollout percentage of schools.
 *
 * Cached for 30 seconds per process; console changes clear the cache.
 */
@Injectable()
export class FeatureService {
  private flags: { at: number; rows: FlagDef[] } | null = null;
  private readonly perTenant = new Map<string, { at: number; states: TenantFeatureState[] }>();

  constructor(private readonly prisma: PrismaService) {}

  invalidate(tenantId?: string) {
    if (tenantId) this.perTenant.delete(tenantId);
    else {
      this.perTenant.clear();
      this.flags = null;
    }
  }

  private async allFlags(): Promise<FlagDef[]> {
    if (this.flags && Date.now() - this.flags.at < TTL_MS) return this.flags.rows;
    const rows = await this.prisma.root.featureFlag.findMany({ orderBy: [{ kind: 'desc' }, { key: 'asc' }] });
    const defs = rows.map((r) => ({ key: r.key, name: r.name, kind: r.kind as FlagKind, enabled: r.enabled, rolloutPercent: r.rolloutPercent }));
    // Modules always exist, even before the migration's rows are there.
    for (const [key, m] of Object.entries(MODULE_FEATURES)) {
      if (!defs.some((d) => d.key === key)) defs.push({ key, name: m.label, kind: 'MODULE', enabled: true, rolloutPercent: 0 });
    }
    this.flags = { at: Date.now(), rows: defs };
    return defs;
  }

  async states(tenantId: string): Promise<TenantFeatureState[]> {
    const hit = this.perTenant.get(tenantId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.states;
    const [flags, tenant] = await Promise.all([
      this.allFlags(),
      this.prisma.root.tenant.findUnique({ where: { id: tenantId }, select: { plan: { select: { features: true } }, featureOverrides: { select: { flagKey: true, enabled: true } } } }),
    ]);
    const overrides = new Map(tenant?.featureOverrides.map((o) => [o.flagKey, o.enabled]) ?? []);
    const planFeatures = tenant?.plan?.features ?? null;
    const states = flags.map((f): TenantFeatureState => {
      const override = overrides.has(f.key) ? overrides.get(f.key)! : null;
      const base = { key: f.key, name: f.name, kind: f.kind, override };
      if (!f.enabled) return { ...base, enabled: false, source: 'MASTER_OFF' };
      if (override !== null) return { ...base, enabled: override, source: 'OVERRIDE' };
      if (f.kind === 'MODULE') {
        if (!planFeatures) return { ...base, enabled: true, source: 'NO_PLAN' };
        return { ...base, enabled: planFeatures.length === 0 || planFeatures.includes(f.key), source: 'PLAN' };
      }
      if (f.rolloutPercent >= 100) return { ...base, enabled: true, source: 'DEFAULT' };
      return { ...base, enabled: f.rolloutPercent > 0 && rolloutBucket(tenantId, f.key) < f.rolloutPercent, source: 'ROLLOUT' };
    });
    this.perTenant.set(tenantId, { at: Date.now(), states });
    return states;
  }

  async enabledKeys(tenantId: string): Promise<string[]> {
    return (await this.states(tenantId)).filter((s) => s.enabled).map((s) => s.key);
  }

  async isEnabled(tenantId: string, key: string): Promise<boolean> {
    return (await this.states(tenantId)).find((s) => s.key === key)?.enabled ?? false;
  }

  async assert(tenantId: string, key: ModuleFeature | string) {
    if (await this.isEnabled(tenantId, key)) return;
    const label = (MODULE_FEATURES as Record<string, { label: string }>)[key]?.label ?? key;
    throw new ForbiddenException({ statusCode: 403, code: 'FEATURE_NOT_IN_PLAN', feature: key, message: `${label} isn't included in your school's plan. Ask your school admin to upgrade.` });
  }
}
