import { Injectable, Logger } from '@nestjs/common';
import { isSimulatorId } from '@aischool/shared';
import { Prisma } from '../generated/prisma/client';
import { dateOnly } from '../common/format';
import { schoolNow } from '../common/school-time';
import { PrismaService } from '../prisma/prisma.service';
import { bestHandIn, handInFeedback, handInNotice, labLink, shouldNotify, shouldWrite, type HandInAttempt } from './practical-homework';

const ATTEMPT = { id: true, mode: true, score: true, maxScore: true, override: true, submittedAt: true } as const;
/** Students handed in at once when a homework is published for a whole class. */
const CLASS_BATCH = 8;
type PracticalHomework = Prisma.HomeworkGetPayload<{ include: { practical: { select: { simulator: true } } } }>;

/**
 * PRACTICAL homework: when a student hands in a lab (or passes the quick
 * check of a practical with no virtual lab), their class's published
 * homework for that practical is handed in for them, GRADED with the best
 * attempt's percentage. It never adds HOMEWORK mastery evidence: the lab
 * already counts as PRACTICE evidence (see SchoolEvidenceService).
 */
@Injectable()
export class PracticalHomeworkService {
  private readonly logger = new Logger(PracticalHomeworkService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Hands in (or raises the mark of) the student's PRACTICAL homework for
   * this practical. `force`: a teacher reviewed a lab score, so the mark
   * follows it even when it goes down. Never throws: failures are logged so
   * the lab's own hand-in is never affected.
   */
  async handIn(a: { tenantId: string; studentId: string; practicalId: string }, opts: { force?: boolean } = {}): Promise<number> {
    try {
      return await this.sync(a, !!opts.force);
    } catch (err) {
      this.logger.warn(`Couldn't hand in practical homework for student ${a.studentId}, practical ${a.practicalId}: ${(err as Error).message}`);
      return 0;
    }
  }

  /**
   * A PRACTICAL homework was published (or now counts labs already done):
   * hands it in for every student in the class who has already done the
   * practical, a few students at a time. Never throws, so the publish never
   * fails because of it.
   */
  async handInClass(tenantId: string, homeworkId: string): Promise<number> {
    try {
      const db = this.prisma.root;
      const h = await db.homework.findFirst({ where: { id: homeworkId, tenantId, kind: 'PRACTICAL', status: 'PUBLISHED' }, include: { practical: { select: { simulator: true } } } });
      if (!h?.practicalId) return 0;
      const [tenant, attempts] = await Promise.all([
        db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } }),
        db.practicalAttempt.findMany({
          where: { tenantId, practicalId: h.practicalId, submittedAt: { not: null }, student: { classArmId: h.classArmId, status: 'ACTIVE' } },
          select: { ...ATTEMPT, studentId: true, student: { select: { userId: true } } },
        }),
      ]);
      const byStudent = new Map<string, { userId: string | null; attempts: HandInAttempt[] }>();
      for (const a of attempts) {
        const row = byStudent.get(a.studentId) ?? { userId: a.student.userId, attempts: [] };
        row.attempts.push(a);
        byStudent.set(a.studentId, row);
      }
      const dayOf = (d: Date) => schoolNow(tenant.timezone, d).date;
      const students = [...byStudent.entries()];
      let written = 0;
      for (let i = 0; i < students.length; i += CLASS_BATCH) {
        const done = await Promise.all(
          students.slice(i, i + CLASS_BATCH).map(([studentId, s]) =>
            this.write(h, { tenantId, studentId, userId: s.userId }, s.attempts, dayOf, false).catch((err: Error) => {
              this.logger.warn(`Couldn't hand in practical homework ${homeworkId} for student ${studentId}: ${err.message}`);
              return false;
            }),
          ),
        );
        written += done.filter(Boolean).length;
      }
      return written;
    } catch (err) {
      this.logger.warn(`Couldn't hand in practical homework ${homeworkId} for its class: ${(err as Error).message}`);
      return 0;
    }
  }

  private async sync(a: { tenantId: string; studentId: string; practicalId: string }, force: boolean) {
    const db = this.prisma.root;
    const student = await db.student.findFirst({ where: { id: a.studentId, tenantId: a.tenantId }, select: { classArmId: true, userId: true } });
    if (!student?.classArmId) return 0;
    const homework = await db.homework.findMany({
      where: { tenantId: a.tenantId, classArmId: student.classArmId, practicalId: a.practicalId, kind: 'PRACTICAL', status: 'PUBLISHED' },
      include: { practical: { select: { simulator: true } } },
    });
    if (!homework.length) return 0;
    const [tenant, attempts] = await Promise.all([
      db.tenant.findUniqueOrThrow({ where: { id: a.tenantId }, select: { timezone: true } }),
      db.practicalAttempt.findMany({ where: { tenantId: a.tenantId, studentId: a.studentId, practicalId: a.practicalId, submittedAt: { not: null } }, select: ATTEMPT }),
    ]);
    const dayOf = (d: Date) => schoolNow(tenant.timezone, d).date;
    let written = 0;
    for (const h of homework) if (await this.write(h, { tenantId: a.tenantId, studentId: a.studentId, userId: student.userId }, attempts, dayOf, force)) written++;
    return written;
  }

  /** Writes one student's hand-in of one homework from their attempts (when it's due a change), and tells them. */
  private async write(h: PracticalHomework, st: { tenantId: string; studentId: string; userId: string | null }, attempts: HandInAttempt[], dayOf: (d: Date) => string, force: boolean) {
    const db = this.prisma.root;
    const best = bestHandIn(attempts, isSimulatorId(h.practical?.simulator ?? null), { publishedAt: h.publishedAt, dueDate: dateOnly(h.dueDate)!, allowLate: h.allowLate, countEarlierLabs: h.countEarlierLabs }, dayOf);
    if (!best) return false;
    const where = { homeworkId_studentId: { homeworkId: h.id, studentId: st.studentId } };
    const existing = await db.homeworkSubmission.findUnique({ where, select: { status: true, score: true, links: true } });
    if (!shouldWrite(existing, best, force)) return false;
    const data = {
      text: null,
      files: [] as unknown as Prisma.InputJsonValue,
      links: best.mode === 'CHECK' ? [] : [labLink(best.attemptId)],
      status: 'GRADED',
      late: best.late,
      submittedAt: best.submittedAt,
      score: best.percent,
      feedback: handInFeedback(best),
      gradedById: null,
      gradedAt: new Date(),
      aiSuggestion: Prisma.DbNull,
    };
    await db.homeworkSubmission.upsert({ where, update: data, create: { ...data, tenantId: st.tenantId, homeworkId: h.id, studentId: st.studentId } });
    // Tell the student in the app (as a teacher's marking does), only when it's new or the mark moved; never fails the hand-in.
    if (st.userId && shouldNotify(existing, best)) {
      const notice = handInNotice(h.title, best);
      await db.notification
        .create({ data: { tenantId: st.tenantId, userId: st.userId, title: notice.title, body: notice.body, link: `/learning/homework/${h.id}` } })
        .catch((err: Error) => this.logger.warn(`Couldn't tell student ${st.studentId} about practical homework ${h.id}: ${err.message}`));
    }
    return true;
  }
}
