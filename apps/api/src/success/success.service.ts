import { Injectable, NotFoundException } from '@nestjs/common';
import {
  HEALTH_WINDOW_DAYS,
  INSIGHT_SOURCE_LABELS,
  TIME_SAVED_ASSUMPTIONS,
  type PlatformSuccess,
  type PlatformSuccessRow,
  type SuccessRiskCode,
  type SuccessSummary,
  type SuccessTrends,
  type SuccessWeek,
  type TimeSavedKey,
} from '@aischool/shared';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { healthFacts, healthOf } from './health';
import { addDays, dateOnlyIso, localDate, localMidnight, mondayOf } from './success-time';

const DAY = 86_400_000;
const CACHE_MS = 10 * 60_000;
const WEEKS = 8;

/**
 * Daily counts, one UNION ALL query: each line is one table, filtered to the
 * school and the period by an indexed timestamp where one exists, grouped by
 * school-local day. `v` sums a value (payment amount, practice score %).
 * Identifiers here are constants, never user input.
 */
interface DailySpec {
  key: DailyKey;
  from: string;
  ts: string;
  where?: string;
  value?: string;
}

const PARENT_UPDATE = `t."link" LIKE '/school/learning/%' AND EXISTS (SELECT 1 FROM guardians g WHERE g."tenantId" = t."tenantId" AND g."userId" = t."userId")`;

const DAILY = [
  { key: 'registers', from: 'attendance_registers t', ts: 't."takenAt"' },
  { key: 'homeworkSet', from: 'homework t', ts: 'COALESCE(t."publishedAt", t."createdAt")', where: `t."status" = 'PUBLISHED'` },
  { key: 'homeworkHandedIn', from: 'homework_submissions t', ts: 't."submittedAt"' },
  { key: 'homeworkGraded', from: 'homework_submissions t', ts: 't."gradedAt"' },
  { key: 'testsRun', from: 'online_exams t', ts: 't."opensAt"', where: `t."status" <> 'DRAFT'` },
  { key: 'testsSat', from: 'online_exam_attempts t', ts: 't."submittedAt"' },
  { key: 'lessonPlans', from: 'lesson_plans t', ts: 't."createdAt"' },
  { key: 'lessonPlansVetted', from: 'lesson_plans t', ts: 't."reviewedAt"', where: `t."reviewStatus" IN ('APPROVED', 'RETURNED')` },
  { key: 'messagesSent', from: 'deliveries t', ts: 't."sentAt"', where: `t."status" = 'SENT'` },
  { key: 'reportCardsPublished', from: 'report_cards t', ts: 't."publishedAt"' },
  { key: 'evidence', from: 'mastery_evidence t', ts: 't."createdAt"' },
  { key: 'tutorConversations', from: 'ai_conversations t', ts: 't."createdAt"', where: `t."studentId" IS NOT NULL` },
  { key: 'practiceAttempts', from: 'practice_attempts t', ts: 't."submittedAt"', where: `t."score" IS NOT NULL AND t."total" > 0`, value: 't."score" * 100.0 / t."total"' },
  { key: 'updatesSent', from: 'learning_updates t', ts: 't."sentAt"' },
  { key: 'updatesDelivered', from: 'notifications t', ts: 't."createdAt"', where: PARENT_UPDATE },
  { key: 'updatesOpened', from: 'notifications t', ts: 't."readAt"', where: PARENT_UPDATE },
  { key: 'onlinePayments', from: 'payments t', ts: 't."paidAt"', where: `t."method" = 'PAYSTACK' AND t."status" = 'SUCCESS'`, value: 't."amountKobo"' },
  {
    key: 'parentSignIns',
    from: 'audit_logs t',
    ts: 't."createdAt"',
    where: `t."action" = 'auth.login' AND EXISTS (SELECT 1 FROM guardians g WHERE g."tenantId" = t."tenantId" AND g."userId" = t."actorUserId")`,
  },
  // Teacher time saved.
  { key: 'aiLessonPlans', from: 'lesson_plans t', ts: 't."createdAt"', where: `t."source" = 'AI'` },
  { key: 'aiHomework', from: 'homework t', ts: 't."createdAt"', where: `t."source" = 'AI'` },
  { key: 'aiHomeworkMarking', from: 'homework_submissions t', ts: 't."submittedAt"', where: `t."aiSuggestion" IS NOT NULL AND t."aiSuggestion" <> 'null'::jsonb` },
  {
    key: 'autoMarkedCbt',
    from: 'online_exam_attempts t JOIN online_exams e ON e.id = t."examId" JOIN exam_paper_items i ON i."paperId" = e."paperId" JOIN questions q ON q.id = i."questionId"',
    ts: 't."submittedAt"',
    where: `q."type" IN ('MULTIPLE_CHOICE', 'TRUE_FALSE')`,
  },
] as const satisfies readonly (Omit<DailySpec, 'key'> & { key: string })[];

type DailyKey = (typeof DAILY)[number]['key'];
type DayRow = { k: DailyKey; d: string; n: number; v: number };

type ActiveKey = 'staff' | 'teachers' | 'parents' | 'students' | 'learning';
type Bucket = { k: string; from: Date; to: Date };

interface Bundle {
  at: number;
  summary: SuccessSummary;
  trends: SuccessTrends;
}

@Injectable()
export class SuccessService {
  private readonly cache = new Map<string, Bundle>();
  private platformCache: { at: number; value: PlatformSuccess } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private get root() {
    return this.prisma.root;
  }

  // ------------------------------------------------------------------ school

  async summary(tenantId: string, termId?: string): Promise<SuccessSummary> {
    return (await this.bundle(tenantId, termId)).summary;
  }

  async trends(tenantId: string, termId?: string): Promise<SuccessTrends> {
    return (await this.bundle(tenantId, termId)).trends;
  }

  /** Summary and weekly trends are computed together and cached for ten minutes. */
  private async bundle(tenantId: string, termId?: string): Promise<Bundle> {
    const key = `${tenantId}:${termId ?? ''}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit;
    const fresh = { at: Date.now(), ...(await this.compute(tenantId, termId)) };
    this.cache.set(key, fresh);
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
    return fresh;
  }

  private async compute(tenantId: string, termId?: string): Promise<Omit<Bundle, 'at'>> {
    const root = this.root;
    const tenant = await root.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, logoUrl: true, currency: true, timezone: true } });
    if (!tenant) throw new NotFoundException('School not found');
    const tz = tenant.timezone || 'Africa/Lagos';
    const now = new Date();
    const today = localDate(now, tz);

    const terms = await root.term.findMany({
      where: { tenantId },
      orderBy: { startsOn: 'desc' },
      select: { id: true, name: true, startsOn: true, endsOn: true, isCurrent: true, session: { select: { name: true } } },
    });
    let term = termId ? terms.find((t) => t.id === termId) : (terms.find((t) => t.isCurrent) ?? terms.find((t) => dateOnlyIso(t.startsOn) <= today));
    if (termId && !term) throw new NotFoundException('Term not found');

    // The term period, up to now. With no term set up, the last 12 weeks.
    const fromDate = term ? dateOnlyIso(term.startsOn) : addDays(today, -83);
    const endDate = term ? dateOnlyIso(term.endsOn) : today;
    const lastDay = endDate < today ? endDate : today;
    const rangeFrom = localMidnight(fromDate, tz);
    let rangeTo = new Date(Math.min(now.getTime(), localMidnight(addDays(endDate, 1), tz).getTime()));
    if (rangeTo < rangeFrom) rangeTo = rangeFrom;

    // The weekly series: the 8 weeks ending with the week of the period's last day.
    const lastMonday = mondayOf(lastDay < fromDate ? fromDate : lastDay);
    const mondays = Array.from({ length: WEEKS }, (_, i) => addDays(lastMonday, (i - WEEKS + 1) * 7));
    const weeksFrom = localMidnight(mondays[0]!, tz);
    const weeksTo = new Date(Math.min(localMidnight(addDays(lastMonday, 7), tz).getTime(), Math.max(now.getTime(), rangeTo.getTime())));

    const qFrom = new Date(Math.min(rangeFrom.getTime(), weeksFrom.getTime()));
    const qTo = new Date(Math.max(rangeTo.getTime(), weeksTo.getTime()));
    const sevenAgo = new Date(now.getTime() - 7 * DAY);

    const buckets: Bucket[] = [
      ...mondays.map((m) => ({ k: m, from: localMidnight(m, tz), to: localMidnight(addDays(m, 7), tz) })),
      { k: 'term', from: rangeFrom, to: rangeTo },
      { k: 'last7', from: sevenAgo, to: now },
    ];

    const [days, active, gains, bySource, facts, factsPrev, aiRemarks, optedOut, finance] = await Promise.all([
      this.daily(tenantId, tz, qFrom, qTo),
      this.active(tenantId, buckets),
      this.gains(tenantId, rangeFrom, rangeTo),
      root.masteryEvidence.groupBy({ by: ['source'], where: { tenantId, createdAt: { gte: rangeFrom, lt: rangeTo } }, _count: { _all: true } }),
      healthFacts(root, [tenantId], now),
      healthFacts(root, [tenantId], sevenAgo),
      term
        ? root.reportCard.count({ where: { tenantId, termId: term.id, remarkSource: 'AI', teacherRemark: { not: null } } })
        : Promise.resolve(0),
      root.guardian.count({ where: { tenantId, learningUpdatesOff: true } }),
      term ? this.finance(tenantId, term.id) : Promise.resolve(null),
    ]);

    // ---- roll the daily rows into the term and into weeks
    const termSum = (k: DailyKey) => sumDays(days, k, fromDate, lastDay);
    const termVal = (k: DailyKey) => sumDays(days, k, fromDate, lastDay, 'v');
    const weekSum = (k: DailyKey, monday: string, f: 'n' | 'v' = 'n') => sumDays(days, k, monday, addDays(monday, 6), f);

    const weeks: SuccessWeek[] = mondays.map((m) => {
      const a = active.get(m);
      const practice = weekSum('practiceAttempts', m);
      return {
        week: m,
        staffActive: a?.staff ?? 0,
        teachersActive: a?.teachers ?? 0,
        parentsActive: a?.parents ?? 0,
        studentsActive: a?.students ?? 0,
        registers: weekSum('registers', m),
        homeworkSet: weekSum('homeworkSet', m),
        homeworkHandedIn: weekSum('homeworkHandedIn', m),
        homeworkGraded: weekSum('homeworkGraded', m),
        testsRun: weekSum('testsRun', m),
        testsSat: weekSum('testsSat', m),
        lessonPlans: weekSum('lessonPlans', m),
        lessonPlansVetted: weekSum('lessonPlansVetted', m),
        messagesSent: weekSum('messagesSent', m),
        reportCardsPublished: weekSum('reportCardsPublished', m),
        evidence: weekSum('evidence', m),
        tutorConversations: weekSum('tutorConversations', m),
        practiceAttempts: practice,
        practiceAverage: practice ? round1(weekSum('practiceAttempts', m, 'v') / practice) : null,
        updatesSent: weekSum('updatesSent', m),
        updatesOpened: weekSum('updatesOpened', m),
        onlinePayments: weekSum('onlinePayments', m),
        onlinePaymentsKobo: Math.round(weekSum('onlinePayments', m, 'v')),
      };
    });

    // ---- practice trend: first half of the period vs second half
    const mid = addDays(fromDate, Math.floor((Date.parse(lastDay) - Date.parse(fromDate)) / DAY / 2));
    const half = (a: string, b: string) => {
      const n = sumDays(days, 'practiceAttempts', a, b);
      return n ? round1(sumDays(days, 'practiceAttempts', a, b, 'v') / n) : null;
    };
    const practiceN = termSum('practiceAttempts');

    // ---- teacher time saved
    const counts: Record<TimeSavedKey, number> = {
      aiLessonPlans: termSum('aiLessonPlans'),
      aiHomework: termSum('aiHomework'),
      aiReportRemarks: aiRemarks,
      autoMarkedCbt: termSum('autoMarkedCbt'),
      aiHomeworkMarking: termSum('aiHomeworkMarking'),
    };
    const items = TIME_SAVED_ASSUMPTIONS.map((a) => ({
      key: a.key,
      label: a.label,
      count: counts[a.key],
      minutesEach: a.minutes,
      per: a.per,
      basis: a.basis,
      minutes: Math.round(counts[a.key] * a.minutes),
    }));
    const totalMinutes = items.reduce((t, i) => t + i.minutes, 0);

    const f = facts.get(tenantId)!;
    const health = healthOf(f);
    const previous = healthOf(factsPrev.get(tenantId)!).score;
    const t = active.get('term');
    const l7 = active.get('last7');
    const total = gains.find((g) => g.subject === null);
    const delivered = termSum('updatesDelivered');
    const opened = termSum('updatesOpened');

    const summary: SuccessSummary = {
      school: { id: tenant.id, name: tenant.name, logoUrl: tenant.logoUrl },
      currency: tenant.currency,
      term: term
        ? { id: term.id, label: `${term.name}, ${term.session.name}`, startsOn: dateOnlyIso(term.startsOn), endsOn: dateOnlyIso(term.endsOn), isCurrent: term.isCurrent }
        : null,
      terms: terms.map((x) => ({ id: x.id, label: `${x.name}, ${x.session.name}`, isCurrent: x.isCurrent })),
      range: { from: fromDate, to: lastDay },
      generatedAt: now.toISOString(),
      health: { ...health, previous, windowDays: HEALTH_WINDOW_DAYS },
      population: {
        staff: f.staff,
        staffWithAccounts: f.staffWithAccounts,
        teachers: f.teachers,
        students: f.students,
        studentsWithAccounts: f.studentsWithAccounts,
        guardians: f.guardians,
        guardianAccounts: f.guardianAccounts,
        classes: f.classes,
      },
      lastWeek: { staffActive: l7?.staff ?? 0, parentsActive: l7?.parents ?? 0, studentsActive: l7?.students ?? 0, studentsLearning: l7?.learning ?? 0 },
      adoption: {
        staffActive: t?.staff ?? 0,
        teachersActive: t?.teachers ?? 0,
        parentsActive: t?.parents ?? 0,
        studentsActive: t?.students ?? 0,
        registers: termSum('registers'),
        homeworkSet: termSum('homeworkSet'),
        homeworkHandedIn: termSum('homeworkHandedIn'),
        homeworkGraded: termSum('homeworkGraded'),
        testsRun: termSum('testsRun'),
        testsSat: termSum('testsSat'),
        lessonPlans: termSum('lessonPlans'),
        lessonPlansVetted: termSum('lessonPlansVetted'),
        messagesSent: termSum('messagesSent'),
        reportCardsPublished: termSum('reportCardsPublished'),
        tutorConversations: termSum('tutorConversations'),
      },
      outcomes: {
        evidenceTotal: bySource.reduce((s, r) => s + r._count._all, 0),
        evidenceBySource: bySource
          .map((r) => ({ source: r.source, label: INSIGHT_SOURCE_LABELS[r.source] ?? r.source, count: r._count._all }))
          .sort((a, b) => b.count - a.count),
        trackedPairs: total?.pairs ?? 0,
        trackedStudents: total?.students ?? 0,
        averageGain: total?.pairs ? round1(total.gain) : null,
        startedBelow: total?.below ?? 0,
        recovered: total?.recovered ?? 0,
        recoveredShare: total?.below ? total.recovered / total.below : null,
        bySubject: gains
          .filter((g) => g.subject !== null && g.pairs > 0)
          .sort((a, b) => b.pairs - a.pairs)
          .slice(0, 8)
          .map((g) => ({ subject: g.subject!, pairs: g.pairs, averageGain: round1(g.gain), recovered: g.recovered })),
        practice: {
          attempts: practiceN,
          averageScore: practiceN ? round1(termVal('practiceAttempts') / practiceN) : null,
          firstHalfAverage: half(fromDate, mid),
          secondHalfAverage: half(addDays(mid, 1), lastDay),
        },
      },
      parents: {
        updatesSent: termSum('updatesSent'),
        inAppDelivered: delivered,
        opened,
        openRate: delivered ? Math.min(1, opened / delivered) : null,
        optedOut,
        guardians: f.guardians,
        signIns: termSum('parentSignIns'),
        onlinePayments: termSum('onlinePayments'),
        onlinePaymentsKobo: Math.round(termVal('onlinePayments')),
      },
      timeSaved: { items, totalMinutes, totalHours: Math.round(totalMinutes / 6) / 10 },
      finance,
    };
    return { summary, trends: { weeks, generatedAt: summary.generatedAt } };
  }

  /** Daily counts for every metric in DAILY, in one round trip. */
  private daily(tenantId: string, tz: string, from: Date, to: Date): Promise<DayRow[]> {
    const parts = (DAILY as readonly DailySpec[]).map((s) => {
      const ts = Prisma.raw(s.ts);
      return Prisma.sql`SELECT ${s.key}::text AS k, ((${ts}) AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date::text AS d, COUNT(*)::int AS n, COALESCE(SUM(${Prisma.raw(s.value ?? '0')}), 0)::float8 AS v
        FROM ${Prisma.raw(s.from)}
        WHERE t."tenantId" = ${tenantId} AND ${ts} >= ${from} AND ${ts} < ${to}${s.where ? Prisma.sql` AND ${Prisma.raw(s.where)}` : Prisma.empty}
        GROUP BY 2`;
    });
    return this.root.$queryRaw<DayRow[]>(Prisma.join(parts, ' UNION ALL '));
  }

  /**
   * Distinct active people per period. Staff, teachers and parents are
   * active when they sign in or keep a session going; students also when
   * they practise, use the tutor, hand in homework or sit an online test.
   * "learning" = students with new mastery evidence.
   */
  private async active(tenantId: string, buckets: Bucket[]): Promise<Map<string, Record<ActiveKey, number>>> {
    const from = new Date(Math.min(...buckets.map((b) => b.from.getTime())));
    const to = new Date(Math.max(...buckets.map((b) => b.to.getTime())));
    const values = Prisma.join(buckets.map((b) => Prisma.sql`(${b.k}::text, ${b.from}::timestamp, ${b.to}::timestamp)`));
    const rows = await this.root.$queryRaw<({ k: string } & Record<ActiveKey, number>)[]>(Prisma.sql`
      WITH b(k, f, t) AS (VALUES ${values}),
      roles AS (
        SELECT DISTINCT "userId" AS u, 'staff' AS r FROM staff WHERE "tenantId" = ${tenantId} AND "status" <> 'EXITED' AND "userId" IS NOT NULL
        UNION SELECT DISTINCT "userId", 'teacher' FROM staff WHERE "tenantId" = ${tenantId} AND "status" <> 'EXITED' AND "type" = 'TEACHING' AND "userId" IS NOT NULL
        UNION SELECT DISTINCT "userId", 'parent' FROM guardians WHERE "tenantId" = ${tenantId} AND "userId" IS NOT NULL
      ),
      ses AS (
        SELECT DISTINCT a."userId" AS u, r.r, date_trunc('hour', a."createdAt") AS ts
        FROM auth_sessions a JOIN roles r ON r.u = a."userId"
        WHERE a."tenantId" = ${tenantId} AND a."createdAt" >= ${from} AND a."createdAt" < ${to}
      ),
      sa AS (
        SELECT s.id AS sid, a."createdAt" AS ts, false AS ev FROM auth_sessions a JOIN students s ON s."userId" = a."userId" AND s."tenantId" = a."tenantId"
          WHERE a."tenantId" = ${tenantId} AND a."createdAt" >= ${from} AND a."createdAt" < ${to}
        UNION ALL SELECT "studentId", "createdAt", true FROM mastery_evidence WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${from} AND "createdAt" < ${to}
        UNION ALL SELECT "studentId", "submittedAt", false FROM homework_submissions WHERE "tenantId" = ${tenantId} AND "submittedAt" >= ${from} AND "submittedAt" < ${to}
        UNION ALL SELECT "studentId", "startedAt", false FROM online_exam_attempts WHERE "tenantId" = ${tenantId} AND "startedAt" >= ${from} AND "startedAt" < ${to}
        UNION ALL SELECT "studentId", "startedAt", false FROM practice_attempts WHERE "tenantId" = ${tenantId} AND "startedAt" >= ${from} AND "startedAt" < ${to}
        UNION ALL SELECT "studentId", "updatedAt", false FROM ai_conversations WHERE "tenantId" = ${tenantId} AND "studentId" IS NOT NULL AND "updatedAt" >= ${from} AND "updatedAt" < ${to}
      ),
      sd AS (SELECT DISTINCT sid, date_trunc('hour', ts) AS ts, ev FROM sa)
      SELECT b.k,
        (SELECT COUNT(DISTINCT u)::int FROM ses WHERE ses.r = 'staff' AND ses.ts >= date_trunc('hour', b.f) AND ses.ts < b.t) AS staff,
        (SELECT COUNT(DISTINCT u)::int FROM ses WHERE ses.r = 'teacher' AND ses.ts >= date_trunc('hour', b.f) AND ses.ts < b.t) AS teachers,
        (SELECT COUNT(DISTINCT u)::int FROM ses WHERE ses.r = 'parent' AND ses.ts >= date_trunc('hour', b.f) AND ses.ts < b.t) AS parents,
        (SELECT COUNT(DISTINCT sid)::int FROM sd WHERE sd.ts >= date_trunc('hour', b.f) AND sd.ts < b.t) AS students,
        (SELECT COUNT(DISTINCT sid)::int FROM sd WHERE sd.ev AND sd.ts >= date_trunc('hour', b.f) AND sd.ts < b.t) AS learning
      FROM b`);
    return new Map(rows.map((r) => [r.k, r]));
  }

  /**
   * Mastery change for each student–topic pair with two or more pieces of
   * evidence in the period: the mastery score after the first piece vs after
   * the latest. Per subject and overall (subject null).
   */
  private gains(tenantId: string, from: Date, to: Date) {
    return this.root.$queryRaw<{ subject: string | null; pairs: number; students: number; gain: number; below: number; recovered: number }[]>(Prisma.sql`
      WITH e AS (
        SELECT "studentId" AS s, "topicId" AS tp, "scoreAfter" AS sc,
          ROW_NUMBER() OVER (PARTITION BY "studentId", "topicId" ORDER BY "createdAt", id) AS rf,
          ROW_NUMBER() OVER (PARTITION BY "studentId", "topicId" ORDER BY "createdAt" DESC, id DESC) AS rl,
          COUNT(*) OVER (PARTITION BY "studentId", "topicId") AS c
        FROM mastery_evidence WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${from} AND "createdAt" < ${to}
      ),
      p AS (
        SELECT s, tp, MAX(sc) FILTER (WHERE rf = 1) AS f, MAX(sc) FILTER (WHERE rl = 1) AS l FROM e WHERE c >= 2 GROUP BY s, tp
      )
      SELECT st."subject" AS subject, COUNT(*)::int AS pairs, COUNT(DISTINCT p.s)::int AS students, COALESCE(AVG(p.l - p.f), 0)::float8 AS gain,
        COUNT(*) FILTER (WHERE p.f < 50)::int AS below, COUNT(*) FILTER (WHERE p.f < 50 AND p.l >= 50)::int AS recovered
      FROM p JOIN syllabus_topics st ON st.id = p.tp
      GROUP BY ROLLUP (st."subject")`);
  }

  /** Fees billed for the term vs collected, and how much came in online (Paystack). */
  private async finance(tenantId: string, termId: string): Promise<SuccessSummary['finance']> {
    const [inv, pays] = await Promise.all([
      this.root.invoice.aggregate({ where: { tenantId, termId, status: { not: 'CANCELLED' } }, _sum: { totalKobo: true, paidKobo: true } }),
      this.root.$queryRaw<{ online: boolean; kobo: number; n: number }[]>(Prisma.sql`
        SELECT (p."method" = 'PAYSTACK') AS online, COALESCE(SUM(p."amountKobo"), 0)::float8 AS kobo, COUNT(*)::int AS n
        FROM payments p JOIN invoices i ON i.id = p."invoiceId"
        WHERE p."tenantId" = ${tenantId} AND i."termId" = ${termId} AND p."status" = 'SUCCESS'
        GROUP BY 1`),
    ]);
    const billed = inv._sum.totalKobo ?? 0;
    const collected = inv._sum.paidKobo ?? 0;
    const online = pays.find((p) => p.online);
    const offline = pays.find((p) => !p.online);
    const onlineKobo = Math.round(online?.kobo ?? 0);
    const offlineKobo = Math.round(offline?.kobo ?? 0);
    return {
      billedKobo: billed,
      collectedKobo: collected,
      collectionRate: billed > 0 ? collected / billed : null,
      onlineKobo,
      offlineKobo,
      onlineShare: onlineKobo + offlineKobo > 0 ? onlineKobo / (onlineKobo + offlineKobo) : null,
      onlineCount: online?.n ?? 0,
    };
  }

  // ------------------------------------------------------------------ platform

  /** Every school side by side: health now and a week ago, adoption, last activity and risk flags. */
  async platform(): Promise<PlatformSuccess> {
    if (this.platformCache && Date.now() - this.platformCache.at < CACHE_MS) return this.platformCache.value;
    const root = this.root;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * DAY);
    const tenants = await root.tenant.findMany({
      where: { status: { in: ['TRIAL', 'ACTIVE'] } },
      select: { id: true, name: true, slug: true, status: true },
      orderBy: { name: 'asc' },
    });
    const ids = tenants.map((t) => t.id);
    const [facts, prev, last] = await Promise.all([
      healthFacts(root, ids, now),
      healthFacts(root, ids, weekAgo),
      ids.length
        ? root.$queryRaw<{ tid: string; any: Date | null; staff: Date | null }[]>(Prisma.sql`
            SELECT a."tenantId" AS tid, MAX(a."createdAt") AS any,
              MAX(a."createdAt") FILTER (WHERE EXISTS (SELECT 1 FROM staff s WHERE s."tenantId" = a."tenantId" AND s."userId" = a."userId")) AS staff
            FROM auth_sessions a WHERE a."tenantId" = ANY(${ids}::text[]) GROUP BY a."tenantId"`)
        : Promise.resolve([]),
    ]);
    const lastBy = new Map(last.map((l) => [l.tid, l]));
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

    const schools: PlatformSuccessRow[] = tenants.map((t) => {
      const f = facts.get(t.id)!;
      const h = healthOf(f);
      const before = healthOf(prev.get(t.id)!).score;
      const risks: SuccessRiskCode[] = [];
      if (f.staffActive7 === 0) risks.push('NO_STAFF_LOGINS');
      if (f.homework14 === 0 && f.tests14 === 0) risks.push('NO_HOMEWORK_TESTS');
      if (f.guardians > 0 && f.parentsActive14 / f.guardians < 0.05) risks.push('PARENTS_INACTIVE');
      if (h.score < 40) risks.push('LOW_HEALTH');
      const l = lastBy.get(t.id);
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        students: f.students,
        health: h.score,
        band: h.band,
        previous: before,
        trend: h.score - before >= 3 ? 'UP' : before - h.score >= 3 ? 'DOWN' : 'FLAT',
        staffActivePct: pct(f.staffActive14, f.staffWithAccounts),
        parentsActivePct: pct(f.parentsActive14, f.guardians),
        studentsActivePct: pct(f.studentsActive14, f.students),
        homework14d: f.homework14,
        tests14d: f.tests14,
        lastActivityAt: l?.any ? new Date(l.any).toISOString() : null,
        lastStaffActivityAt: l?.staff ? new Date(l.staff).toISOString() : null,
        risks,
      };
    });
    schools.sort((a, b) => b.risks.length - a.risks.length || a.health - b.health);
    const value: PlatformSuccess = {
      generatedAt: now.toISOString(),
      averageHealth: schools.length ? Math.round(schools.reduce((s, r) => s + r.health, 0) / schools.length) : null,
      atRisk: schools.filter((s) => s.risks.length > 0).length,
      schools,
    };
    this.platformCache = { at: Date.now(), value };
    return value;
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function sumDays(rows: DayRow[], key: DailyKey, from: string, to: string, field: 'n' | 'v' = 'n'): number {
  let t = 0;
  for (const r of rows) if (r.k === key && r.d >= from && r.d <= to) t += Number(r[field]);
  return t;
}
