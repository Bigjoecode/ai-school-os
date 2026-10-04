import { Injectable } from '@nestjs/common';
import {
  DEFAULT_HOUSE_SETTINGS,
  houseSettingsSchema,
  type HouseContributor,
  type HousePeriod,
  type HousePointCategory,
  type HousePointRow,
  type HouseRef,
  type HouseSettings,
  type HouseStanding,
  type HouseStandings,
} from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { dateOnly, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { PrismaService } from '../prisma/prisma.service';

/** House settings live in platform_settings, keyed by school (no schema change needed). */
const settingsKey = (tenantId: string) => `houses:${tenantId}`;

export const pointInclude = {
  house: { select: { id: true, name: true, colour: true } },
  student: { select: { id: true, firstName: true, lastName: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } } },
} satisfies Prisma.HousePointEntryInclude;
export type PointWithRefs = Prisma.HousePointEntryGetPayload<{ include: typeof pointInclude }>;

export const armLabel = (a: { name: string; classLevel: { name: string } } | null | undefined) => (a ? `${a.classLevel.name} ${a.name}`.trim() : null);
export const houseRef = (h: { id: string; name: string; colour: string }): HouseRef => ({ id: h.id, name: h.name, colour: h.colour });

export interface Period {
  kind: HousePeriod;
  label: string;
  from: string | null;
  to: string | null;
}

/** Standings, settings and the rules shared by the staff page, the student sheet and the family portal. */
@Injectable()
export class HousesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Houses and their members: principal/VP/admin (academics or students managers). */
  canManage(): boolean {
    const p = currentContext().permissions;
    return p.has('academics.manage') || p.has('students.manage');
  }

  canAward(): boolean {
    return currentContext().permissions.has('behaviour.manage');
  }

  /** Senior staff may remove anyone's award; others only their own. */
  canDelete(e: { awardedById: string | null }): boolean {
    const ctx = currentContext();
    if (!ctx.permissions.has('behaviour.manage')) return false;
    return this.canManage() || (!!e.awardedById && e.awardedById === ctx.userId);
  }

  async settings(): Promise<HouseSettings> {
    const row = await this.prisma.root.platformSetting.findUnique({ where: { key: settingsKey(currentTenantId()) } });
    const parsed = houseSettingsSchema.safeParse(row?.value ?? {});
    return parsed.success ? parsed.data : DEFAULT_HOUSE_SETTINGS;
  }

  async saveSettings(s: HouseSettings): Promise<HouseSettings> {
    const key = settingsKey(currentTenantId());
    const value = { countBehaviour: s.countBehaviour };
    await this.prisma.root.platformSetting.upsert({
      where: { key },
      update: { value, updatedBy: currentContext().userId ?? null },
      create: { key, value, updatedBy: currentContext().userId ?? null },
    });
    return value;
  }

  async today(): Promise<string> {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { timezone: true } });
    return schoolNow(t.timezone).date;
  }

  /** "This term", "This session", all time or a custom range, in school dates. */
  async period(kind: HousePeriod, from?: string, to?: string): Promise<Period> {
    const db = this.prisma.db;
    if (kind === 'CUSTOM' && from && to) {
      const [a, b] = from <= to ? [from, to] : [to, from];
      return { kind, label: `${fmt(a)} – ${fmt(b)}`, from: a, to: b };
    }
    if (kind === 'TERM' || kind === 'CUSTOM') {
      const term =
        (await db.term.findFirst({ where: { isCurrent: true }, include: { session: { select: { name: true } } } })) ??
        (await db.term.findFirst({ where: { startsOn: { lte: parseDate(await this.today()) } }, orderBy: { startsOn: 'desc' }, include: { session: { select: { name: true } } } }));
      if (term) return { kind: 'TERM', label: `${term.name}, ${term.session.name}`, from: dateOnly(term.startsOn), to: dateOnly(term.endsOn) };
    }
    if (kind === 'SESSION' || kind === 'TERM' || kind === 'CUSTOM') {
      const s =
        (await db.academicSession.findFirst({ where: { isCurrent: true } })) ??
        (await db.academicSession.findFirst({ where: { startsOn: { lte: parseDate(await this.today()) } }, orderBy: { startsOn: 'desc' } }));
      if (s) return { kind: 'SESSION', label: `${s.name} session`, from: dateOnly(s.startsOn), to: dateOnly(s.endsOn) };
    }
    return { kind: 'ALL', label: 'All time', from: null, to: null };
  }

  private range(p: Period): Prisma.DateTimeFilter | undefined {
    if (!p.from && !p.to) return undefined;
    return { ...(p.from ? { gte: parseDate(p.from) } : {}), ...(p.to ? { lte: parseDate(p.to) } : {}) };
  }

  async userNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uniq.length) return new Map();
    const users = await this.prisma.root.user.findMany({ where: { id: { in: uniq } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  }

  async pointRows(rows: PointWithRefs[]): Promise<HousePointRow[]> {
    const names = await this.userNames(rows.map((r) => r.awardedById));
    return rows.map((r) => ({
      id: r.id,
      house: houseRef(r.house),
      student: r.student ? { id: r.student.id, name: `${r.student.firstName} ${r.student.lastName}`, className: armLabel(r.student.classArm) } : null,
      points: r.points,
      reason: r.reason,
      category: r.category as HousePointCategory,
      date: dateOnly(r.date)!,
      awardedBy: r.awardedById ? (names.get(r.awardedById) ?? 'Former staff') : null,
      createdAt: r.createdAt.toISOString(),
      canDelete: this.canDelete(r),
    }));
  }

  /**
   * The leaderboard for a period: points awarded to each house, plus (if
   * the school counts them) the behaviour points of each house's current
   * members, and the students who contributed most.
   */
  async standings(p: Period, opts: { recent?: number; contributors?: number; houseId?: string } = {}): Promise<HouseStandings> {
    const db = this.prisma.db;
    const settings = await this.settings();
    const date = this.range(p);
    const [houses, entries, members, behaviour] = await Promise.all([
      db.house.findMany({ orderBy: { name: 'asc' } }),
      db.housePointEntry.findMany({ where: { ...(date ? { date } : {}) }, select: { houseId: true, studentId: true, points: true, category: true } }),
      db.student.groupBy({ by: ['houseId'], where: { status: 'ACTIVE', houseId: { not: null } }, _count: { _all: true } }),
      settings.countBehaviour
        ? db.behaviourRecord.findMany({ where: { ...(date ? { date } : {}), student: { houseId: { not: null }, status: 'ACTIVE' } }, select: { studentId: true, points: true, student: { select: { houseId: true } } } })
        : Promise.resolve([] as { studentId: string; points: number; student: { houseId: string | null } }[]),
    ]);
    const memberCount = new Map(members.map((m) => [m.houseId!, m._count._all]));
    const rows = new Map<string, HouseStanding>(
      houses.map((h) => [h.id, { house: { ...houseRef(h), motto: h.motto }, rank: 0, awarded: 0, behaviour: 0, total: 0, members: memberCount.get(h.id) ?? 0, byCategory: {} }]),
    );
    const perStudent = new Map<string, { houseId: string; points: number }>();
    for (const e of entries) {
      const r = rows.get(e.houseId);
      if (!r) continue;
      r.awarded += e.points;
      const cat = e.category as HousePointCategory;
      r.byCategory[cat] = (r.byCategory[cat] ?? 0) + e.points;
      if (e.studentId) {
        const s = perStudent.get(e.studentId) ?? { houseId: e.houseId, points: 0 };
        s.points += e.points;
        perStudent.set(e.studentId, s);
      }
    }
    for (const b of behaviour) {
      const r = b.student.houseId ? rows.get(b.student.houseId) : undefined;
      if (!r) continue;
      r.behaviour += b.points;
      const s = perStudent.get(b.studentId) ?? { houseId: b.student.houseId!, points: 0 };
      s.points += b.points;
      perStudent.set(b.studentId, s);
    }
    const list = [...rows.values()];
    for (const r of list) r.total = r.awarded + r.behaviour;
    list.sort((a, b) => b.total - a.total || a.house.name.localeCompare(b.house.name));
    // Equal totals share a rank (1, 2, 2, 4).
    list.forEach((r, i) => (r.rank = i > 0 && list[i - 1]!.total === r.total ? list[i - 1]!.rank : i + 1));

    const topIds = [...perStudent.entries()]
      .filter(([, v]) => v.points > 0 && (!opts.houseId || v.houseId === opts.houseId))
      .sort((a, b) => b[1].points - a[1].points)
      .slice(0, opts.contributors ?? 10);
    const students = topIds.length
      ? await db.student.findMany({ where: { id: { in: topIds.map(([id]) => id) } }, select: { id: true, firstName: true, lastName: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } } })
      : [];
    const byId = new Map(students.map((s) => [s.id, s]));
    const topContributors: HouseContributor[] = topIds.flatMap(([id, v]) => {
      const s = byId.get(id);
      const h = rows.get(v.houseId);
      return s && h ? [{ student: { id, name: `${s.firstName} ${s.lastName}`, className: armLabel(s.classArm) }, house: houseRef(h.house), points: v.points }] : [];
    });

    const recent = opts.recent
      ? await db.housePointEntry.findMany({ where: { ...(date ? { date } : {}), ...(opts.houseId ? { houseId: opts.houseId } : {}) }, include: pointInclude, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: opts.recent })
      : [];
    return {
      period: p,
      countBehaviour: settings.countBehaviour,
      standings: list,
      recent: await this.pointRows(recent),
      topContributors,
      updatedAt: new Date().toISOString(),
    };
  }
}

function fmt(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
