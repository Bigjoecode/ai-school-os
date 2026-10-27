import { Injectable, Logger } from '@nestjs/common';
import { isSimulatorId } from '@aischool/shared';
import { Prisma } from '../generated/prisma/client';
import { dateOnly } from '../common/format';
import { schoolNow } from '../common/school-time';
import { PrismaService } from '../prisma/prisma.service';
import { bestHandIn, handInFeedback, labLink, shouldWrite } from './practical-homework';

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

  private async sync(a: { tenantId: string; studentId: string; practicalId: string }, force: boolean) {
    const db = this.prisma.root;
    const student = await db.student.findFirst({ where: { id: a.studentId, tenantId: a.tenantId }, select: { classArmId: true } });
    if (!student?.classArmId) return 0;
    const homework = await db.homework.findMany({
      where: { tenantId: a.tenantId, classArmId: student.classArmId, practicalId: a.practicalId, kind: 'PRACTICAL', status: 'PUBLISHED' },
      include: { practical: { select: { simulator: true } } },
    });
    if (!homework.length) return 0;
    const [tenant, attempts] = await Promise.all([
      db.tenant.findUniqueOrThrow({ where: { id: a.tenantId }, select: { timezone: true } }),
      db.practicalAttempt.findMany({ where: { tenantId: a.tenantId, studentId: a.studentId, practicalId: a.practicalId, submittedAt: { not: null } }, select: { id: true, mode: true, score: true, maxScore: true, override: true, submittedAt: true } }),
    ]);
    const dayOf = (d: Date) => schoolNow(tenant.timezone, d).date;
    let written = 0;
    for (const h of homework) {
      const best = bestHandIn(attempts, isSimulatorId(h.practical?.simulator ?? null), { publishedAt: h.publishedAt, dueDate: dateOnly(h.dueDate)!, allowLate: h.allowLate }, dayOf);
      if (!best) continue;
      const where = { homeworkId_studentId: { homeworkId: h.id, studentId: a.studentId } };
      const existing = await db.homeworkSubmission.findUnique({ where, select: { status: true, score: true, links: true } });
      if (!shouldWrite(existing, best, force)) continue;
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
      await db.homeworkSubmission.upsert({ where, update: data, create: { ...data, tenantId: a.tenantId, homeworkId: h.id, studentId: a.studentId } });
      written++;
    }
    return written;
  }
}
