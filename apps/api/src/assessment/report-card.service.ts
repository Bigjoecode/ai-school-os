import { BadRequestException, Injectable } from '@nestjs/common';
import { gradeFor, type ReportCardView } from '@aischool/shared';
import { dateOnly } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { defaultTemplate } from './report-templates.controller';
import { mean, ResultsService } from './results.service';

/** Builds a student's report card for a term: for staff (any state) and families (published only). */
@Injectable()
export class ReportCardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly results: ResultsService,
    private readonly attendance: AttendanceService,
  ) {}

  async view(q: { studentId: string; termId: string }): Promise<ReportCardView> {
    const classArmId = await this.armFor(q.studentId, q.termId);
    const db = this.prisma.db;
    const [r, card, tenant, template, ratings, profile, invoices, term] = await Promise.all([
      this.results.classResults(classArmId, q.termId),
      db.reportCard.findUnique({ where: { studentId_termId: { studentId: q.studentId, termId: q.termId } } }),
      this.prisma.root.tenant.findUniqueOrThrow({
        where: { id: currentTenantId() },
        select: { name: true, motto: true, address: true, logoUrl: true, currency: true },
      }),
      defaultTemplate(this.prisma),
      db.studentTraitRating.findMany({ where: { studentId: q.studentId, termId: q.termId } }),
      db.student.findUniqueOrThrow({ where: { id: q.studentId }, select: { dateOfBirth: true, house: { select: { name: true } } } }),
      db.invoice.findMany({ where: { studentId: q.studentId, status: { not: 'CANCELLED' } }, select: { totalKobo: true, paidKobo: true } }),
      db.term.findUniqueOrThrow({ where: { id: q.termId }, select: { sessionId: true, order: true, endsOn: true } }),
    ]);
    const [nextTerm, sessionTerms] = await Promise.all([
      db.term.findFirst({ where: { startsOn: { gt: term.endsOn } }, orderBy: { startsOn: 'asc' }, select: { startsOn: true } }),
      db.term.findMany({ where: { sessionId: term.sessionId }, orderBy: { order: 'asc' }, select: { id: true, name: true, order: true } }),
    ]);
    // Cumulative cards: the same subjects' percentages in this session's earlier terms.
    const earlier = new Map<string, Map<string, number | null>>();
    if (template.columns.includes('cumulative')) {
      for (const t of sessionTerms.filter((x) => x.order < term.order)) {
        const arm = await this.armFor(q.studentId, t.id).catch(() => null);
        const res = arm ? (await this.results.classResults(arm, t.id)).results.get(q.studentId) : undefined;
        earlier.set(t.id, new Map([...(res?.entries() ?? [])].map(([subjectId, x]) => [subjectId, x.percent])));
      }
    }
    const student = r.students.find((s) => s.id === q.studentId);
    if (!student) throw new BadRequestException('This student has no results for that term');

    const subjects = r.subjects
      .filter((s) => r.results.get(student.id)?.has(s.id))
      .map((s) => {
        const res = r.results.get(student.id)!.get(s.id)!;
        const classPercents = r.students.map((st) => r.results.get(st.id)?.get(s.id)?.percent ?? null).filter((v): v is number => v !== null);
        const band = res.percent != null ? gradeFor(res.percent, r.gradingScale) : null;
        return {
          subject: s,
          scores: res.scores,
          total: res.total,
          outOf: res.outOf,
          percent: res.percent,
          complete: res.complete,
          grade: band?.grade ?? null,
          remark: band?.remark ?? null,
          position: r.subjectPositions.get(s.id)?.get(student.id) ?? null,
          classAverage: mean(classPercents),
          highest: classPercents.length ? Math.max(...classPercents) : null,
          lowest: classPercents.length ? Math.min(...classPercents) : null,
          ...(earlier.size || template.columns.includes('cumulative') ? { cumulative: cumulative(sessionTerms, term.order, earlier, s.id, res.percent) } : {}),
        };
      });

    const traitMap = (domain: string, traits: string[]) => Object.fromEntries(traits.map((t) => [t, ratings.find((x) => x.domain === domain && x.trait === t)?.rating ?? null]));
    const owed = invoices.reduce((n, i) => n + Math.max(0, i.totalKobo - i.paidKobo), 0);
    return {
      school: { name: tenant.name, motto: tenant.motto, address: tenant.address, logoUrl: tenant.logoUrl },
      student: { id: student.id, name: student.name, admissionNumber: student.admissionNumber, gender: student.gender },
      classArm: { id: r.classArm.id, name: r.classArm.name, levelName: r.classArm.levelName, classTeacher: r.classArm.classTeacher },
      term: {
        id: r.term.id,
        name: r.term.name,
        sessionName: r.term.sessionName,
        startsOn: dateOnly(r.term.startsOn)!,
        endsOn: dateOnly(r.term.endsOn)!,
      },
      components: r.components,
      gradingScale: r.gradingScale,
      subjects,
      summary: {
        subjectsTaken: subjects.length,
        totalScore: Math.round(subjects.reduce((n, s) => n + (s.total ?? 0), 0) * 10) / 10,
        average: r.averages.get(student.id) ?? null,
        position: r.positions.get(student.id) ?? null,
        classSize: r.students.length,
        classAverage: mean(r.students.map((s) => r.averages.get(s.id) ?? null)),
      },
      teacherRemark: card?.teacherRemark ?? null,
      remarkSource: card?.remarkSource ?? 'MANUAL',
      principalRemark: card?.principalRemark ?? null,
      attendance: await this.attendance.termCounts(student.id, { startsOn: r.term.startsOn, endsOn: r.term.endsOn }),
      canEditTeacherRemark: currentContext().permissions.has('results.publish') || r.classArm.classTeacherUserId === currentContext().userId,
      canEditPrincipalRemark: currentContext().permissions.has('results.publish'),
      status: card?.status ?? 'DRAFT',
      publishedAt: card?.publishedAt?.toISOString() ?? null,
      template,
      traits: { affective: traitMap('AFFECTIVE', template.affective.traits), psychomotor: traitMap('PSYCHOMOTOR', template.psychomotor.traits) },
      extra: {
        age: profile.dateOfBirth ? ageOn(profile.dateOfBirth, r.term.endsOn) : null,
        nextTermBegins: nextTerm ? dateOnly(nextTerm.startsOn) : null,
        feesOwed: owed / 100,
        currency: tenant.currency,
        termNames: sessionTerms.map((t) => t.name),
        house: profile.house?.name ?? null,
      },
    };
  }

  /** The class a student sat in for a term: where they were marked, else their current class. */
  async armFor(studentId: string, termId: string): Promise<string> {
    const [card, score, student] = await Promise.all([
      this.prisma.db.reportCard.findUnique({ where: { studentId_termId: { studentId, termId } }, select: { classArmId: true } }),
      this.prisma.db.score.findFirst({ where: { studentId, termId }, select: { classArmId: true } }),
      this.prisma.db.student.findUniqueOrThrow({ where: { id: studentId }, select: { classArmId: true } }),
    ]);
    const arm = card?.classArmId ?? score?.classArmId ?? student.classArmId;
    if (!arm) throw new BadRequestException('This student is not in a class');
    return arm;
  }
}

function ageOn(dob: Date, on: Date): number {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  if (on.getUTCMonth() < dob.getUTCMonth() || (on.getUTCMonth() === dob.getUTCMonth() && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** This subject's percentage in each term of the session so far, and their average. */
function cumulative(terms: { id: string; order: number }[], order: number, earlier: Map<string, Map<string, number | null>>, subjectId: string, now: number | null) {
  const values = terms.map((t) => (t.order === order ? now : t.order < order ? (earlier.get(t.id)?.get(subjectId) ?? null) : null));
  const taken = values.filter((v): v is number => v !== null);
  return { terms: values, average: taken.length ? Math.round((taken.reduce((a, b) => a + b, 0) / taken.length) * 10) / 10 : null };
}
