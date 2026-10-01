import { Injectable } from '@nestjs/common';
import { formatMoney, type AiUsageReport, type AtRiskReport, type AtRiskStudent } from '@aischool/shared';
import { AGENTS } from '../ai/agents';
import { ResultsService } from '../assessment/results.service';
import { dateOnly, fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/** Friendly names for AI features recorded in the usage ledger. */
const FEATURE_LABELS: Record<string, string> = {
  'finance-insight': 'Finance briefing',
  'fee-reminder': 'Fee reminders',
  'hr-insight': 'HR briefing',
  'payroll-review': 'Payroll review',
  'award-citation': 'Award citations',
  'reading-list': 'Reading lists',
  'inventory-insight': 'Stores briefing',
  'route-notice': 'Transport notices',
  'enquiry-reply': 'Enquiry replies',
  'certificate-draft': 'Certificate drafts',
  'comms-compose': 'Message drafting',
  'comms-translate': 'Translation',
  'class-intelligence': 'Live class summaries',
  'principal-briefing': 'Principal briefing',
};

/**
 * Early warnings and AI analytics. The at-risk list is plain arithmetic over
 * the school's records (no AI), so it is cheap, explainable and repeatable.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly results: ResultsService,
  ) {}

  private can(p: Parameters<ReturnType<typeof currentContext>['permissions']['has']>[0]) {
    return currentContext().permissions.has(p);
  }

  /**
   * Students who need attention this term, with the reasons:
   *  - attendance (registers taken this term; excused days don't count against them),
   *  - results so far (the same engine as report cards),
   *  - fees overdue and missed live classes (supporting signals only).
   */
  async atRisk(opts: { classArmId?: string; limit?: number } = {}): Promise<AtRiskReport> {
    const db = this.prisma.db;
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { timezone: true, currency: true } });
    const today = schoolNow(tenant.timezone).date;
    const term = await db.term.findFirst({ where: { isCurrent: true } });
    const signals = { attendance: this.can('attendance.read'), results: this.can('results.read'), fees: this.can('finance.read'), liveClasses: this.can('live.read') };
    if (!term) return { term: null, generatedAt: new Date().toISOString(), students: [], counts: { high: 0, medium: 0, assessed: 0 }, signals };

    const students = await db.student.findMany({
      where: { status: 'ACTIVE', classArmId: opts.classArmId ? opts.classArmId : { not: null } },
      select: { id: true, firstName: true, lastName: true, admissionNumber: true, classArmId: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } },
    });
    const ids = students.map((s) => s.id);
    const termRange = { gte: term.startsOn, lte: new Date(`${today}T00:00:00Z`) < term.endsOn ? new Date(`${today}T00:00:00Z`) : term.endsOn };

    const [att, invoices, liveAbsent] = await Promise.all([
      signals.attendance ? db.studentAttendance.groupBy({ by: ['studentId', 'status'], where: { studentId: { in: ids }, date: termRange }, _count: { _all: true } }) : [],
      signals.fees ? db.invoice.findMany({ where: { termId: term.id, studentId: { in: ids }, status: { in: ['ISSUED', 'PART_PAID'] } }, select: { studentId: true, totalKobo: true, paidKobo: true, dueDate: true } }) : [],
      signals.liveClasses
        ? db.liveAttendance.groupBy({ by: ['studentId'], where: { studentId: { in: ids }, status: 'ABSENT', liveClass: { startsAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }, _count: { _all: true } })
        : [],
    ]);

    const averages = new Map<string, number>();
    if (signals.results) {
      const arms = [...new Set(students.map((s) => s.classArmId!))];
      const withScores = await db.score.groupBy({ by: ['classArmId'], where: { termId: term.id, classArmId: { in: arms } }, _count: { _all: true } });
      for (const a of withScores) {
        const r = await this.results.classResults(a.classArmId, term.id);
        for (const [sid, avg] of r.averages) if (avg !== null) averages.set(sid, avg);
      }
    }

    const out: AtRiskStudent[] = [];
    for (const s of students) {
      const reasons: string[] = [];
      let score = 0;
      let core = 0;
      const n = (st: string) => att.find((a) => a.studentId === s.id && a.status === st)?._count._all ?? 0;
      const counted = n('PRESENT') + n('LATE') + n('ABSENT');
      const rate = counted >= 5 ? Math.round(((n('PRESENT') + n('LATE')) / counted) * 1000) / 10 : null;
      if (rate !== null && rate < 85) {
        score += 3;
        core += 3;
        reasons.push(`Attendance ${rate}% this term (${n('ABSENT')} days absent)`);
      } else if (rate !== null && rate < 92) {
        score += 1;
        core += 1;
        reasons.push(`Attendance ${rate}% this term`);
      }
      if (n('LATE') >= 5) {
        score += 1;
        reasons.push(`Late ${n('LATE')} times`);
      }
      const avg = averages.get(s.id) ?? null;
      if (avg !== null && avg < 40) {
        score += 3;
        core += 3;
        reasons.push(`Average ${Math.round(avg)}% across subjects so far`);
      } else if (avg !== null && avg < 48) {
        score += 1;
        core += 1;
        reasons.push(`Average ${Math.round(avg)}% across subjects so far`);
      }
      const overdue = invoices
        .filter((i) => i.studentId === s.id && dateOnly(i.dueDate)! < today)
        .reduce((t, i) => t + Math.max(0, i.totalKobo - i.paidKobo), 0);
      if (overdue > 0) {
        score += 1;
        reasons.push(`${formatMoney(overdue, tenant.currency)} fees overdue`);
      }
      const missed = liveAbsent.find((l) => l.studentId === s.id)?._count._all ?? 0;
      if (missed >= 2) {
        score += 1;
        reasons.push(`Missed ${missed} live classes in the last 30 days`);
      }
      // One serious signal (or several smaller ones) — fees and live classes alone never list a learner.
      if (core < 2 || score < 3) continue;
      out.push({
        student: { id: s.id, name: fullName(s), admissionNumber: s.admissionNumber, classArm: s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}` : null },
        level: score >= 5 ? 'HIGH' : 'MEDIUM',
        score,
        reasons,
        attendanceRate: rate,
        averagePercent: avg !== null ? Math.round(avg * 10) / 10 : null,
        overdueKobo: signals.fees ? overdue : null,
      });
    }
    out.sort((a, b) => b.score - a.score || (a.attendanceRate ?? 100) - (b.attendanceRate ?? 100));
    return {
      term: { id: term.id, name: term.name },
      generatedAt: new Date().toISOString(),
      students: out.slice(0, opts.limit ?? 40),
      counts: { high: out.filter((x) => x.level === 'HIGH').length, medium: out.filter((x) => x.level === 'MEDIUM').length, assessed: students.length },
      signals,
    };
  }

  // ---------------------------------------------------------- AI usage analytics

  async usage(month: string): Promise<AiUsageReport> {
    const db = this.prisma.db;
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const where = { createdAt: { gte: start, lt: end } };
    const [rows, tenant] = await Promise.all([
      db.aiUsage.findMany({ where, select: { userId: true, agent: true, provider: true, model: true, inputTokens: true, outputTokens: true, costUsd: true, latencyMs: true, success: true, error: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { aiMonthlyBudgetUsd: true } }),
    ]);
    const cost = (r: (typeof rows)[number]) => Number(r.costUsd);
    const round = (n: number) => Math.round(n * 10_000) / 10_000;
    const group = <K extends string>(key: (r: (typeof rows)[number]) => K) => {
      const m = new Map<K, typeof rows>();
      for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
      return m;
    };
    const users = await this.prisma.root.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))] } }, select: { id: true, firstName: true, lastName: true } });
    const names = new Map(users.map((u) => [u.id, fullName(u)]));
    const days: AiUsageReport['byDay'] = [];
    for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const day = rows.filter((r) => r.createdAt.toISOString().slice(0, 10) === key);
      days.push({ date: key, costUsd: round(day.reduce((t, r) => t + cost(r), 0)), calls: day.length });
    }
    const ok = rows.filter((r) => r.success);
    const budget = tenant.aiMonthlyBudgetUsd !== null ? Number(tenant.aiMonthlyBudgetUsd) : env().AI_DEFAULT_MONTHLY_BUDGET_USD;
    return {
      month,
      currency: 'USD',
      budgetUsd: budget > 0 ? budget : null,
      budgetIsDefault: tenant.aiMonthlyBudgetUsd === null,
      spendUsd: round(rows.reduce((t, r) => t + cost(r), 0)),
      calls: rows.length,
      failures: rows.length - ok.length,
      inputTokens: rows.reduce((t, r) => t + r.inputTokens, 0),
      outputTokens: rows.reduce((t, r) => t + r.outputTokens, 0),
      averageLatencyMs: ok.length ? Math.round(ok.reduce((t, r) => t + r.latencyMs, 0) / ok.length) : null,
      byDay: days,
      byFeature: [...group((r) => r.agent)]
        .map(([feature, rs]) => ({
          feature,
          label: AGENTS[feature as keyof typeof AGENTS]?.label ?? FEATURE_LABELS[feature] ?? feature.replace(/[-_]/g, ' '),
          costUsd: round(rs.reduce((t, r) => t + cost(r), 0)),
          calls: rs.length,
          failures: rs.filter((r) => !r.success).length,
        }))
        .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls),
      byUser: [...group((r) => r.userId ?? '')]
        .map(([userId, rs]) => ({ userId: userId || null, name: userId ? (names.get(userId) ?? 'Former user') : 'System', costUsd: round(rs.reduce((t, r) => t + cost(r), 0)), calls: rs.length }))
        .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls)
        .slice(0, 10),
      byModel: [...group((r) => `${r.provider}|${r.model}`)]
        .map(([k, rs]) => ({
          provider: k.split('|')[0]!,
          model: k.split('|')[1]!,
          costUsd: round(rs.reduce((t, r) => t + cost(r), 0)),
          calls: rs.length,
          inputTokens: rs.reduce((t, r) => t + r.inputTokens, 0),
          outputTokens: rs.reduce((t, r) => t + r.outputTokens, 0),
        }))
        .sort((a, b) => b.costUsd - a.costUsd),
      recentFailures: rows
        .filter((r) => !r.success)
        .slice(0, 10)
        .map((r) => ({ at: r.createdAt.toISOString(), feature: FEATURE_LABELS[r.agent] ?? AGENTS[r.agent as keyof typeof AGENTS]?.label ?? r.agent, provider: r.provider, error: r.error })),
    };
  }
}
