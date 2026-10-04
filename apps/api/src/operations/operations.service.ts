import { Injectable } from '@nestjs/common';
import { DEFAULT_OPERATIONS_SETTINGS, type OperationsSettings, type Permission, type PersonRef } from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { PrismaService } from '../prisma/prisma.service';

export const armLabel = (a: { name: string; classLevel: { name: string } } | null | undefined) => (a ? `${a.classLevel.name} ${a.name}` : null);

export const studentWithArm = {
  select: { id: true, firstName: true, lastName: true, admissionNumber: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } },
} as const;

export function studentRef(s: { id: string; firstName: string; lastName: string; classArm: { name: string; classLevel: { name: string } } | null }): PersonRef {
  return { kind: 'STUDENT', id: s.id, name: fullName(s), detail: armLabel(s.classArm) };
}

export function staffRef(s: { id: string; firstName: string; lastName: string; jobTitle: string }): PersonRef {
  return { kind: 'STAFF', id: s.id, name: fullName(s), detail: s.jobTitle };
}

/** Settings, school details and small helpers shared by the operations modules. */
@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async school() {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({
      where: { id: currentTenantId() },
      select: {
        name: true,
        shortName: true,
        slug: true,
        motto: true,
        address: true,
        phone: true,
        email: true,
        logoUrl: true,
        primaryColor: true,
        currency: true,
        timezone: true,
        operationsSettings: true,
      },
    });
    const settings: OperationsSettings = {
      ...DEFAULT_OPERATIONS_SETTINGS,
      ...((t.operationsSettings as Partial<OperationsSettings> | null) ?? {}),
    };
    delete (settings as Partial<OperationsSettings> & { admissions?: unknown }).admissions;
    const now = schoolNow(t.timezone);
    return { ...t, settings, today: now.date, now };
  }

  async setSettings(settings: OperationsSettings) {
    // Other modules keep their own keys in this column (e.g. `admissions`); keep them.
    const before = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { operationsSettings: true } });
    const { admissions } = (before.operationsSettings as { admissions?: unknown } | null) ?? {};
    await this.prisma.root.tenant.update({
      where: { id: currentTenantId() },
      data: { operationsSettings: { ...settings, ...(admissions ? { admissions } : {}) } as unknown as Prisma.InputJsonValue },
    });
    await this.audit.log({ action: 'operations.settings', summary: 'Updated library, certificate and ID card settings' });
    return (await this.school()).settings;
  }

  can(p: Permission): boolean {
    return currentContext().permissions.has(p);
  }

  async userNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    if (!unique.length) return new Map();
    const users = await this.prisma.root.user.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, fullName(u)]));
  }

  /** The current term, if one is set. */
  currentTerm() {
    return this.prisma.db.term.findFirst({ where: { isCurrent: true } });
  }
}

/** YYYY-MM-DD plus n days. */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from a to b (b later → positive). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
