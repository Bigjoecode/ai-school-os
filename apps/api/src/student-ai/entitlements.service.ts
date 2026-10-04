import { ForbiddenException, Global, HttpException, Injectable, Module, NotFoundException } from '@nestjs/common';
import {
  ENTITLEMENTS,
  EXAMS,
  TIER_POLICY,
  examEntitlement,
  type AllowanceExhausted,
  type EntitlementKey,
  type ExamBody,
  type ProductPeriod,
  type StudentAccess,
  type StudentAiTier,
} from '@aischool/shared';
import { fullName } from '../common/format';
import { RequestContextStore, currentContext } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { PrismaService } from '../prisma/prisma.service';
import { VOICE_AGENTS } from '../ai/voice.service';

const DEFAULT_SESSIONS: Record<StudentAiTier, number> = { BASIC: 20, PLUS: 300, PRO: 800 };
const TIER_OF: Partial<Record<string, StudentAiTier>> = { STUDENT_AI_PLUS: 'PLUS', STUDENT_AI_PRO: 'PRO' };
const RANK: Record<StudentAiTier, number> = { BASIC: 0, PLUS: 1, PRO: 2 };

export interface ResolvedAccess extends StudentAccess {
  tenantId: string;
  periodKey: string;
}

/**
 * The entitlement engine. Whoever paid (the school's plan, a parent, a
 * school sponsorship, a platform grant), features only ask: what may this
 * student use right now, and how much is left? Usage is counted per
 * allowance window: the paid period for Plus/Pro, the school term for Basic.
 */
@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  /** The signed-in student's own record in the current school. */
  async me() {
    const ctx = currentContext();
    const s = await this.prisma.db.student.findFirst({ where: { userId: ctx.userId, status: 'ACTIVE' }, select: { id: true } });
    if (!s) throw new ForbiddenException('This account is not linked to a student');
    return s.id;
  }

  /** Students the signed-in parent may act for, across every school they belong to. */
  async myChildren(userId: string) {
    const links = await this.prisma.root.studentGuardian.findMany({
      where: { guardian: { userId }, student: { status: 'ACTIVE' } },
      include: { student: { include: { tenant: { select: { id: true, name: true, slug: true, status: true } }, classArm: { include: { classLevel: true } } } } },
    });
    const seen = new Set<string>();
    return links
      .map((l) => l.student)
      .filter((s) => s.tenant.status !== 'SUSPENDED' && s.tenant.status !== 'ARCHIVED' && !seen.has(s.id) && seen.add(s.id));
  }

  async assertParentOf(userId: string, studentIds: string[]) {
    const mine = new Set((await this.myChildren(userId)).map((s) => s.id));
    const foreign = studentIds.filter((id) => !mine.has(id));
    if (foreign.length) throw new ForbiddenException('You can only act for your own children');
  }

  async access(studentId: string): Promise<ResolvedAccess> {
    const now = new Date();
    const student = await this.prisma.root.student.findUnique({
      where: { id: studentId },
      select: { id: true, firstName: true, lastName: true, tenantId: true, tenant: { select: { timezone: true, plan: { select: { studentAiSessions: true } } } } },
    });
    if (!student) throw new NotFoundException('Student not found');
    const ents = await this.prisma.root.studentEntitlement.findMany({
      where: { studentId, status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
      orderBy: { endsAt: 'desc' },
    });
    // The highest AI tier wins; its own period is the allowance window.
    const ai = ents
      .filter((e) => TIER_OF[e.key])
      .sort((a, b) => RANK[TIER_OF[b.key]!] - RANK[TIER_OF[a.key]!] || b.endsAt.getTime() - a.endsAt.getTime())[0];
    let tier: StudentAiTier = 'BASIC';
    let allowance: number;
    let windowStart: Date;
    let windowEnd: Date;
    let periodKey: string;
    if (ai) {
      tier = TIER_OF[ai.key]!;
      allowance = ai.aiSessions ?? DEFAULT_SESSIONS[tier];
      windowStart = ai.startsAt;
      windowEnd = ai.endsAt;
      periodKey = `ent:${ai.id}`;
    } else {
      allowance = student.tenant.plan?.studentAiSessions ?? DEFAULT_SESSIONS.BASIC;
      const today = schoolNow(student.tenant.timezone).date;
      const term = await this.prisma.root.term.findFirst({
        where: { tenantId: student.tenantId, startsOn: { lte: new Date(`${today}T00:00:00Z`) }, endsOn: { gte: new Date(`${today}T00:00:00Z`) } },
        orderBy: { startsOn: 'desc' },
      });
      if (term) {
        windowStart = term.startsOn;
        windowEnd = new Date(term.endsOn.getTime() + 86_400_000);
        periodKey = `term:${term.id}`;
      } else {
        windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        windowEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        periodKey = `month:${windowStart.toISOString().slice(0, 7)}`;
      }
    }
    // Fair use per rolling 24 hours.
    const dayStart = new Date(now.getTime() - 86_400_000);
    const [usage, today] = await Promise.all([
      this.prisma.root.studentAiUsage.findUnique({ where: { studentId_periodKey: { studentId, periodKey } } }),
      // Voice (speech in and out) rides on a chat message that is already counted.
      this.prisma.root.aiUsage.count({ where: { studentId, createdAt: { gte: dayStart }, success: true, agent: { notIn: VOICE_AGENTS } } }),
    ]);
    const used = usage?.units ?? 0;
    const policy = TIER_POLICY[tier];
    const exams = EXAMS.filter((x) => ents.some((e) => e.key === examEntitlement(x)));
    const sourceOf = (s: string) => (s === 'PARENT' ? 'PARENT' : s === 'SCHOOL' ? 'SCHOOL' : 'PLATFORM') as 'PARENT' | 'SCHOOL' | 'PLATFORM';
    return {
      tenantId: student.tenantId,
      periodKey,
      studentId,
      name: fullName(student),
      tier,
      tierLabel: ENTITLEMENTS[tier === 'BASIC' ? 'STUDENT_AI_BASIC' : tier === 'PLUS' ? 'STUDENT_AI_PLUS' : 'STUDENT_AI_PRO'].label,
      allowance,
      used,
      remaining: Math.max(0, allowance - used),
      remainingPct: allowance ? Math.max(0, Math.round(((allowance - used) / allowance) * 100)) : 0,
      usedToday: today,
      dailyCap: policy.dailyCap,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      deepAllowed: policy.deepAllowed,
      deepCost: policy.deepCost,
      photos: policy.photos,
      studyTools: policy.studyTools,
      exams: exams as ExamBody[],
      entitlements: [
        { key: 'STUDENT_AI_BASIC' as EntitlementKey, label: ENTITLEMENTS.STUDENT_AI_BASIC.label, source: 'INCLUDED' as const, endsAt: null },
        // One row per entitlement and source: the one that lasts longest (ents are sorted by end date).
        ...ents
          .filter((e, i) => e.key in ENTITLEMENTS && ents.findIndex((x) => x.key === e.key && x.source === e.source) === i)
          .map((e) => ({ key: e.key as EntitlementKey, label: ENTITLEMENTS[e.key as EntitlementKey].label, source: sourceOf(e.source), endsAt: e.endsAt.toISOString() })),
      ],
    };
  }

  private async upgradeOffer(tier: StudentAiTier) {
    const code = tier === 'BASIC' ? 'AI_PLUS' : 'AI_PRO';
    const p = await this.prisma.root.product.findFirst({ where: { code, isActive: true, isPublic: true } });
    return p ? { productCode: p.code, name: p.name, priceKobo: p.priceKobo, period: p.period as ProductPeriod } : null;
  }

  private async refuse(code: AllowanceExhausted['code'], message: string, access: ResolvedAccess): Promise<never> {
    const { tenantId: _t, periodKey: _p, ...visible } = access;
    const body: AllowanceExhausted & { statusCode: number } = { statusCode: 402, code, message, access: visible, upgrade: await this.upgradeOffer(access.tier) };
    throw new HttpException(body, 402);
  }

  /**
   * Before a tutor request: is there allowance left, is today's fair-use cap
   * reached, is the feature in this tier? Returns how many sessions it will use.
   */
  async check(access: ResolvedAccess, opts: { deep?: boolean; photos?: boolean; studyTool?: boolean }): Promise<{ units: number; deep: boolean }> {
    const policy = TIER_POLICY[access.tier];
    if (opts.photos && !policy.photos) await this.refuse('AI_FEATURE_NOT_INCLUDED', 'Photo questions come with AI Student Plus.', access);
    if (opts.studyTool && !policy.studyTools) await this.refuse('AI_FEATURE_NOT_INCLUDED', 'Study plans and flashcards come with AI Student Plus.', access);
    const deep = (opts.deep ?? policy.deepByDefault) && policy.deepAllowed;
    if (opts.deep && !policy.deepAllowed) await this.refuse('AI_FEATURE_NOT_INCLUDED', 'Deeper explanations come with AI Student Plus.', access);
    const units = deep ? policy.deepCost : 1;
    if (access.remaining < units) {
      await this.refuse(
        'AI_ALLOWANCE_EXHAUSTED',
        access.tier === 'BASIC' ? "You've used your included AI learning sessions for this term. Continue learning with AI Student Plus." : "You've used this period's AI learning sessions. They refresh when your plan renews.",
        access,
      );
    }
    if (access.usedToday >= access.dailyCap) await this.refuse('AI_DAILY_LIMIT', "That's a lot of learning for one day! Your AI tutor will be ready again tomorrow.", access);
    return { units, deep };
  }

  /** Counts a completed request against the window and tags the AI cost with the student. */
  async consume(access: ResolvedAccess, units: number, deep: boolean) {
    await this.prisma.root.studentAiUsage.upsert({
      where: { studentId_periodKey: { studentId: access.studentId, periodKey: access.periodKey } },
      update: { units: { increment: units }, deepUnits: { increment: deep ? units : 0 }, lastAt: new Date() },
      create: { tenantId: access.tenantId, studentId: access.studentId, periodKey: access.periodKey, units, deepUnits: deep ? units : 0 },
    });
  }

  /** Marks the rest of this request's AI calls as this student's, for unit economics. */
  attribute(access: ResolvedAccess) {
    const ctx = RequestContextStore.get();
    if (ctx) ctx.aiStudent = { studentId: access.studentId, tier: access.tier };
  }

  /** Grants entitlements to students for a period (one row per student per key). */
  async grant(
    rows: { tenantId: string; studentId: string }[],
    keys: string[],
    opts: { source: 'PARENT' | 'SCHOOL' | 'PLATFORM'; startsAt: Date; endsAt: Date; aiSessions: number | null; productId?: string; consumerSubscriptionId?: string; sponsorshipId?: string; note?: string },
  ) {
    await this.prisma.root.studentEntitlement.createMany({
      data: rows.flatMap((r) =>
        keys.map((key) => ({
          tenantId: r.tenantId,
          studentId: r.studentId,
          key,
          source: opts.source,
          startsAt: opts.startsAt,
          endsAt: opts.endsAt,
          aiSessions: TIER_OF[key] ? opts.aiSessions : null,
          productId: opts.productId,
          consumerSubscriptionId: opts.consumerSubscriptionId,
          sponsorshipId: opts.sponsorshipId,
          note: opts.note,
        })),
      ),
    });
  }

  async revoke(where: { consumerSubscriptionId?: string; sponsorshipId?: string }, note: string) {
    await this.prisma.root.studentEntitlement.updateMany({ where: { ...where, status: 'ACTIVE' }, data: { status: 'REVOKED', note } });
  }
}

@Global()
@Module({ providers: [EntitlementService], exports: [EntitlementService] })
export class EntitlementsModule {}
