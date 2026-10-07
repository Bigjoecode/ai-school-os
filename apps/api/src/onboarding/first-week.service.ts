import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  FIRST_WEEK_THRESHOLDS as T,
  type FirstWeekAction,
  type FirstWeekDay,
  type FirstWeekGoal,
  type FirstWeekManualGoal,
  type FirstWeekPlan,
} from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { schoolNow } from '../common/school-time';
import { registerTickTask } from '../common/tick-tasks';
import { ChannelsService } from '../comms/channels.service';
import { emailHtml, SenderService } from '../comms/sender.service';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Plan state lives in automation_runs (kind FIRST_WEEK), an existing table
 * with a unique (tenant, kind, subject, date) key, so nothing is lost when a
 * settings screen rewrites a tenant's settings JSON:
 *   start                       the date the plan (re)started (else the school's creation date)
 *   dismissed / finished        the plan was closed
 *   mark:<goal>                 a Day 7 review goal was opened
 *   seen:class-insights:<user>  a member of staff opened a class's insights
 *   invites                     parent portal invitations were sent
 *   nudge                       the morning nudge went out (one per date)
 */
export const FIRST_WEEK_KIND = 'FIRST_WEEK';
/** Schools older than this only see the card if they start the plan themselves. */
const NEW_SCHOOL_DAYS = 14;
/** Morning nudges go out from this time, school time. */
const NUDGE_AT = '07:30';

const day0 = (d: string) => new Date(`${d}T00:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const localDate = (at: Date, tz: string) => schoolNow(tz, at).date;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-NG')} ${n === 1 ? one : many}`;

/** Records that a member of staff opened class insights (once per person). Safe to call on every view. */
export async function noteClassInsightsSeen(prisma: PrismaService, tenantId: string, userId: string | undefined) {
  if (!userId) return;
  const subjectKey = `seen:class-insights:${userId}`;
  const seen = await prisma.root.automationRun.findFirst({ where: { tenantId, kind: FIRST_WEEK_KIND, subjectKey }, select: { id: true } });
  if (seen) return;
  await prisma.root.automationRun.create({ data: { tenantId, kind: FIRST_WEEK_KIND, subjectKey, runDate: day0(new Date().toISOString().slice(0, 10)) } }).catch(() => undefined);
}

interface Facts {
  currentTerm: { id: string; name: string; session: string } | null;
  levels: number;
  arms: number;
  subjects: number;
  classSubjects: number;
  classSubjectsWithTeacher: number;
  students: number;
  studentsWithParent: number;
  parents: number;
  parentsWithContact: number;
  parentsWithLogin: number;
  parentsSignedIn: number;
  invitesSent: boolean;
  teachers: number;
  teachersWithLogin: number;
  teachersSignedIn: number;
  armsWithRegister: number;
  homeworkWithTopic: number;
  homeworkAny: number;
  onlineTests: number;
  finalPapers: number;
  updatesOn: boolean;
  updatesSent: number;
  feeItems: number;
  invoices: number;
  paystack: boolean;
  evidence: number;
  studentsWithEvidence: number;
  graded: number;
  insightsViewers: number;
  marks: Set<string>;
  website: boolean;
  whatsappConnected: boolean;
  whatsappAssistant: boolean;
}

/**
 * "Your first week": a guided 7-day plan for a new school, from setup to the
 * learning loop running. Every goal is checked against real records each
 * time the plan is read, and the school's admins get one gentle nudge each
 * morning of the week (in the app, and by email when the school's email is
 * set up) until the plan is finished or dismissed.
 */
@Injectable()
export class FirstWeekService implements OnModuleInit {
  private readonly logger = new Logger(FirstWeekService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly channels: ChannelsService,
    private readonly sender: SenderService,
  ) {}

  onModuleInit() {
    registerTickTask('firstWeekNudges', () => this.nudgeAll());
  }

  // ---------------------------------------------------------------- state

  private async state(tenantId: string) {
    const [tenant, rows] = await Promise.all([
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { createdAt: true, timezone: true, name: true } }),
      this.prisma.root.automationRun.findMany({
        where: { tenantId, kind: FIRST_WEEK_KIND, subjectKey: { in: ['start', 'dismissed', 'finished', 'invites', 'mark:successReview', 'mark:impactShared'] } },
        select: { subjectKey: true, runDate: true, createdAt: true },
      }),
    ]);
    const tz = tenant.timezone || 'Africa/Lagos';
    const today = schoolNow(tz).date;
    const start = rows.find((r) => r.subjectKey === 'start');
    const created = localDate(tenant.createdAt, tz);
    const startedOn = start ? start.runDate.toISOString().slice(0, 10) : created;
    return {
      tz,
      today,
      schoolName: tenant.name,
      startedOn,
      explicitStart: !!start,
      newSchool: daysBetween(created, today) <= NEW_SCHOOL_DAYS,
      dismissed: rows.some((r) => r.subjectKey === 'dismissed'),
      finished: rows.some((r) => r.subjectKey === 'finished'),
      invitesSent: rows.some((r) => r.subjectKey === 'invites'),
      marks: new Set(rows.filter((r) => r.subjectKey.startsWith('mark:')).map((r) => r.subjectKey.slice(5))),
    };
  }

  // ---------------------------------------------------------------- facts

  private async facts(tenantId: string, s: { marks: Set<string>; invitesSent: boolean }): Promise<Facts> {
    const db = this.prisma.root;
    const t = { tenantId };
    const [
      currentTerm,
      levels,
      arms,
      subjects,
      classSubjects,
      classSubjectsWithTeacher,
      students,
      studentsWithParent,
      guardians,
      teachingStaff,
      teacherMembers,
      registerArms,
      homeworkWithTopic,
      homeworkAny,
      onlineTests,
      finalPapers,
      tenant,
      updatesSent,
      paystack,
      evidence,
      evidenceStudents,
      graded,
      insightsViewers,
      whatsapp,
    ] = await Promise.all([
      db.term.findFirst({ where: { ...t, isCurrent: true }, select: { id: true, name: true, session: { select: { name: true } } } }),
      db.classLevel.count({ where: t }),
      db.classArm.count({ where: t }),
      db.subject.count({ where: t }),
      db.classSubject.count({ where: t }),
      db.classSubject.count({ where: { ...t, teacherId: { not: null } } }),
      db.student.count({ where: { ...t, status: 'ACTIVE' } }),
      db.student.count({ where: { ...t, status: 'ACTIVE', guardians: { some: {} } } }),
      db.guardian.findMany({ where: t, select: { phone: true, email: true, userId: true, user: { select: { lastLoginAt: true } } } }),
      db.staff.findMany({ where: { ...t, type: 'TEACHING', status: { not: 'EXITED' } }, select: { userId: true } }),
      db.membership.findMany({ where: { ...t, status: 'ACTIVE', roles: { some: { role: { key: 'teacher' } } } }, select: { userId: true } }),
      db.attendanceRegister.findMany({ where: t, distinct: ['classArmId'], select: { classArmId: true } }),
      db.homework.count({ where: { ...t, status: 'PUBLISHED', topicId: { not: null } } }),
      db.homework.count({ where: t }),
      db.onlineExam.count({ where: { ...t, status: { in: ['SCHEDULED', 'CLOSED'] } } }),
      db.examPaper.count({ where: { ...t, status: 'FINAL' } }),
      db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { portalSettings: true, websiteSettings: true } }),
      db.learningUpdate.count({ where: { ...t, sentAt: { not: null }, text: { not: '' } } }),
      db.tenantIntegration.count({ where: { ...t, provider: 'paystack' } }),
      db.masteryEvidence.count({ where: { ...t, source: { in: ['HOMEWORK', 'CBT', 'TEST', 'QUIZ'] } } }),
      db.masteryEvidence.findMany({ where: { ...t, source: { in: ['HOMEWORK', 'CBT', 'TEST', 'QUIZ'] } }, distinct: ['studentId'], select: { studentId: true }, take: 5000 }),
      Promise.all([
        db.homeworkSubmission.count({ where: { ...t, status: 'GRADED' } }),
        db.onlineExamAttempt.count({ where: { ...t, submittedAt: { not: null } } }),
      ]).then(([a, b]) => a + b),
      db.automationRun.count({ where: { ...t, kind: FIRST_WEEK_KIND, subjectKey: { startsWith: 'seen:class-insights:' } } }),
      db.tenantIntegration.findUnique({ where: { tenantId_provider: { tenantId, provider: 'whatsapp' } }, select: { config: true } }),
    ]);
    const term = currentTerm ? { id: currentTerm.id, name: currentTerm.name, session: currentTerm.session.name } : null;
    const [feeItems, invoices] = term
      ? await Promise.all([db.feeItem.count({ where: { ...t, termId: term.id } }), db.invoice.count({ where: { ...t, termId: term.id, status: { not: 'CANCELLED' } } })])
      : [0, 0];

    // Teachers: teaching staff, plus anyone with the Teacher role (invited from Users without a staff record).
    const teacherUserIds = new Set([...teachingStaff.map((x) => x.userId), ...teacherMembers.map((m) => m.userId)].filter((x): x is string => !!x));
    const signedIn = teacherUserIds.size
      ? await db.user.count({ where: { id: { in: [...teacherUserIds] }, lastLoginAt: { not: null } } })
      : 0;
    const portal = (tenant.portalSettings as { learningUpdates?: { enabled?: boolean } } | null) ?? null;
    const site = (tenant.websiteSettings as { published?: boolean } | null) ?? null;
    const wa = (whatsapp?.config as { assistant?: { enabled?: boolean } } | null) ?? null;
    return {
      currentTerm: term,
      levels,
      arms,
      subjects,
      classSubjects,
      classSubjectsWithTeacher,
      students,
      studentsWithParent,
      parents: guardians.length,
      parentsWithContact: guardians.filter((g) => g.phone || g.email).length,
      parentsWithLogin: guardians.filter((g) => g.userId).length,
      parentsSignedIn: guardians.filter((g) => g.user?.lastLoginAt).length,
      invitesSent: s.invitesSent,
      teachers: Math.max(teachingStaff.length, teacherUserIds.size),
      teachersWithLogin: teacherUserIds.size,
      teachersSignedIn: signedIn,
      armsWithRegister: registerArms.length,
      homeworkWithTopic,
      homeworkAny,
      onlineTests,
      finalPapers,
      updatesOn: portal?.learningUpdates?.enabled === true,
      updatesSent,
      feeItems,
      invoices,
      paystack: paystack > 0,
      evidence,
      studentsWithEvidence: evidenceStudents.length,
      graded,
      insightsViewers,
      marks: s.marks,
      website: site?.published === true,
      whatsappConnected: !!whatsapp,
      whatsappAssistant: wa?.assistant?.enabled === true,
    };
  }

  // ---------------------------------------------------------------- the plan

  private goals(f: Facts): { day: number; title: string; summary: string; goals: FirstWeekGoal[] }[] {
    type G = Omit<FirstWeekGoal, 'status' | 'optional' | 'manual' | 'progress'> & {
      done: boolean;
      started?: boolean;
      progress?: { done: number; total: number } | null;
      optional?: boolean;
      manual?: boolean;
    };
    const g = (x: G): FirstWeekGoal => ({
      key: x.key,
      label: x.label,
      why: x.why,
      detail: x.detail,
      href: x.href,
      action: x.action,
      progress: x.progress ?? null,
      optional: x.optional ?? false,
      manual: x.manual ?? false,
      status: x.done ? 'DONE' : x.started || (x.progress && x.progress.done > 0) ? 'IN_PROGRESS' : 'TODO',
    });
    const share = (n: number, d: number, min: number) => d > 0 && n / d >= min;

    return [
      {
        day: 1,
        title: 'School basics',
        summary: 'Your session and term, your classes and the subjects each class takes — everything else hangs on these.',
        goals: [
          g({
            key: 'year',
            label: 'Set this session and its terms',
            why: 'Registers, homework, fees and report cards are all filed under the current term.',
            done: !!f.currentTerm,
            detail: f.currentTerm ? `${f.currentTerm.session}, ${f.currentTerm.name} is the current term` : 'No current term yet',
            href: '/setup#year',
            action: 'Set up the year',
          }),
          g({
            key: 'classes',
            label: 'Create your classes and arms',
            why: 'Students, timetables and teachers are all organised by class arm (JSS 1A, Primary 4 Gold…).',
            done: f.arms > 0,
            detail: f.arms ? `${plural(f.levels, 'level')}, ${plural(f.arms, 'class arm')}` : 'No classes yet',
            href: '/setup#classes',
            action: 'Add classes',
          }),
          g({
            key: 'subjects',
            label: 'Link subjects to your classes',
            why: 'Homework, tests and mastery are tracked per subject, so each class needs its subjects.',
            done: f.subjects > 0 && f.classSubjects > 0,
            started: f.subjects > 0,
            detail: f.subjects ? `${plural(f.subjects, 'subject')}, ${plural(f.classSubjects, 'class–subject link')}` : 'No subjects yet',
            href: '/setup#subjects',
            action: 'Choose subjects',
          }),
        ],
      },
      {
        day: 2,
        title: 'Bring in your people',
        summary: 'Students with their parents, then staff with logins, then a teacher for every class subject.',
        goals: [
          g({
            key: 'students',
            label: 'Import your students',
            why: 'One spreadsheet brings in every student with their class — the rest of the week builds on it.',
            done: f.students > 0,
            detail: f.students ? `${plural(f.students, 'active student')}` : 'No students yet',
            href: '/import?kind=STUDENTS',
            action: 'Import students',
          }),
          g({
            key: 'parents',
            label: 'Parents on record with a phone or email',
            why: 'Parents are how you reach families: invitations, fee reminders and the weekly learning update.',
            done: share(f.studentsWithParent, f.students, T.parents),
            progress: f.students ? { done: f.studentsWithParent, total: f.students } : null,
            detail: f.students ? `${f.studentsWithParent.toLocaleString('en-NG')} of ${plural(f.students, 'student')} have a parent on record (${plural(f.parents, 'parent')})` : 'Parents come in with the student import',
            href: '/import?kind=STUDENTS',
            action: 'Import parents',
          }),
          g({
            key: 'staffLogins',
            label: 'Give your teachers logins',
            why: 'Teachers take registers, set homework and see their class insights from their own accounts.',
            done: share(f.teachersWithLogin, f.teachers, T.staffLogins),
            progress: f.teachers ? { done: f.teachersWithLogin, total: f.teachers } : null,
            detail: f.teachers ? `${f.teachersWithLogin} of ${plural(f.teachers, 'teacher')} have a login` : 'No teachers on record yet — import your staff list with logins',
            href: '/import?kind=STAFF',
            action: f.teachers ? 'Create logins' : 'Import staff',
          }),
          g({
            key: 'subjectTeachers',
            label: 'Give each class subject a teacher',
            why: 'Each teacher then sees exactly their own classes in homework, tests and class insights.',
            done: share(f.classSubjectsWithTeacher, f.classSubjects, T.subjectTeachers),
            progress: f.classSubjects ? { done: f.classSubjectsWithTeacher, total: f.classSubjects } : null,
            detail: f.classSubjects ? `${f.classSubjectsWithTeacher} of ${plural(f.classSubjects, 'class subject')} have a teacher` : 'Link subjects to classes first',
            href: '/academics?tab=subjects',
            action: 'Assign teachers',
          }),
          g({
            key: 'parentInvites',
            label: 'Invite parents to the portal',
            why: 'Parents who can sign in see homework, results and fees, and get the weekly learning update in the app.',
            done: f.invitesSent || share(f.parentsWithLogin, f.parents, T.parentInvites),
            progress: f.parents ? { done: f.parentsWithLogin, total: f.parents } : null,
            detail: f.parents ? `${f.parentsWithLogin} of ${plural(f.parents, 'parent')} have a portal login${f.invitesSent ? ' · invitations sent' : ''}` : 'Import parents first',
            href: '/setup?tab=first-week&invite=1',
            action: 'Invite parents',
          }),
        ],
      },
      {
        day: 3,
        title: 'Teachers in',
        summary: 'Half your teachers signed in and the first registers taken — the habit starts here.',
        goals: [
          g({
            key: 'teachersIn',
            label: `At least ${Math.round(T.teachersIn * 100)}% of teachers signed in`,
            why: 'Nothing changes in the classroom until teachers are using it. A short staff-room demo works wonders.',
            done: share(f.teachersSignedIn, f.teachers, T.teachersIn),
            progress: f.teachers ? { done: f.teachersSignedIn, total: f.teachers } : null,
            detail: f.teachers ? `${f.teachersSignedIn} of ${plural(f.teachers, 'teacher')} have signed in` : 'No teachers with logins yet',
            href: '/messages/new?audience=ALL_STAFF&channels=IN_APP,SMS',
            action: 'Remind teachers',
          }),
          g({
            key: 'registers',
            label: 'Take the first attendance registers',
            why: 'Daily registers feed the weekly parent update and flag children who keep missing school.',
            done: share(f.armsWithRegister, f.arms, T.registers),
            progress: f.arms ? { done: f.armsWithRegister, total: f.arms } : null,
            detail: f.arms ? `${f.armsWithRegister} of ${plural(f.arms, 'class', 'classes')} have taken a register` : 'Create classes first',
            href: '/attendance?tab=register',
            action: 'Take a register',
          }),
        ],
      },
      {
        day: 4,
        title: 'First learning activity',
        summary: 'Homework tied to a syllabus topic and an online test for one class: the raw material for mastery.',
        goals: [
          g({
            key: 'homework',
            label: 'Set homework on a syllabus topic',
            why: 'Choosing the topic is what lets a marked script become mastery evidence for each child.',
            done: f.homeworkWithTopic > 0,
            started: f.homeworkAny > 0,
            detail: f.homeworkWithTopic ? `${plural(f.homeworkWithTopic, 'homework')} set with a topic` : f.homeworkAny ? 'Homework set, but none published with a syllabus topic yet' : 'No homework yet',
            href: '/homework?new=1',
            action: 'Set homework',
          }),
          g({
            key: 'onlineTest',
            label: 'Schedule an online test (CBT) for one class',
            why: 'Objective questions are marked instantly, so the class’s strengths and gaps show up the same day.',
            done: f.onlineTests > 0,
            started: f.finalPapers > 0,
            detail: f.onlineTests ? `${plural(f.onlineTests, 'online test')} scheduled` : f.finalPapers ? `${plural(f.finalPapers, 'finished paper')} ready to schedule` : 'Build a short paper from the question bank first',
            href: f.finalPapers ? '/online-exams?new=1' : '/exams?new=1',
            action: f.finalPapers ? 'Schedule a test' : 'Build a paper',
          }),
        ],
      },
      {
        day: 5,
        title: 'Parents in',
        summary: 'Parents signing in, the weekly learning update switched on, and this term’s fees ready to pay.',
        goals: [
          g({
            key: 'parentsIn',
            label: `At least ${Math.round(T.parentsIn * 100)}% of parents signed in`,
            why: 'Parents who sign in follow homework and results — and pay fees online more readily.',
            done: share(f.parentsSignedIn, f.parents, T.parentsIn),
            progress: f.parents ? { done: f.parentsSignedIn, total: f.parents } : null,
            detail: f.parents ? `${f.parentsSignedIn} of ${plural(f.parents, 'parent')} have signed in` : 'Import parents first',
            href: '/setup?tab=first-week&invite=1',
            action: 'Remind parents',
          }),
          g({
            key: 'learningUpdates',
            label: 'Switch on the weekly learning update',
            why: 'Every Friday each parent gets “How your child is learning” — built from real work, not guesswork.',
            done: f.updatesOn,
            detail: f.updatesOn ? 'On — parents get it every week' : 'Off',
            href: '/settings/portal',
            action: 'Switch it on',
          }),
          g({
            key: 'fees',
            label: 'Set up this term’s fees and invoices',
            why: 'Parents see what they owe in the portal, and reminders go out without anyone chasing.',
            done: f.feeItems > 0 && f.invoices > 0,
            started: f.feeItems > 0,
            detail: !f.currentTerm ? 'Set the current term first' : f.feeItems ? `${plural(f.feeItems, 'fee item')}, ${plural(f.invoices, 'invoice')} this term` : 'No fee items this term',
            href: f.feeItems ? '/fees?issue=1' : '/fees?tab=schedule',
            action: f.feeItems ? 'Issue invoices' : 'Add fee items',
          }),
          g({
            key: 'paystack',
            label: 'Connect Paystack for online payment',
            why: 'Parents pay by card or transfer from the invoice, and receipts are issued automatically.',
            done: f.paystack,
            optional: true,
            detail: f.paystack ? 'Connected' : 'Not connected',
            href: '/fees?settings=1',
            action: 'Connect Paystack',
          }),
        ],
      },
      {
        day: 6,
        title: 'The learning loop',
        summary: 'Marked work turns into mastery for every child, and teachers use it to decide what to reteach.',
        goals: [
          g({
            key: 'masteryEvidence',
            label: 'Mark homework or a test to build mastery',
            why: 'Each marked question on a topic updates every child’s mastery — the heart of class insights and parent updates.',
            done: f.evidence > 0,
            started: f.graded > 0,
            detail: f.evidence ? `${plural(f.studentsWithEvidence, 'student')} now have mastery evidence from school work` : f.graded ? 'Work has been marked, but not on a syllabus topic yet' : 'Nothing marked yet',
            href: '/homework',
            action: 'Mark work',
          }),
          g({
            key: 'classInsights',
            label: 'A teacher opens Class insights',
            why: 'The heatmap shows which topics each class has and hasn’t got, with one-click practice and reteaching.',
            done: f.insightsViewers > 0,
            detail: f.insightsViewers ? `${plural(f.insightsViewers, 'person', 'people')} ${f.insightsViewers === 1 ? 'has' : 'have'} opened class insights` : 'Not opened yet',
            href: '/class-insights',
            action: 'Open class insights',
          }),
          g({
            key: 'firstUpdate',
            label: 'The first weekly update reaches parents',
            why: 'This is when parents feel the difference: a short, specific note about their own child.',
            done: f.updatesSent > 0,
            optional: true,
            detail: f.updatesSent ? `${plural(f.updatesSent, 'update')} sent so far` : f.updatesOn ? 'Goes out on the day you chose' : 'Switch the weekly update on first',
            href: '/settings/portal',
            action: 'See the update settings',
          }),
        ],
      },
      {
        day: 7,
        title: 'Review your week',
        summary: 'See what changed, and share it with your proprietor, board or PTA.',
        goals: [
          g({
            key: 'successReview',
            label: 'Review the week on the Success dashboard',
            why: 'Sign-ins, work set, mastery and parent engagement in one place — see what is working and who needs help.',
            done: f.marks.has('successReview'),
            manual: true,
            detail: f.marks.has('successReview') ? 'Reviewed' : 'Ticked when you open it from here',
            href: '/success',
            action: 'Open the dashboard',
          }),
          g({
            key: 'impactShared',
            label: 'Share the term impact report',
            why: 'Proprietors and PTAs back what they can see. Share the report from the Success dashboard.',
            done: f.marks.has('impactShared'),
            manual: true,
            optional: true,
            detail: f.marks.has('impactShared') ? 'Shared' : 'Ticked when you open it from here',
            href: '/success',
            action: 'Share the report',
          }),
          g({
            key: 'website',
            label: 'Publish your school website',
            why: 'Admissions enquiries and results checking come straight into the app.',
            done: f.website,
            optional: true,
            detail: f.website ? 'Published' : 'Not published yet',
            href: '/website',
            action: 'Set up the website',
          }),
          g({
            key: 'whatsapp',
            label: 'Switch on the WhatsApp assistant for parents',
            why: 'Parents ask about fees, homework and results on WhatsApp and get answers from your records, any time.',
            done: f.whatsappAssistant,
            started: f.whatsappConnected,
            optional: true,
            detail: f.whatsappAssistant ? 'On' : f.whatsappConnected ? 'WhatsApp is connected; the assistant is off' : 'Not set up',
            href: '/messages/whatsapp?tab=setup',
            action: 'Set it up',
          }),
        ],
      },
    ];
  }

  async plan(tenantId: string): Promise<FirstWeekPlan> {
    const s = await this.state(tenantId);
    const f = await this.facts(tenantId, s);
    const dayNumber = Math.max(1, daysBetween(s.startedOn, s.today) + 1);
    const raw = this.goals(f);
    const required = raw.flatMap((d) => d.goals.filter((g) => !g.optional));
    const doneCount = required.filter((g) => g.status === 'DONE').length;
    const days: FirstWeekDay[] = raw.map((d) => {
      const done = d.goals.filter((g) => !g.optional).every((g) => g.status === 'DONE');
      const status = done ? 'DONE' : d.day < Math.min(dayNumber, 8) ? 'BEHIND' : d.day === Math.min(dayNumber, 7) ? 'TODAY' : 'UPCOMING';
      return { ...d, status };
    });
    const firstOpen = days.find((d) => d.status !== 'DONE');
    const focusDay = firstOpen?.day ?? 7;
    const pick = (d: FirstWeekDay | undefined) => d?.goals.find((g) => !g.optional && g.status !== 'DONE');
    const next = pick(firstOpen) ?? days.flatMap((d) => d.goals.filter((g) => g.status !== 'DONE').map((g) => ({ g, day: d.day })))[0]?.g;
    const nextDay = next ? days.find((d) => d.goals.includes(next))!.day : null;
    const complete = doneCount === required.length;
    const state: FirstWeekPlan['state'] = s.dismissed ? 'DISMISSED' : s.finished ? 'FINISHED' : complete ? 'COMPLETE' : 'ACTIVE';
    return {
      startedOn: s.startedOn,
      dayNumber,
      state,
      showCard: (state === 'ACTIVE' || state === 'COMPLETE') && (s.explicitStart || s.newSchool),
      progressPct: pct(doneCount, required.length),
      doneCount,
      total: required.length,
      focusDay,
      days,
      nextAction: next && nextDay ? { ...next, day: nextDay } : null,
    };
  }

  async act(tenantId: string, body: FirstWeekAction): Promise<FirstWeekPlan> {
    const db = this.prisma.root;
    const s = await this.state(tenantId);
    const at = day0(s.today);
    const put = (subjectKey: string) =>
      db.automationRun.createMany({ data: [{ tenantId, kind: FIRST_WEEK_KIND, subjectKey, runDate: at }], skipDuplicates: true });
    if (body.action === 'MARK') {
      if (!body.key) throw new BadRequestException('Say which goal was opened');
      await put(`mark:${body.key satisfies FirstWeekManualGoal}`);
    } else if (body.action === 'DISMISS' || body.action === 'FINISH') {
      await put(body.action === 'DISMISS' ? 'dismissed' : 'finished');
      await this.audit.log({ action: `first_week.${body.action.toLowerCase()}`, summary: body.action === 'DISMISS' ? 'Hid the first-week plan' : 'Finished the first-week plan' });
    } else {
      // Start again from today: day 1 is today, nudges resume (from tomorrow, if today's already went).
      await db.automationRun.deleteMany({ where: { tenantId, kind: FIRST_WEEK_KIND, subjectKey: { in: ['start', 'dismissed', 'finished'] } } });
      await put('start');
      await this.audit.log({ action: 'first_week.started', summary: 'Started the first-week plan from today' });
    }
    return this.plan(tenantId);
  }

  // ---------------------------------------------------------------- morning nudges

  /** Tick task: each school in days 1–7 of an open plan gets one nudge a morning. */
  async nudgeAll(): Promise<number> {
    const now = new Date();
    // Only schools that could be in their first week: recently created, or that started the plan themselves.
    const since = new Date(now.getTime() - (NEW_SCHOOL_DAYS + 1) * 86_400_000);
    const [recent, started] = await Promise.all([
      this.prisma.root.tenant.findMany({ where: { status: { in: ['TRIAL', 'ACTIVE'] }, createdAt: { gte: since } }, select: { id: true } }),
      this.prisma.root.automationRun.findMany({ where: { kind: FIRST_WEEK_KIND, subjectKey: 'start', runDate: { gte: new Date(now.getTime() - 9 * 86_400_000) }, tenant: { status: { in: ['TRIAL', 'ACTIVE'] } } }, select: { tenantId: true } }),
    ]);
    let sent = 0;
    for (const tenantId of new Set([...recent.map((t) => t.id), ...started.map((s) => s.tenantId)])) {
      try {
        if (await this.nudge(tenantId)) sent++;
      } catch (err) {
        this.logger.warn(`First-week nudge for ${tenantId} failed: ${(err as Error).message}`);
      }
    }
    return sent;
  }

  /** One school's morning nudge; false when there is nothing to send (or it already went today). */
  async nudge(tenantId: string, force = false): Promise<boolean> {
    const s = await this.state(tenantId);
    if (s.dismissed || s.finished) return false;
    const dayNumber = daysBetween(s.startedOn, s.today) + 1;
    if (!force && (dayNumber < 1 || dayNumber > 7 || schoolNow(s.tz).time < NUDGE_AT)) return false;
    const plan = await this.plan(tenantId);
    if (!plan.showCard || plan.state !== 'ACTIVE' || !plan.nextAction) return false;
    // Claim today's nudge first, so overlapping ticks never send two.
    const claim = await this.prisma.root.automationRun.createMany({ data: [{ tenantId, kind: FIRST_WEEK_KIND, subjectKey: 'nudge', runDate: day0(s.today) }], skipDuplicates: true });
    if (!claim.count) return false;

    const day = plan.days.find((d) => d.day === Math.min(dayNumber, 7))!;
    const next = plan.nextAction;
    const title = `Day ${Math.min(dayNumber, 7)} of your first week: ${day.title}`;
    const catchUp = next.day < day.day ? ` First, one from Day ${next.day}: ` : ' Today’s first step: ';
    const body = `Good morning! ${plan.doneCount} of ${plan.total} goals done so far.${catchUp}${next.label}. ${next.why}`;
    const link = '/setup?tab=first-week';

    const admins = await this.prisma.root.membership.findMany({
      where: { tenantId, status: 'ACTIVE', user: { status: 'ACTIVE' }, roles: { some: { role: { key: { in: ['school_admin', 'principal'] } } } } },
      select: { userId: true, user: { select: { email: true, firstName: true } } },
    });
    if (!admins.length) return false;
    await this.prisma.root.notification.createMany({ data: admins.map((a) => ({ tenantId, userId: a.userId, title: title.slice(0, 160), body, link })) });

    // Email too, when the school's own email is set up.
    const ch = await this.channels.load(tenantId);
    try {
      if (this.channels.configured(ch, 'EMAIL')) {
        const school = await this.sender.school(tenantId);
        const url = `${await this.baseUrl(tenantId)}${link}`;
        for (const a of admins) {
          const text = `Dear ${a.user.firstName},\n\n${body}\n\nOpen the plan to see today’s goals and do each one in a click.`;
          await this.channels.sendEmail(ch, a.user.email, title, emailHtml(school, title, text, url), text, school.settings.senderName ?? school.name).catch((e: Error) => this.logger.warn(`First-week email to ${a.user.email} failed: ${e.message}`));
        }
      }
    } finally {
      this.channels.close(ch);
    }
    return true;
  }

  /** Where links in emails point: the school's verified portal domain, else the app's own address. */
  async baseUrl(tenantId: string): Promise<string> {
    const domain = await this.prisma.root.tenantDomain.findFirst({ where: { tenantId, kind: 'PORTAL', verifiedAt: { not: null } }, orderBy: { isPrimary: 'desc' }, select: { hostname: true } });
    if (domain) return `https://${domain.hostname}`;
    const e = env();
    return e.CORS_ORIGINS[0] ?? (e.PLATFORM_DOMAIN_TARGET ? `https://${e.PLATFORM_DOMAIN_TARGET}` : '');
  }
}
