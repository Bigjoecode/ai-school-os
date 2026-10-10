import { Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  DEFAULT_PORTAL_SETTINGS,
  portalSettingsSchema,
  portalPinUnlockSchema,
  type PortalAttendance,
  type PortalChild,
  type PortalDownload,
  type PortalEvent,
  type PortalFees,
  type PortalMe,
  type PortalOnlineTest,
  type PortalOnlineTestQuestion,
  type PortalOnlineTestReview,
  type PortalOnlineTests,
  type PortalOverview,
  type PortalResultTerm,
  type PortalSettings,
  type PortalTermRef,
  type ReceiptView,
  type ReportCardView,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import type { ExamPaper, OnlineExam, OnlineExamAttempt } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { answersOf, isObjective, layoutOf, resultVisibility, round1, theoryMarksOf } from '../cbt/cbt.service';
import { AttendanceService } from '../attendance/attendance.service';
import { ReportCardService } from '../assessment/report-card.service';
import { RequirePermissions } from '../common/decorators';
import { dateOnly, fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { ZodPipe } from '../common/zod.pipe';
import { FilesService } from '../files/files.service';
import { FeatureService } from '../features/features.service';
import { FinanceService } from '../finance/finance.service';
import { PaystackService } from '../finance/paystack.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResultPinsService } from '../result-pins/result-pins.service';

type Viewer = { role: 'PARENT' | 'STUDENT'; childIds: Set<string> };
type TermRow = Prisma.TermGetPayload<{ include: { session: { select: { name: true } } } }>;

/**
 * The family portal: parents see each of their children, students see
 * themselves. Results are only ever published report cards, and the school
 * decides what is shown (and can withhold results while fees are owed).
 */
@Controller('portal')
export class PortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly cards: ReportCardService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly finance: FinanceService,
    private readonly paystack: PaystackService,
    private readonly features: FeatureService,
    private readonly resultPins: ResultPinsService,
  ) {}

  // ---------------------------------------------------------- school settings (staff)

  @Get('settings')
  @RequirePermissions('school.read')
  getSettings(): Promise<PortalSettings> {
    return this.settings();
  }

  @Put('settings')
  @RequirePermissions('school.manage')
  async setSettings(@Body(new ZodPipe(portalSettingsSchema)) body: PortalSettings): Promise<PortalSettings> {
    // Keep the weekly learning update, data protection and games settings stored alongside.
    const prev = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { portalSettings: true } });
    const { learningUpdates, dataProtection, games } = (prev.portalSettings as { learningUpdates?: unknown; dataProtection?: unknown; games?: unknown } | null) ?? {};
    await this.prisma.root.tenant.update({
      where: { id: currentTenantId() },
      data: { portalSettings: { ...body, ...(learningUpdates ? { learningUpdates } : {}), ...(dataProtection ? { dataProtection } : {}), ...(games ? { games } : {}) } as unknown as Prisma.InputJsonValue },
    });
    await this.audit.log({ action: 'portal.settings_updated', entityType: 'Tenant', entityId: currentTenantId(), summary: `Updated what families see in the portal${body.withholdResultsWhenOwing ? ' (results withheld while fees are owed)' : ''}` });
    return body;
  }

  // ---------------------------------------------------------- families

  @Get('me')
  async me(): Promise<PortalMe> {
    const v = await this.viewer();
    const [children, settings, tenant] = await Promise.all([this.children(v), this.settings(), this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { currency: true } })]);
    return { role: v.role, children, settings, currency: tenant.currency };
  }

  @Get('students/:id/overview')
  async overview(@Param('id') id: string): Promise<PortalOverview> {
    const v = await this.viewer();
    this.mustSee(v, id);
    const db = this.prisma.db;
    const settings = await this.settings();
    const [child] = await this.children(v, id);
    if (!child) throw new NotFoundException('Student not found');
    const current = await this.currentTerm();
    const student = await db.student.findUniqueOrThrow({ where: { id }, select: { classArmId: true, classArm: { select: { classLevelId: true } } } });
    const today = await this.today();
    const [attendance, results, upcoming, homeworkDue, invoices, downloads] = await Promise.all([
      settings.showAttendance && current ? this.attendance.termCounts(id, current) : null,
      settings.showResults ? this.resultTerms(id, settings, v) : [],
      settings.showCalendar ? this.events(v, student.classArmId, 5) : [],
      student.classArmId ? db.homework.count({ where: { classArmId: student.classArmId, status: 'PUBLISHED', dueDate: { gte: new Date(`${today}T00:00:00Z`) }, submissions: { none: { studentId: id } } } }) : 0,
      v.role === 'PARENT' && settings.showFees ? db.invoice.findMany({ where: { studentId: id, status: { not: 'CANCELLED' } }, select: { totalKobo: true, paidKobo: true } }) : null,
      settings.showDownloads ? this.downloadRows(v, student.classArm?.classLevelId ?? null) : [],
    ]);
    const weekAgo = Date.now() - 14 * 86_400_000;
    return {
      child,
      attendance,
      latestResult: results.find((r) => r.published) ?? null,
      upcoming,
      homeworkDue,
      feesOwed: invoices ? invoices.reduce((n, i) => n + Math.max(0, i.totalKobo - i.paidKobo), 0) / 100 : null,
      newDownloads: downloads.filter((d) => Date.parse(d.updatedAt) > weekAgo).length,
    };
  }

  @Get('students/:id/attendance')
  async studentAttendance(@Param('id') id: string, @Query(new ZodPipe(z.object({ termId: z.string().optional() }))) q: { termId?: string }): Promise<PortalAttendance> {
    const v = await this.viewer();
    this.mustSee(v, id);
    if (!(await this.settings()).showAttendance) throw new ForbiddenException('The school has not shared attendance in the portal');
    const terms = await this.terms();
    const term = (q.termId ? terms.find((t) => t.id === q.termId) : null) ?? terms.find((t) => t.isCurrent) ?? terms[0];
    if (!term) throw new NotFoundException('No terms have been set up yet');
    const row = await this.prisma.db.term.findUniqueOrThrow({ where: { id: term.id } });
    const [counts, days] = await Promise.all([
      this.attendance.termCounts(id, row),
      this.prisma.db.studentAttendance.findMany({ where: { studentId: id, date: { gte: row.startsOn, lte: row.endsOn } }, orderBy: { date: 'desc' }, select: { date: true, status: true, note: true } }),
    ]);
    return { term, terms, counts, days: days.map((d) => ({ date: dateOnly(d.date)!, status: d.status, note: d.note })) };
  }

  @Get('students/:id/results')
  async results(@Param('id') id: string): Promise<PortalResultTerm[]> {
    const v = await this.viewer();
    this.mustSee(v, id);
    const settings = await this.settings();
    if (!settings.showResults) throw new ForbiddenException('The school has not shared results in the portal');
    return this.resultTerms(id, settings, v);
  }

  /** A published report card, exactly as the school prints it. */
  @Get('students/:id/results/:termId')
  async resultCard(@Param('id') id: string, @Param('termId') termId: string): Promise<ReportCardView> {
    const v = await this.viewer();
    this.mustSee(v, id);
    const settings = await this.settings();
    if (!settings.showResults) throw new ForbiddenException('The school has not shared results in the portal');
    const card = await this.prisma.db.reportCard.findUnique({ where: { studentId_termId: { studentId: id, termId } } });
    if (card?.status !== 'PUBLISHED') throw new NotFoundException('This result has not been published yet');
    const withheld = await this.withheld(id, settings);
    if (withheld) throw new ForbiddenException({ statusCode: 403, code: 'RESULT_WITHHELD', message: withheld });
    if (settings.requireResultPin && !(await this.resultPins.unlocked(id, termId))) {
      throw new ForbiddenException({ statusCode: 403, code: 'RESULT_PIN_REQUIRED', message: 'Enter a result-checker PIN to open this report card. You only need to do this once per term.' });
    }
    return this.cards.view({ studentId: id, termId });
  }

  /** The school requires a result PIN: one card opens this child's term (and uses one of its checks). */
  @Post('students/:id/results/:termId/unlock')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async unlockResult(@Param('id') id: string, @Param('termId') termId: string, @Body(new ZodPipe(portalPinUnlockSchema)) body: { serial: string; pin: string }): Promise<ReportCardView> {
    const v = await this.viewer();
    this.mustSee(v, id);
    const settings = await this.settings();
    if (!settings.showResults) throw new ForbiddenException('The school has not shared results in the portal');
    if (!settings.requireResultPin || (await this.resultPins.unlocked(id, termId))) return this.resultCard(id, termId);
    const r = await this.resultPins.check({ serial: body.serial, pin: body.pin, termId, who: { studentId: id }, channel: 'PORTAL' });
    await this.audit.log({ action: 'portal.result_pin_used', entityType: 'Student', entityId: id, summary: `Opened a report card in the portal with result card ${r.card.serial}` });
    return r.view;
  }

  /**
   * The child's online tests (CBT). Scores appear exactly when the child may
   * see their own (the teacher's "show results" choice), and follow the
   * school's withholding while fees are owed, like report cards.
   */
  @Get('students/:id/online-exams')
  async onlineExams(@Param('id') id: string): Promise<PortalOnlineTests> {
    const v = await this.viewer();
    this.mustSee(v, id);
    const settings = await this.settings();
    if (!settings.showResults) throw new ForbiddenException('The school has not shared results in the portal');
    const db = this.prisma.db;
    const [attempts, withheld] = await Promise.all([db.onlineExamAttempt.findMany({ where: { studentId: id, status: { not: 'IN_PROGRESS' } } }), this.withheld(id, settings)]);
    if (!attempts.length) return { withheld, tests: [] };
    const exams = await db.onlineExam.findMany({ where: { id: { in: attempts.map((a) => a.examId) }, status: { not: 'DRAFT' } } });
    const papers = await db.examPaper.findMany({ where: { id: { in: exams.map((e) => e.paperId) } }, include: testPaperInclude });
    const now = new Date();
    const visible = withheld ? [] : exams.filter((e) => resultVisibility(e, attempts.find((a) => a.examId === e.id)!, now).score).map((e) => e.id);
    const peers = visible.length ? await db.onlineExamAttempt.findMany({ where: { examId: { in: visible }, status: 'MARKED' }, select: { examId: true, score: true, total: true } }) : [];
    const paperBy = new Map(papers.map((p) => [p.id, p]));
    const tests = exams.flatMap((e) => {
      const p = paperBy.get(e.paperId);
      const a = attempts.find((x) => x.examId === e.id);
      return p && a ? [testRow(e, p, a, peers.filter((x) => x.examId === e.id), withheld, now)] : [];
    });
    return { withheld, tests: tests.sort((x, y) => y.satAt.localeCompare(x.satAt)) };
  }

  /** One online test question by question, once the child may review their answers. */
  @Get('students/:id/online-exams/:examId')
  async onlineExam(@Param('id') id: string, @Param('examId') examId: string): Promise<PortalOnlineTestReview> {
    const v = await this.viewer();
    this.mustSee(v, id);
    const settings = await this.settings();
    if (!settings.showResults) throw new ForbiddenException('The school has not shared results in the portal');
    const db = this.prisma.db;
    const [exam, a] = await Promise.all([
      db.onlineExam.findFirst({ where: { id: examId, status: { not: 'DRAFT' } } }),
      db.onlineExamAttempt.findUnique({ where: { examId_studentId: { examId, studentId: id } } }),
    ]);
    const paper = exam ? await db.examPaper.findUnique({ where: { id: exam.paperId }, include: testPaperInclude }) : null;
    if (!exam || !paper || !a || a.status === 'IN_PROGRESS') throw new NotFoundException('Test not found');
    const withheld = await this.withheld(id, settings);
    if (withheld) throw new ForbiddenException({ statusCode: 403, code: 'RESULT_WITHHELD', message: withheld });
    const now = new Date();
    const vis = resultVisibility(exam, a, now);
    const peers = vis.score ? await db.onlineExamAttempt.findMany({ where: { examId, status: 'MARKED' }, select: { score: true, total: true } }) : [];
    const test = testRow(exam, paper, a, peers, null, now);
    if (!vis.review) return { test, questions: null };

    const layout = layoutOf(a);
    const answers = answersOf(a);
    const theory = theoryMarksOf(a);
    const bank = await db.question.findMany({ where: { id: { in: layout.items.map((i) => i.id) } }, select: { id: true, stem: true, options: true, answer: true } });
    const qBy = new Map(bank.map((q) => [q.id, q]));
    const questions = layout.items.map((item, i): PortalOnlineTestQuestion => {
      const q = qBy.get(item.id);
      const objective = isObjective(item.type);
      const chosen = answers[item.id];
      const correct = objective ? item.correct != null && chosen === item.correct : null;
      return {
        number: i + 1,
        type: item.type,
        objective,
        stem: q?.stem ?? '(This question was removed from the question bank.)',
        options: objective ? item.order.map((o) => q?.options[o] ?? '') : [],
        chosenIndex: objective && typeof chosen === 'number' ? item.order.indexOf(chosen) : null,
        correctIndex: objective && item.correct != null ? item.order.indexOf(item.correct) : null,
        writtenAnswer: !objective && typeof chosen === 'string' && chosen.trim() ? chosen : null,
        modelAnswer: objective ? null : (q?.answer ?? null),
        correct,
        marks: item.marks,
        awarded: objective ? (correct ? item.marks : 0) : typeof theory[item.id] === 'number' ? theory[item.id]! : null,
      };
    });
    return { test, questions };
  }

  @Get('students/:id/calendar')
  async calendar(@Param('id') id: string): Promise<PortalEvent[]> {
    const v = await this.viewer();
    this.mustSee(v, id);
    if (!(await this.settings()).showCalendar) throw new ForbiddenException('The school has not shared its calendar in the portal');
    const s = await this.prisma.db.student.findUniqueOrThrow({ where: { id }, select: { classArmId: true } });
    return this.events(v, s.classArmId, 60);
  }

  /**
   * A child's fees, for parents: invoices with what is still owed, payment
   * history and receipts. Pay now opens the same secure Paystack page as the
   * school's payment links; Paystack confirms each payment to the server.
   */
  @Get('students/:id/fees')
  async fees(@Param('id') id: string): Promise<PortalFees> {
    const v = await this.viewer();
    this.mustSee(v, id);
    if (v.role !== 'PARENT') throw new ForbiddenException('Fees are shown to parents');
    if (!(await this.settings()).showFees) throw new ForbiddenException('The school has not shared fees in the portal');
    const db = this.prisma.db;
    const tenantId = currentTenantId();
    const [invoices, payments, settings, online, today] = await Promise.all([
      db.invoice.findMany({
        where: { studentId: id, status: { not: 'CANCELLED' } },
        include: { term: { include: { session: { select: { name: true } } } }, lines: { orderBy: { id: 'asc' } } },
        orderBy: [{ term: { startsOn: 'desc' } }, { issuedAt: 'desc' }],
      }),
      db.payment.findMany({ where: { studentId: id, status: { in: ['SUCCESS', 'PENDING', 'REVERSED'] } }, include: { invoice: { select: { number: true } } }, orderBy: { paidAt: 'desc' }, take: 100 }),
      this.finance.settings(),
      this.paystack.connected(tenantId).then(async (c) => c && (await this.features.isEnabled(tenantId, 'online_payments'))),
      this.today(),
    ]);
    const rows = await Promise.all(
      invoices.map(async (i) => {
        const balanceKobo = Math.max(0, i.totalKobo - i.paidKobo);
        const due = dateOnly(i.dueDate)!;
        return {
          id: i.id,
          number: i.number,
          term: i.term.name,
          sessionName: i.term.session.name,
          totalKobo: i.totalKobo,
          paidKobo: i.paidKobo,
          balanceKobo,
          dueDate: due,
          status: i.status,
          overdue: balanceKobo > 0 && due < today,
          lines: i.lines.map((l) => ({ description: l.description, amountKobo: l.amountKobo })),
          payPath: online && balanceKobo > 0 ? `/pay/${await this.finance.payToken(i.id)}` : null,
        };
      }),
    );
    return {
      currency: settings.currency,
      onlinePayments: online,
      bankDetails: settings.bankDetails,
      totals: {
        billedKobo: rows.reduce((n, r) => n + r.totalKobo, 0),
        paidKobo: rows.reduce((n, r) => n + r.paidKobo, 0),
        balanceKobo: rows.reduce((n, r) => n + r.balanceKobo, 0),
      },
      invoices: rows,
      payments: payments.map((p) => ({ id: p.id, receiptNumber: p.receiptNumber, amountKobo: p.amountKobo, method: p.method, status: p.status, paidAt: p.status === 'PENDING' ? null : p.paidAt.toISOString(), invoiceNumber: p.invoice.number })),
    };
  }

  /** A receipt for one of this child's payments. */
  @Get('students/:id/receipts/:paymentId')
  async receipt(@Param('id') id: string, @Param('paymentId') paymentId: string): Promise<ReceiptView> {
    const v = await this.viewer();
    this.mustSee(v, id);
    if (v.role !== 'PARENT') throw new ForbiddenException('Receipts are shown to parents');
    const p = await this.prisma.db.payment.findUnique({ where: { id: paymentId }, select: { studentId: true, status: true } });
    if (!p || p.studentId !== id || p.status === 'PENDING' || p.status === 'FAILED') throw new NotFoundException('Receipt not found');
    return this.finance.receiptView(paymentId);
  }

  /** The school's documents for this family: forms, timetables, newsletters, the calendar… */
  @Get('downloads')
  async downloads(@Query(new ZodPipe(z.object({ studentId: z.string().optional() }))) q: { studentId?: string }): Promise<PortalDownload[]> {
    const v = await this.viewer();
    if (!(await this.settings()).showDownloads) return [];
    let levels: (string | null)[] | null = null;
    if (q.studentId) {
      this.mustSee(v, q.studentId);
      const s = await this.prisma.db.student.findUniqueOrThrow({ where: { id: q.studentId }, select: { classArm: { select: { classLevelId: true } } } });
      levels = [s.classArm?.classLevelId ?? null];
    } else {
      const kids = await this.prisma.db.student.findMany({ where: { id: { in: [...v.childIds] } }, select: { classArm: { select: { classLevelId: true } } } });
      levels = kids.map((k) => k.classArm?.classLevelId ?? null);
    }
    return this.downloadRows(v, ...levels);
  }

  // ---------------------------------------------------------- helpers

  private async viewer(): Promise<Viewer> {
    const ctx = currentContext();
    const db = this.prisma.db;
    if (ctx.permissions.has('family.manage')) {
      const links = await db.studentGuardian.findMany({ where: { guardian: { userId: ctx.userId }, student: { status: 'ACTIVE' } }, select: { studentId: true } });
      return { role: 'PARENT', childIds: new Set(links.map((l) => l.studentId)) };
    }
    if (ctx.permissions.has('learning.use')) {
      const me = await db.student.findFirst({ where: { userId: ctx.userId, status: 'ACTIVE' }, select: { id: true } });
      if (me) return { role: 'STUDENT', childIds: new Set([me.id]) };
    }
    throw new ForbiddenException('The portal is for parents and students');
  }

  private mustSee(v: Viewer, studentId: string) {
    if (!v.childIds.has(studentId)) throw new ForbiddenException(v.role === 'PARENT' ? 'You can only see your own children' : 'You can only see your own records');
  }

  private async children(v: Viewer, only?: string): Promise<PortalChild[]> {
    const rows = await this.prisma.db.student.findMany({
      where: { id: { in: only ? [only] : [...v.childIds] } },
      include: { classArm: { include: { classLevel: true } } },
      orderBy: [{ firstName: 'asc' }],
    });
    return rows.map((s) => ({
      id: s.id,
      name: fullName(s),
      firstName: s.firstName,
      admissionNumber: s.admissionNumber,
      className: s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}`.trim() : null,
      photoUrl: s.photoUrl,
    }));
  }

  private async settings(): Promise<PortalSettings> {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { portalSettings: true } });
    return { ...DEFAULT_PORTAL_SETTINGS, ...((t.portalSettings as Partial<PortalSettings> | null) ?? {}) };
  }

  private async today() {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { timezone: true } });
    return schoolNow(t.timezone).date;
  }

  private async terms(): Promise<PortalTermRef[]> {
    const rows = await this.prisma.db.term.findMany({ include: { session: { select: { name: true } } }, orderBy: { startsOn: 'desc' } });
    return rows.map(termRef);
  }

  private async currentTerm() {
    return (await this.prisma.db.term.findFirst({ where: { isCurrent: true } })) ?? (await this.prisma.db.term.findFirst({ orderBy: { startsOn: 'desc' } }));
  }

  /** Why results are hidden from this family, or null. */
  private async withheld(studentId: string, settings: PortalSettings): Promise<string | null> {
    if (!settings.withholdResultsWhenOwing) return null;
    const invoices = await this.prisma.db.invoice.findMany({ where: { studentId, status: { not: 'CANCELLED' } }, select: { totalKobo: true, paidKobo: true } });
    const owed = invoices.reduce((n, i) => n + Math.max(0, i.totalKobo - i.paidKobo), 0);
    if (owed <= 0) return null;
    return settings.withholdMessage ?? 'Results are available once school fees are fully paid. Please contact the school bursar.';
  }

  private async resultTerms(studentId: string, settings: PortalSettings, v: Viewer): Promise<PortalResultTerm[]> {
    void v;
    const [cards, withheld, unlocked] = await Promise.all([
      this.prisma.db.reportCard.findMany({ where: { studentId, status: 'PUBLISHED' }, include: { term: { include: { session: { select: { name: true } } } } }, orderBy: { term: { startsOn: 'desc' } } }),
      this.withheld(studentId, settings),
      settings.requireResultPin ? this.resultPins.unlockedTerms(studentId) : null,
    ]);
    return Promise.all(
      cards.map(async (c) => {
        let summary: { average: number | null; position: number | null; classSize: number | null } = { average: null, position: null, classSize: null };
        const pinRequired = !!unlocked && !unlocked.has(c.termId);
        if (!withheld && !pinRequired) {
          const view = await this.cards.view({ studentId, termId: c.termId }).catch(() => null);
          if (view) summary = { average: view.summary.average, position: view.summary.position, classSize: view.summary.classSize };
        }
        return { term: termRef(c.term), published: true, publishedAt: c.publishedAt?.toISOString() ?? null, ...summary, withheld, ...(pinRequired ? { pinRequired } : {}) };
      }),
    );
  }

  /** Upcoming events this family may see (school-wide, for parents/students, or for the child's class). */
  private async events(v: Viewer, classArmId: string | null, take: number): Promise<PortalEvent[]> {
    const today = await this.today();
    const audiences = ['EVERYONE', v.role === 'PARENT' ? 'PARENTS' : 'STUDENTS'];
    const rows = await this.prisma.db.schoolEvent.findMany({
      where: { audience: { in: audiences }, OR: [{ startDate: { gte: new Date(`${today}T00:00:00Z`) } }, { endDate: { gte: new Date(`${today}T00:00:00Z`) } }] },
      orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
      take: take * 2,
    });
    return rows
      .filter((e) => !e.classArmIds.length || (classArmId && e.classArmIds.includes(classArmId)))
      .slice(0, take)
      .map((e) => ({ id: e.id, title: e.title, description: e.description, category: e.category, startDate: dateOnly(e.startDate)!, endDate: dateOnly(e.endDate), startTime: e.startTime, endTime: e.endTime, allDay: e.allDay, location: e.location }));
  }

  private async downloadRows(v: Viewer, ...levels: (string | null)[]): Promise<PortalDownload[]> {
    const audiences = ['PUBLIC', 'FAMILIES', v.role === 'PARENT' ? 'PARENTS' : 'STUDENTS'];
    const rows = await this.prisma.db.websiteDownload.findMany({ where: { published: true, audience: { in: audiences } }, orderBy: [{ updatedAt: 'desc' }] });
    const mine = new Set(levels.filter((l): l is string => !!l));
    return Promise.all(
      rows
        .filter((d) => !d.classLevelIds.length || d.classLevelIds.some((l) => mine.has(l)))
        .map(async (d) => ({ id: d.id, title: d.title, description: d.description, category: d.category, fileUrl: d.fileUrl, sizeBytes: await this.files.sizeOf(d.fileUrl), updatedAt: d.updatedAt.toISOString() })),
    );
  }
}

const testPaperInclude = { subject: { select: { name: true } }, term: { select: { name: true, session: { select: { name: true } } } } } as const;
type TestPaper = ExamPaper & { subject: { name: string }; term: { name: string; session: { name: string } } };

/** A CBT attempt as the family sees it: the score only once the child may see it, never while withheld. */
function testRow(e: OnlineExam, p: TestPaper, a: OnlineExamAttempt, peers: { score: number | null; total: number | null }[], withheld: string | null, now: Date): PortalOnlineTest {
  const vis = resultVisibility(e, a, now);
  const partial = a.status !== 'MARKED';
  const total = a.total ?? 0;
  const raw = partial ? (a.objectiveScore ?? 0) : (a.score ?? 0);
  const show = vis.score && !withheld && total > 0;
  const pcts = peers.filter((x) => x.score != null && x.total).map((x) => (x.score! / x.total!) * 100);
  const stats = show && pcts.length >= 2;
  const note = withheld
    ? null
    : !vis.score
      ? e.showResults === 'AFTER_CLOSE'
        ? 'The score will show when the test closes.'
        : 'The score will show when the teacher releases the results.'
      : partial
        ? 'Written answers are still being marked; this is the score so far.'
        : !vis.review
          ? 'Answers can be reviewed once the test has closed.'
          : null;
  return {
    id: e.id,
    title: e.title,
    subject: p.subject.name,
    term: `${p.term.name} · ${p.term.session.name}`,
    satAt: (a.submittedAt ?? a.startedAt).toISOString(),
    status: partial ? 'MARKING' : 'MARKED',
    score: show ? raw : null,
    total: show ? total : null,
    percent: show ? round1((raw / total) * 100) : null,
    classAverage: stats ? round1(pcts.reduce((x, y) => x + y, 0) / pcts.length) : null,
    classHighest: stats ? round1(Math.max(...pcts)) : null,
    canReview: !withheld && vis.review,
    note,
  };
}

function termRef(t: TermRow): PortalTermRef {
  return { id: t.id, name: t.name, sessionName: t.session.name, startsOn: dateOnly(t.startsOn)!, endsOn: dateOnly(t.endsOn)!, isCurrent: t.isCurrent };
}

