import { HEALTH_UPDATES_WINDOW_DAYS, HEALTH_WINDOW_DAYS, healthScore, type HealthInputs, type HealthResult } from '@aischool/shared';
import { Prisma, type PrismaClient } from '../generated/prisma/client';

const DAY = 86_400_000;

/** What the health score and the platform risk flags are built from, for one school. */
export interface HealthFacts {
  staff: number;
  staffWithAccounts: number;
  teachers: number;
  students: number;
  studentsWithAccounts: number;
  guardians: number;
  guardianAccounts: number;
  classes: number;
  staffActive14: number;
  staffActive7: number;
  parentsActive14: number;
  studentsActive14: number;
  studentsLearning14: number;
  classesWithWork14: number;
  homework14: number;
  tests14: number;
  updatesDelivered28: number;
  updatesOpened28: number;
}

const zero = (): HealthFacts => ({
  staff: 0,
  staffWithAccounts: 0,
  teachers: 0,
  students: 0,
  studentsWithAccounts: 0,
  guardians: 0,
  guardianAccounts: 0,
  classes: 0,
  staffActive14: 0,
  staffActive7: 0,
  parentsActive14: 0,
  studentsActive14: 0,
  studentsLearning14: 0,
  classesWithWork14: 0,
  homework14: 0,
  tests14: 0,
  updatesDelivered28: 0,
  updatesOpened28: 0,
});

const share = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

/** The health score inputs (shares, 0–1) from the facts. See HEALTH_PARTS for what each means. */
export function healthInputs(f: HealthFacts): HealthInputs {
  return {
    // Denominators are people who could take part: staff with accounts, all parents, all active students.
    staffActive: share(f.staffActive14, f.staffWithAccounts),
    parentsActive: share(f.parentsActive14, f.guardians),
    studentsActive: share(f.studentsActive14, f.students),
    classesWithWork: share(f.classesWithWork14, f.classes),
    studentsLearning: share(f.studentsLearning14, f.students),
    updatesOpened: share(f.updatesOpened28, f.updatesDelivered28),
    parentAccounts: share(f.guardianAccounts, f.guardians),
  };
}

export function healthOf(f: HealthFacts): HealthResult {
  return healthScore(healthInputs(f));
}

type Row = Record<string, unknown> & { tid: string };

/**
 * Health facts for many schools at once, as they stood at `asOf`. Every
 * query is one aggregate grouped by school, so ten pilot schools cost the
 * same handful of queries as one.
 */
export async function healthFacts(db: PrismaClient, tenantIds: string[], asOf: Date): Promise<Map<string, HealthFacts>> {
  const out = new Map<string, HealthFacts>(tenantIds.map((id) => [id, zero()]));
  if (!tenantIds.length) return out;
  const w14 = new Date(asOf.getTime() - HEALTH_WINDOW_DAYS * DAY);
  const w7 = new Date(asOf.getTime() - 7 * DAY);
  const w28 = new Date(asOf.getTime() - HEALTH_UPDATES_WINDOW_DAYS * DAY);
  const ids = tenantIds;

  const [pop, sessions, students, classes, work, updates] = await Promise.all([
    db.$queryRaw<Row[]>(Prisma.sql`
      SELECT i.id AS tid,
        (SELECT COUNT(*)::int FROM staff s WHERE s."tenantId" = i.id AND s."status" <> 'EXITED') AS staff,
        (SELECT COUNT(*)::int FROM staff s WHERE s."tenantId" = i.id AND s."status" <> 'EXITED' AND s."userId" IS NOT NULL) AS "staffWithAccounts",
        (SELECT COUNT(*)::int FROM staff s WHERE s."tenantId" = i.id AND s."status" <> 'EXITED' AND s."type" = 'TEACHING') AS teachers,
        (SELECT COUNT(*)::int FROM students s WHERE s."tenantId" = i.id AND s."status" = 'ACTIVE') AS students,
        (SELECT COUNT(*)::int FROM students s WHERE s."tenantId" = i.id AND s."status" = 'ACTIVE' AND s."userId" IS NOT NULL) AS "studentsWithAccounts",
        (SELECT COUNT(*)::int FROM guardians g WHERE g."tenantId" = i.id) AS guardians,
        (SELECT COUNT(*)::int FROM guardians g WHERE g."tenantId" = i.id AND g."userId" IS NOT NULL) AS "guardianAccounts",
        (SELECT COUNT(*)::int FROM class_arms c WHERE c."tenantId" = i.id) AS classes
      FROM unnest(${ids}::text[]) AS i(id)`),
    // Signed in or refreshed a session (every 15 minutes of use) in the window.
    db.$queryRaw<Row[]>(Prisma.sql`
      WITH a AS (
        SELECT DISTINCT a."tenantId" AS tid, a."userId" AS u, a."createdAt" >= ${w7} AS recent
        FROM auth_sessions a
        WHERE a."tenantId" = ANY(${ids}::text[]) AND a."createdAt" >= ${w14} AND a."createdAt" < ${asOf}
      )
      SELECT a.tid,
        COUNT(DISTINCT a.u) FILTER (WHERE EXISTS (SELECT 1 FROM staff s WHERE s."tenantId" = a.tid AND s."userId" = a.u AND s."status" <> 'EXITED'))::int AS "staffActive14",
        COUNT(DISTINCT a.u) FILTER (WHERE a.recent AND EXISTS (SELECT 1 FROM staff s WHERE s."tenantId" = a.tid AND s."userId" = a.u AND s."status" <> 'EXITED'))::int AS "staffActive7",
        COUNT(DISTINCT a.u) FILTER (WHERE EXISTS (SELECT 1 FROM guardians g WHERE g."tenantId" = a.tid AND g."userId" = a.u))::int AS "parentsActive14"
      FROM a GROUP BY a.tid`),
    db.$queryRaw<Row[]>(Prisma.sql`
      WITH sa AS (
        SELECT s."tenantId" AS tid, s.id AS sid, false AS ev FROM auth_sessions a JOIN students s ON s."userId" = a."userId" AND s."tenantId" = a."tenantId"
          WHERE a."tenantId" = ANY(${ids}::text[]) AND a."createdAt" >= ${w14} AND a."createdAt" < ${asOf}
        UNION ALL SELECT "tenantId", "studentId", true FROM mastery_evidence WHERE "tenantId" = ANY(${ids}::text[]) AND "createdAt" >= ${w14} AND "createdAt" < ${asOf}
        UNION ALL SELECT "tenantId", "studentId", false FROM homework_submissions WHERE "tenantId" = ANY(${ids}::text[]) AND "submittedAt" >= ${w14} AND "submittedAt" < ${asOf}
        UNION ALL SELECT "tenantId", "studentId", false FROM online_exam_attempts WHERE "tenantId" = ANY(${ids}::text[]) AND "startedAt" >= ${w14} AND "startedAt" < ${asOf}
        UNION ALL SELECT "tenantId", "studentId", false FROM practice_attempts WHERE "tenantId" = ANY(${ids}::text[]) AND "startedAt" >= ${w14} AND "startedAt" < ${asOf}
        UNION ALL SELECT "tenantId", "studentId", false FROM ai_conversations WHERE "tenantId" = ANY(${ids}::text[]) AND "studentId" IS NOT NULL AND "updatedAt" >= ${w14} AND "updatedAt" < ${asOf}
      )
      SELECT sa.tid, COUNT(DISTINCT sa.sid)::int AS "studentsActive14", COUNT(DISTINCT sa.sid) FILTER (WHERE sa.ev)::int AS "studentsLearning14"
      FROM sa JOIN students s ON s.id = sa.sid AND s."status" = 'ACTIVE' GROUP BY sa.tid`),
    db.$queryRaw<Row[]>(Prisma.sql`
      SELECT x.tid, COUNT(DISTINCT x.arm)::int AS "classesWithWork14" FROM (
        SELECT "tenantId" AS tid, "classArmId" AS arm FROM homework
          WHERE "tenantId" = ANY(${ids}::text[]) AND "status" = 'PUBLISHED' AND COALESCE("publishedAt", "createdAt") >= ${w14} AND COALESCE("publishedAt", "createdAt") < ${asOf}
        UNION ALL SELECT "tenantId", unnest("classArmIds") FROM online_exams
          WHERE "tenantId" = ANY(${ids}::text[]) AND "status" <> 'DRAFT' AND "opensAt" >= ${w14} AND "opensAt" < ${asOf}
      ) x GROUP BY x.tid`),
    db.$queryRaw<Row[]>(Prisma.sql`
      SELECT i.id AS tid,
        (SELECT COUNT(*)::int FROM homework h WHERE h."tenantId" = i.id AND h."status" = 'PUBLISHED' AND COALESCE(h."publishedAt", h."createdAt") >= ${w14} AND COALESCE(h."publishedAt", h."createdAt") < ${asOf}) AS homework14,
        (SELECT COUNT(*)::int FROM online_exams e WHERE e."tenantId" = i.id AND e."status" <> 'DRAFT' AND e."opensAt" >= ${w14} AND e."opensAt" < ${asOf}) AS tests14
      FROM unnest(${ids}::text[]) AS i(id)`),
    // Weekly learning updates delivered in-app to parents, and how many they opened.
    db.$queryRaw<Row[]>(Prisma.sql`
      SELECT n."tenantId" AS tid, COUNT(*)::int AS "updatesDelivered28", COUNT(*) FILTER (WHERE n."readAt" IS NOT NULL AND n."readAt" < ${asOf})::int AS "updatesOpened28"
      FROM notifications n
      WHERE n."tenantId" = ANY(${ids}::text[]) AND n."createdAt" >= ${w28} AND n."createdAt" < ${asOf} AND n."link" LIKE '/school/learning/%'
        AND EXISTS (SELECT 1 FROM guardians g WHERE g."tenantId" = n."tenantId" AND g."userId" = n."userId")
      GROUP BY n."tenantId"`),
  ]);

  for (const rows of [pop, sessions, students, classes, work, updates]) {
    for (const r of rows) {
      const f = out.get(r.tid);
      if (!f) continue;
      for (const [k, v] of Object.entries(r)) if (k !== 'tid' && k in f) (f as unknown as Record<string, number>)[k] = Number(v ?? 0);
    }
  }
  return out;
}
