import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  SEED_MAX,
  SIMULATORS,
  gradeFor,
  isSimulatorId,
  labWord,
  rubricTotal,
  type CbtScorePreview,
  type CbtSendScoresResult,
  type CbtShowResults,
  type CbtExamStatus,
  type CriterionScore,
  type PracticalAssessmentKind,
  type PracticalAssessmentOptions,
  type PracticalAssessmentPick,
  type PracticalAssessmentResults,
  type PracticalAssessmentRow,
  type PracticalAssessmentSummary,
  type PracticalAttemptView,
  type PracticalMyAssessment,
} from '@aischool/shared';
import { randomInt } from 'node:crypto';
import type { z } from 'zod';
import type { createPracticalAssessmentSchema, updatePracticalAssessmentSchema } from '@aischool/shared';
import type { PracticalAssessment, Student } from '../generated/prisma/client';
import { AssessmentSettingsService } from '../assessment/assessment-settings.service';
import { ScoreSheetService } from '../assessment/score-sheet.service';
import { AuditService } from '../audit/audit.service';
import { attemptDeadline, phaseOf, windowError } from '../cbt/cbt-rules';
import { CbtService, type StaffScope } from '../cbt/cbt.service';
import { fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { registerTickTask } from '../common/tick-tasks';
import { subjectKey } from '../learning/mastery.service';
import { PrismaService } from '../prisma/prisma.service';
import { lockedChanges, overdue, sameMinute, sittingStatus, startDecision, studentView, timeTakenSeconds } from './practical-assessment';
import { LAB_GRACE_MS, PracticalsService, effectiveScore, percentOf, practicalNotice } from './practicals.service';

type CreateBody = z.output<typeof createPracticalAssessmentSchema>;
type UpdateBody = z.output<typeof updatePracticalAssessmentSchema>;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Practical assessments: a teacher schedules a Practical Academy virtual lab
 * as a timed class test (the guided lab) or exam (the lab's exam mode) for
 * class arms, inside a window, with an optional access code. Each student
 * sits it once on a fresh variant; the lab marks it as usual (teachers can
 * review a mark), sittings left running are handed in when time is up, and
 * the marks can be released to students and copied into a result component
 * of the score sheet, scaled to its maximum (the same path as online exams).
 *
 * Access follows online exams: assessment.read to see, assessment.manage to
 * set and run, for the classes and subject the teacher teaches (or leads);
 * academic managers see every class. Practicals without a virtual lab can't
 * be scheduled (they are set as homework, where the quick check hands in).
 */
@Injectable()
export class PracticalAssessmentsService implements OnModuleInit {
  private readonly logger = new Logger(PracticalAssessmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cbt: CbtService,
    private readonly settings: AssessmentSettingsService,
    private readonly scoreSheet: ScoreSheetService,
    private readonly practicals: PracticalsService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    registerTickTask('practicalTestsAutoSubmitted', () => this.sweep());
  }

  // ---------------------------------------------------------- the form

  /** Subjects with virtual labs and the classes this user may set them for, terms, and result components. */
  async options(): Promise<PracticalAssessmentOptions> {
    const db = this.prisma.db;
    const [scope, labSubjects, subjects, classSubjects, arms, terms, { components }] = await Promise.all([
      this.cbt.staffScope(),
      this.prisma.root.practicalLesson.findMany({ where: { simulator: { not: null } }, select: { subject: true }, distinct: ['subject'] }),
      db.subject.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      db.classSubject.findMany({ select: { classArmId: true, subjectId: true } }),
      db.classArm.findMany({ include: { classLevel: { select: { name: true } } } }),
      db.term.findMany({ include: { session: { select: { name: true, startsOn: true } } }, orderBy: [{ session: { startsOn: 'desc' } }, { order: 'asc' }], take: 12 }),
      this.settings.get(),
    ]);
    const keys = new Set(labSubjects.map((l) => l.subject));
    const armBy = new Map(arms.map((a) => [a.id, a]));
    return {
      subjects: subjects
        .filter((s) => keys.has(subjectKey(s.name)))
        .map((s) => ({
          id: s.id,
          name: s.name,
          practicalSubject: subjectKey(s.name),
          classArms: classSubjects
            .filter((cs) => cs.subjectId === s.id && this.cbt.teachesArm(scope, cs.classArmId, s.id))
            .map((cs) => armBy.get(cs.classArmId))
            .filter((a) => !!a)
            .map((a) => ({ id: a.id, name: `${a.classLevel.name} ${a.name}` }))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
        }))
        .filter((s) => s.classArms.length),
      terms: terms.map((t) => ({ id: t.id, name: t.name, sessionName: t.session.name, current: t.isCurrent })),
      components: components.map((c) => ({ key: c.key, name: c.name, maxScore: c.maxScore })),
    };
  }

  /** The subject's practicals that have a virtual lab, with the lab's marks and its usual exam time. */
  async picks(subjectId: string): Promise<PracticalAssessmentPick[]> {
    const subject = await this.prisma.db.subject.findUnique({ where: { id: subjectId }, select: { name: true } });
    if (!subject) throw new NotFoundException('Subject not found');
    const lessons = await this.practicals.lessons({ subject: subjectKey(subject.name), simulator: { not: null } });
    return lessons.flatMap((l) => {
      if (!isSimulatorId(l.simulator)) return [];
      const spec = SIMULATORS[l.simulator];
      return [{ id: l.id, title: l.title, topic: l.topic?.name ?? l.topicName, simulatorId: spec.id, maxScore: rubricTotal(spec.rubric), minutes: spec.minutes }];
    });
  }

  // ---------------------------------------------------------- staff: scheduling

  async list(): Promise<PracticalAssessmentSummary[]> {
    const scope = await this.cbt.staffScope();
    const rows = await this.prisma.db.practicalAssessment.findMany({ orderBy: { opensAt: 'desc' }, take: 300 });
    return this.summaries(rows.filter((r) => this.cbt.canSee(scope, r, r.subjectId)), scope);
  }

  async create(body: CreateBody): Promise<PracticalAssessmentSummary> {
    const scope = await this.cbt.staffScope();
    await this.checkLesson(body.practicalId, body.subjectId);
    await this.checkArms(body.classArmIds, body.subjectId, scope);
    await this.checkTermAndComponent(body.termId, body.componentKey);
    this.checkWindow(body.opensAt, body.closesAt, body.durationMinutes, body.publish);
    const { publish, ...fields } = body;
    const row = await this.prisma.db.practicalAssessment.create({
      data: {
        ...fields,
        classArmIds: [...new Set(fields.classArmIds)],
        opensAt: new Date(fields.opensAt),
        closesAt: new Date(fields.closesAt),
        tenantId: currentTenantId(),
        status: publish ? 'SCHEDULED' : 'DRAFT',
        createdById: scope.userId,
      },
    });
    await this.audit.log({ action: 'practical_test.created', entityType: 'PracticalAssessment', entityId: row.id, summary: `${publish ? 'Scheduled' : 'Drafted'} practical test "${row.title}"` });
    if (publish) await this.announce(row);
    return (await this.summaries([row], scope))[0]!;
  }

  async update(id: string, input: UpdateBody): Promise<PracticalAssessmentSummary> {
    const { row, scope } = await this.staffItem(id, 'manage');
    // Times the form sends back unchanged aren't edits: fixing the title or marks target of an ended test must still work.
    const body = { ...input };
    if (body.closesAt && sameMinute(new Date(body.closesAt), row.closesAt)) delete body.closesAt;
    if (body.opensAt && sameMinute(new Date(body.opensAt), row.opensAt)) delete body.opensAt;
    const started = await this.prisma.db.practicalAttempt.count({ where: { assessmentId: id } });
    if (started) {
      // Once anyone has started, only what can't disadvantage a sitter may change.
      if (lockedChanges(body).length) throw new BadRequestException('Students have already started: you can only change the title, the closing time, the access code, how results are shown and where the marks go');
      if (body.closesAt && new Date(body.closesAt) < new Date()) throw new BadRequestException('The new closing time has already passed');
    } else {
      if (body.classArmIds) await this.checkArms(body.classArmIds, row.subjectId, scope);
      this.checkWindow(body.opensAt ?? row.opensAt.toISOString(), body.closesAt ?? row.closesAt.toISOString(), body.durationMinutes ?? row.durationMinutes, row.status === 'SCHEDULED');
    }
    if (body.closesAt && new Date(body.closesAt) <= (body.opensAt ? new Date(body.opensAt) : row.opensAt)) throw new BadRequestException('The closing time must be after the opening time');
    if (body.termId !== undefined || body.componentKey !== undefined) await this.checkTermAndComponent(body.termId ?? row.termId, body.componentKey === undefined ? row.componentKey : body.componentKey);
    const updated = await this.prisma.db.practicalAssessment.update({
      where: { id },
      data: {
        ...body,
        ...(body.classArmIds ? { classArmIds: [...new Set(body.classArmIds)] } : {}),
        ...(body.opensAt ? { opensAt: new Date(body.opensAt) } : {}),
        ...(body.closesAt ? { closesAt: new Date(body.closesAt) } : {}),
        // Re-opening a closed test by moving its closing time later.
        ...(body.closesAt && row.status === 'CLOSED' && new Date(body.closesAt) > new Date() ? { status: 'SCHEDULED' } : {}),
      },
    });
    // A new closing time moves the deadline of anyone still sitting (never past their own duration).
    if (body.closesAt && started) {
      const live = await this.prisma.db.practicalAttempt.findMany({ where: { assessmentId: id, submittedAt: null } });
      for (const a of live) {
        const endsAt = attemptDeadline(a.startedAt, updated.durationMinutes, updated.closesAt);
        if (endsAt.getTime() !== a.endsAt?.getTime()) await this.prisma.db.practicalAttempt.update({ where: { id: a.id }, data: { endsAt } });
      }
    }
    await this.audit.log({ action: 'practical_test.updated', entityType: 'PracticalAssessment', entityId: id, summary: `Updated practical test "${updated.title}"` });
    return (await this.summaries([updated], scope))[0]!;
  }

  async publish(id: string): Promise<PracticalAssessmentSummary> {
    const { row, scope } = await this.staffItem(id, 'manage');
    if (row.status !== 'DRAFT') throw new BadRequestException('This practical test is already scheduled');
    await this.checkLesson(row.practicalId, row.subjectId);
    this.checkWindow(row.opensAt.toISOString(), row.closesAt.toISOString(), row.durationMinutes, true);
    const updated = await this.prisma.db.practicalAssessment.update({ where: { id }, data: { status: 'SCHEDULED' } });
    await this.audit.log({ action: 'practical_test.scheduled', entityType: 'PracticalAssessment', entityId: id, summary: `Scheduled practical test "${row.title}"` });
    await this.announce(updated);
    return (await this.summaries([updated], scope))[0]!;
  }

  async unpublish(id: string): Promise<PracticalAssessmentSummary> {
    const { row, scope } = await this.staffItem(id, 'manage');
    if (await this.prisma.db.practicalAttempt.count({ where: { assessmentId: id } })) throw new BadRequestException('Students have already started. Close it instead.');
    const updated = await this.prisma.db.practicalAssessment.update({ where: { id }, data: { status: 'DRAFT' } });
    await this.audit.log({ action: 'practical_test.unscheduled', entityType: 'PracticalAssessment', entityId: id, summary: `Moved practical test "${row.title}" back to draft` });
    return (await this.summaries([updated], scope))[0]!;
  }

  /** Ends it now: anyone still in the lab is handed in with what they have saved. */
  async close(id: string): Promise<PracticalAssessmentSummary> {
    const { row, scope } = await this.staffItem(id, 'manage');
    if (row.status === 'DRAFT') throw new BadRequestException('This practical test was never scheduled');
    const now = new Date();
    const updated = await this.prisma.db.practicalAssessment.update({ where: { id }, data: { status: 'CLOSED', ...(row.closesAt > now ? { closesAt: now } : {}) } });
    const live = await this.prisma.db.practicalAttempt.findMany({ where: { assessmentId: id, submittedAt: null } });
    let n = 0;
    for (const a of live) if (await this.practicals.handInSaved(a)) n++;
    await this.audit.log({ action: 'practical_test.closed', entityType: 'PracticalAssessment', entityId: id, summary: `Closed practical test "${row.title}"${n ? ` (${n} handed in automatically)` : ''}` });
    return (await this.summaries([updated], scope))[0]!;
  }

  async release(id: string, released: boolean): Promise<PracticalAssessmentSummary> {
    const { row, scope } = await this.staffItem(id, 'manage');
    const updated = await this.prisma.db.practicalAssessment.update({ where: { id }, data: { resultsReleasedAt: released ? (row.resultsReleasedAt ?? new Date()) : null } });
    await this.audit.log({ action: released ? 'practical_test.released' : 'practical_test.unreleased', entityType: 'PracticalAssessment', entityId: id, summary: `${released ? 'Released' : 'Withdrew'} results of practical test "${row.title}"` });
    if (released && !row.resultsReleasedAt) {
      const sat = await this.prisma.db.practicalAttempt.findMany({ where: { assessmentId: id, submittedAt: { not: null } }, select: { id: true, studentId: true } });
      // Parents too; with results straight after handing in they were told then, and aren't told twice.
      if (row.showResults !== 'IMMEDIATE') await this.cbt.notifyGuardians(currentTenantId(), updated, sat.map((s) => s.studentId), practicalNotice(id));
      await this.notify(
        sat.map((s) => s.studentId),
        `Results are out: ${row.title}`,
        'Open your practical test to see your marks on each part.',
        new Map(sat.map((s) => [s.studentId, `/learn/practicals/labs/${s.id}`])),
      );
    }
    return (await this.summaries([updated], scope))[0]!;
  }

  async remove(id: string) {
    const { row } = await this.staffItem(id, 'manage');
    if (await this.prisma.db.practicalAttempt.count({ where: { assessmentId: id } })) throw new BadRequestException('Students have sat this practical test, so it can’t be deleted. Close it instead.');
    await this.prisma.db.practicalAssessment.delete({ where: { id } });
    await this.audit.log({ action: 'practical_test.deleted', entityType: 'PracticalAssessment', entityId: id, summary: `Deleted practical test "${row.title}"` });
  }

  // ---------------------------------------------------------- staff: results and the score sheet

  async results(id: string): Promise<PracticalAssessmentResults> {
    const { row, scope } = await this.staffItem(id);
    const db = this.prisma.db;
    const lesson = await this.practicals.lesson(row.practicalId).catch(() => null);
    const spec = lesson && isSimulatorId(lesson.simulator) ? SIMULATORS[lesson.simulator] : null;
    const [summary, attempts, enrolled, { gradingScale }] = await Promise.all([
      this.summaries([row], scope),
      db.practicalAttempt.findMany({ where: { assessmentId: id } }),
      db.student.findMany({ where: { classArmId: { in: row.classArmIds }, status: 'ACTIVE' }, select: { id: true } }),
      this.settings.get(),
    ]);
    const ids = [...new Set([...enrolled.map((s) => s.id), ...attempts.map((a) => a.studentId)])];
    const students = await db.student.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, admissionNumber: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } },
    });
    const byStudent = new Map(attempts.map((a) => [a.studentId, a]));
    const maxScore = spec ? rubricTotal(spec.rubric) : (attempts[0]?.maxScore ?? 0);
    const rows: PracticalAssessmentRow[] = students
      .map((s) => {
        const a = byStudent.get(s.id) ?? null;
        const status = sittingStatus(a);
        const criteria = ((a?.submittedAt ? (a.scores as unknown as CriterionScore[] | null) : null) ?? []).map((c) => ({ id: c.id, awarded: c.awarded, max: c.max, how: c.how }));
        const score = a?.submittedAt ? effectiveScore(a) : null;
        return {
          student: { id: s.id, name: fullName(s), admissionNumber: s.admissionNumber, classArm: s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}` : null },
          attemptId: a?.id ?? null,
          status,
          startedAt: a?.startedAt.toISOString() ?? null,
          endsAt: a?.endsAt?.toISOString() ?? null,
          submittedAt: a?.submittedAt?.toISOString() ?? null,
          score,
          markedScore: a?.submittedAt ? a.score : null,
          maxScore: a?.maxScore ?? maxScore,
          percent: a?.submittedAt ? percentOf(score, a.maxScore) : null,
          reviewed: !!a?.override,
          criteria,
          timeTakenSeconds: a ? timeTakenSeconds(a) : null,
          focusLosses: a?.focusLosses ?? 0,
          lastSeenAt: a?.lastSeenAt?.toISOString() ?? null,
          ip: a?.ip ?? null,
        };
      })
      .sort((x, y) => (x.student.classArm ?? '').localeCompare(y.student.classArm ?? '') || x.student.name.localeCompare(y.student.name));
    const percents = rows.map((r) => r.percent).filter((p): p is number => p != null);
    return {
      assessment: summary[0]!,
      serverNow: new Date().toISOString(),
      criteria: spec ? spec.rubric.map((c) => ({ id: c.id, label: c.label, max: c.marks, how: c.how })) : [],
      summary: {
        sat: rows.filter((r) => r.status === 'SUBMITTED').length,
        average: percents.length ? round1(percents.reduce((a, b) => a + b, 0) / percents.length) : null,
        highest: percents.length ? Math.max(...percents) : null,
        lowest: percents.length ? Math.min(...percents) : null,
        passRate: percents.length ? round1((percents.filter((p) => gradeFor(p, gradingScale).pass).length / percents.length) * 100) : null,
      },
      rows,
    };
  }

  async csv(id: string): Promise<string> {
    const r = await this.results(id);
    const cell = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const mins = (s: number | null) => (s == null ? '' : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`);
    const head = ['Student', 'Admission no.', 'Class', 'Status', 'Score', 'Out of', '%', 'Reviewed', ...r.criteria.map((c) => `${c.label} (/${c.max}${c.how === 'AI' ? ', AI-marked' : ''})`), 'Time taken', ...(r.assessment.kind === 'EXAM' ? ['Focus losses'] : []), 'Started', 'Handed in'];
    const lines = r.rows.map((x) =>
      [
        x.student.name,
        x.student.admissionNumber,
        x.student.classArm,
        x.status.replace('_', ' ').toLowerCase(),
        x.score,
        x.maxScore,
        x.percent,
        x.reviewed ? 'yes' : '',
        ...r.criteria.map((c) => x.criteria.find((k) => k.id === c.id)?.awarded ?? ''),
        mins(x.timeTakenSeconds),
        ...(r.assessment.kind === 'EXAM' ? [x.focusLosses] : []),
        x.startedAt,
        x.submittedAt,
      ]
        .map(cell)
        .join(','),
    );
    // A BOM so Excel opens the file as UTF-8.
    return `﻿${[head.map(cell).join(','), ...lines].join('\r\n')}\r\n`;
  }

  async scoresPreview(id: string): Promise<CbtScorePreview> {
    const { row } = await this.staffItem(id, 'manage');
    return this.scoreSheet.preview(this.scoreTarget(row), await this.scoreEntries(row));
  }

  async sendScores(id: string, overwriteStudentIds: string[]): Promise<CbtSendScoresResult> {
    const { row } = await this.staffItem(id, 'manage');
    return this.scoreSheet.send(this.scoreTarget(row), await this.scoreEntries(row), overwriteStudentIds, { entityType: 'PracticalAssessment', entityId: row.id, label: `practical test "${row.title}"` });
  }

  private scoreTarget(row: PracticalAssessment) {
    if (!row.componentKey) throw new BadRequestException('Choose which result component this practical test counts towards first (edit it)');
    return { subjectId: row.subjectId, termId: row.termId, componentKey: row.componentKey };
  }

  /** Every sitting: handed-in ones with the score that counts (after any review), out of the lab's marks. */
  private async scoreEntries(row: PracticalAssessment) {
    const attempts = await this.prisma.db.practicalAttempt.findMany({ where: { assessmentId: row.id } });
    return attempts.map((a) => ({ studentId: a.studentId, score: a.submittedAt ? effectiveScore(a) : null, total: a.maxScore }));
  }

  // ---------------------------------------------------------- students

  private async me(): Promise<Student> {
    const me = await this.prisma.db.student.findFirst({ where: { userId: currentContext().userId, status: 'ACTIVE' } });
    if (!me) throw new ForbiddenException('Only students sit practical tests');
    return me;
  }

  async mine(): Promise<PracticalMyAssessment[]> {
    const me = await this.me();
    const db = this.prisma.db;
    const attempts = await db.practicalAttempt.findMany({ where: { studentId: me.id, assessmentId: { not: null } } });
    const rows = await db.practicalAssessment.findMany({
      where: { status: { not: 'DRAFT' }, OR: [{ classArmIds: { has: me.classArmId ?? '__none__' } }, { id: { in: attempts.map((a) => a.assessmentId!) } }] },
      orderBy: { opensAt: 'asc' },
      take: 100,
    });
    const [lessons, subjects] = await Promise.all([
      this.prisma.root.practicalLesson.findMany({ where: { id: { in: rows.map((r) => r.practicalId) } }, select: { id: true, title: true } }),
      db.subject.findMany({ where: { id: { in: rows.map((r) => r.subjectId) } }, select: { id: true, name: true } }),
    ]);
    const out: PracticalMyAssessment[] = [];
    for (const r of rows) {
      let a = attempts.find((x) => x.assessmentId === r.id) ?? null;
      // Time ran out with nobody handing in: hand it in now (the minute sweep would too).
      if (a && overdue(a, LAB_GRACE_MS) && (await this.practicals.handInSaved(a))) a = await db.practicalAttempt.findUnique({ where: { id: a.id } });
      const seen = studentView(r, a);
      const score = a?.submittedAt && seen.score ? effectiveScore(a) : null;
      out.push({
        id: r.id,
        title: r.title,
        kind: r.kind as PracticalAssessmentKind,
        subject: subjects.find((s) => s.id === r.subjectId)?.name ?? '',
        practicalTitle: lessons.find((l) => l.id === r.practicalId)?.title ?? 'Practical',
        phase: phaseOf(r),
        opensAt: r.opensAt.toISOString(),
        closesAt: r.closesAt.toISOString(),
        durationMinutes: r.durationMinutes,
        needsAccessCode: !!r.accessCode,
        attempt: a ? { id: a.id, endsAt: a.endsAt?.toISOString() ?? null, submittedAt: a.submittedAt?.toISOString() ?? null } : null,
        result: a && score != null ? { score, maxScore: a.maxScore, percent: percentOf(score, a.maxScore) ?? 0 } : null,
        resultNote: seen.note,
      });
    }
    return out;
  }

  /** Opens the student's one sitting: a fresh variant in the lab's exam (or guided) mode, on the test's clock. */
  async start(id: string, accessCode: string | null | undefined): Promise<PracticalAttemptView> {
    const me = await this.me();
    const db = this.prisma.db;
    const row = await db.practicalAssessment.findFirst({ where: { id, status: { not: 'DRAFT' } } });
    const existing = row ? await db.practicalAttempt.findUnique({ where: { assessmentId_studentId: { assessmentId: id, studentId: me.id } } }) : null;
    if (!row || (!existing && !row.classArmIds.includes(me.classArmId ?? ''))) throw new NotFoundException('Practical test not found');
    const lesson = await this.practicals.lesson(row.practicalId);
    const decision = startDecision(row, existing, accessCode);
    if (decision.action === 'RESUME') {
      // Time ran out while they were away: hand it in now rather than reopen the lab (the minute sweep would too).
      if (existing && overdue(existing, LAB_GRACE_MS) && (await this.practicals.handInSaved(existing))) return this.practicals.view(await db.practicalAttempt.findUniqueOrThrow({ where: { id: existing.id } }), lesson);
      return this.practicals.view(existing!, lesson);
    }
    if (decision.action === 'REFUSE') {
      throw new BadRequestException({ statusCode: 400, code: decision.code, message: decision.message, ...(decision.code === 'ACCESS_CODE' ? { errors: [{ path: 'accessCode', message: 'Wrong access code' }] } : {}) });
    }
    if (!isSimulatorId(lesson.simulator)) throw new BadRequestException('This practical has no virtual lab. Tell your teacher.');
    const spec = SIMULATORS[lesson.simulator];
    try {
      const a = await db.practicalAttempt.create({
        data: {
          tenantId: currentTenantId(),
          studentId: me.id,
          practicalId: lesson.id,
          simulatorId: spec.id,
          seed: randomInt(1, SEED_MAX),
          mode: decision.mode,
          state: {},
          maxScore: rubricTotal(spec.rubric),
          startedAt: decision.startedAt,
          endsAt: decision.endsAt,
          assessmentId: row.id,
          ip: currentContext().ip?.slice(0, 64) ?? null,
        },
      });
      return this.practicals.view(a, lesson);
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      // Two taps at once: the other request created it.
      const a = await db.practicalAttempt.findUniqueOrThrow({ where: { assessmentId_studentId: { assessmentId: id, studentId: me.id } } });
      return this.practicals.view(a, lesson);
    }
  }

  // ---------------------------------------------------------- the time-up sweep

  /** Hands in every sitting whose clock (plus grace) ran out with the student gone, across schools. */
  async sweep(): Promise<number> {
    const due = await this.prisma.root.practicalAttempt.findMany({ where: { assessmentId: { not: null }, submittedAt: null, endsAt: { lt: new Date(Date.now() - LAB_GRACE_MS) } }, take: 200 });
    let n = 0;
    for (const a of due) {
      try {
        if (await this.practicals.handInSaved(a)) n++;
      } catch (err) {
        this.logger.warn(`Couldn't hand in practical test sitting ${a.id}: ${(err as Error).message}`);
      }
    }
    if (n) this.logger.log(`Handed in ${n} practical test sitting(s) whose time ran out`);
    return n;
  }

  // ---------------------------------------------------------- helpers

  /** The assessment, for a member of staff allowed to see it (or manage it). */
  private async staffItem(id: string, need: 'see' | 'manage' = 'see') {
    const row = await this.prisma.db.practicalAssessment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Practical test not found');
    const scope = await this.cbt.staffScope();
    if (!this.cbt.canSee(scope, row, row.subjectId)) throw new NotFoundException('Practical test not found');
    if (need === 'manage' && !this.cbt.canManage(scope, row, row.subjectId)) throw new ForbiddenException('Only the teacher of these classes (or an academic manager) can do that');
    return { row, scope };
  }

  private async summaries(rows: PracticalAssessment[], scope: StaffScope): Promise<PracticalAssessmentSummary[]> {
    if (!rows.length) return [];
    const db = this.prisma.db;
    const armIds = [...new Set(rows.flatMap((r) => r.classArmIds))];
    const [lessons, subjects, terms, arms, perArm, attempts, { components }] = await Promise.all([
      this.prisma.root.practicalLesson.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.practicalId))] } }, select: { id: true, title: true, simulator: true } }),
      db.subject.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.subjectId))] } }, select: { id: true, name: true } }),
      db.term.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.termId))] } }, include: { session: { select: { name: true } } } }),
      db.classArm.findMany({ where: { id: { in: armIds } }, include: { classLevel: { select: { name: true } } } }),
      db.student.groupBy({ by: ['classArmId'], where: { classArmId: { in: armIds }, status: 'ACTIVE' }, _count: { _all: true } }),
      db.practicalAttempt.findMany({ where: { assessmentId: { in: rows.map((r) => r.id) } }, select: { assessmentId: true, submittedAt: true } }),
      this.settings.get(),
    ]);
    const armBy = new Map(arms.map((a) => [a.id, a]));
    const countBy = new Map(perArm.map((p) => [p.classArmId, p._count._all]));
    return rows.map((r) => {
      const l = lessons.find((x) => x.id === r.practicalId);
      const sim = l && isSimulatorId(l.simulator) ? SIMULATORS[l.simulator] : null;
      const t = terms.find((x) => x.id === r.termId);
      const mine = attempts.filter((a) => a.assessmentId === r.id);
      const submitted = mine.filter((a) => a.submittedAt).length;
      const canManage = this.cbt.canManage(scope, r, r.subjectId);
      return {
        id: r.id,
        title: r.title,
        kind: r.kind as PracticalAssessmentKind,
        status: r.status as CbtExamStatus,
        phase: phaseOf(r),
        practical: { id: r.practicalId, title: l?.title ?? 'Practical', simulatorId: sim?.id ?? null, maxScore: sim ? rubricTotal(sim.rubric) : 0 },
        subject: subjects.find((s) => s.id === r.subjectId) ?? { id: r.subjectId, name: 'Subject' },
        term: t ? { id: t.id, name: t.name, sessionName: t.session.name } : null,
        component: components.find((c) => c.key === r.componentKey) ?? null,
        classArms: r.classArmIds.map((id) => armBy.get(id)).filter((a) => !!a).map((a) => ({ id: a.id, name: `${a.classLevel.name} ${a.name}` })),
        opensAt: r.opensAt.toISOString(),
        closesAt: r.closesAt.toISOString(),
        durationMinutes: r.durationMinutes,
        showResults: r.showResults as CbtShowResults,
        accessCode: canManage ? r.accessCode : r.accessCode ? '••••' : null,
        resultsReleasedAt: r.resultsReleasedAt?.toISOString() ?? null,
        counts: { students: r.classArmIds.reduce((n, id) => n + (countBy.get(id) ?? 0), 0), started: mine.length, inProgress: mine.length - submitted, submitted },
        canManage,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  /** The practical must exist, have a virtual lab and belong to the subject. */
  private async checkLesson(practicalId: string, subjectId: string) {
    const [lesson, subject] = await Promise.all([this.prisma.root.practicalLesson.findUnique({ where: { id: practicalId }, select: { subject: true, simulator: true } }), this.prisma.db.subject.findUnique({ where: { id: subjectId }, select: { name: true } })]);
    if (!subject) throw new BadRequestException({ statusCode: 400, message: 'Subject not found', errors: [{ path: 'subjectId', message: 'Subject not found' }] });
    if (!lesson) throw new BadRequestException({ statusCode: 400, message: 'Practical not found', errors: [{ path: 'practicalId', message: 'Practical not found' }] });
    if (!isSimulatorId(lesson.simulator)) {
      throw new BadRequestException({ statusCode: 400, message: 'This practical has no virtual lab, so it can’t be set as a practical test. Set it as homework instead: its quick check hands it in.', errors: [{ path: 'practicalId', message: 'No virtual lab' }] });
    }
    if (subjectKey(subject.name) !== lesson.subject) throw new BadRequestException({ statusCode: 400, message: `That practical is in ${lesson.subject}, not ${subject.name}`, errors: [{ path: 'practicalId', message: 'Pick a practical in this subject' }] });
  }

  private async checkArms(armIds: string[], subjectId: string, scope: StaffScope) {
    const arms = await this.prisma.db.classArm.findMany({ where: { id: { in: armIds } }, select: { id: true, subjects: { where: { subjectId }, select: { id: true } } } });
    if (arms.length !== new Set(armIds).size) throw new BadRequestException('One of the classes was not found');
    if (arms.some((a) => !a.subjects.length)) throw new BadRequestException('Every class must take this subject');
    if (arms.some((a) => !this.cbt.teachesArm(scope, a.id, subjectId))) throw new BadRequestException('You can only set practical tests for classes you teach this subject in');
  }

  private async checkTermAndComponent(termId: string, componentKey: string | null) {
    const term = await this.prisma.db.term.findUnique({ where: { id: termId }, select: { id: true } });
    if (!term) throw new BadRequestException({ statusCode: 400, message: 'Term not found', errors: [{ path: 'termId', message: 'Pick a term' }] });
    if (componentKey) {
      const { components } = await this.settings.get();
      if (!components.some((c) => c.key === componentKey)) throw new BadRequestException({ statusCode: 400, message: 'That result component is not in your assessment settings', errors: [{ path: 'componentKey', message: 'Pick a result component' }] });
    }
  }

  private checkWindow(opensAt: string, closesAt: string, duration: number, scheduling: boolean) {
    const err = windowError(opensAt, closesAt, duration, scheduling);
    if (err) throw new BadRequestException(err);
  }

  /** Tells the classes' students a practical test is scheduled. */
  private async announce(row: PracticalAssessment) {
    const t = await this.prisma.root.tenant.findUnique({ where: { id: currentTenantId() }, select: { timezone: true } });
    const when = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: t?.timezone || 'Africa/Lagos' }).format(row.opensAt);
    const students = await this.prisma.db.student.findMany({ where: { classArmId: { in: row.classArmIds }, status: 'ACTIVE' }, select: { id: true } });
    const lesson = await this.prisma.root.practicalLesson.findUnique({ where: { id: row.practicalId }, select: { simulator: true } });
    await this.notify(students.map((s) => s.id), `New practical test: ${row.title}`, `Opens ${when} · ${row.durationMinutes} minutes in the ${labWord(lesson?.simulator)}.`);
  }

  /** In-app notifications to these students (a courtesy: never fails the action). */
  private async notify(studentIds: string[], title: string, body: string, links?: Map<string, string>) {
    try {
      if (!studentIds.length) return;
      const students = await this.prisma.db.student.findMany({ where: { id: { in: studentIds }, userId: { not: null } }, select: { id: true, userId: true } });
      if (students.length) await this.prisma.db.notification.createMany({ data: students.map((s) => ({ tenantId: currentTenantId(), userId: s.userId!, title: title.slice(0, 160), body, link: links?.get(s.id) ?? '/my-exams' })) });
    } catch (err) {
      this.logger.warn(`Couldn't notify students: ${(err as Error).message}`);
    }
  }
}

