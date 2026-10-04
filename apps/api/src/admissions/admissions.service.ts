import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  ADMISSION_ENROLLABLE,
  ADMISSION_NEXT,
  ADMISSION_STATUSES,
  ADMISSION_STATUS_LABELS,
  DEFAULT_ADMISSIONS_SETTINGS,
  formatMoney,
  normalisePhone,
  type AdmissionDetail,
  type AdmissionDocument,
  type AdmissionEvent,
  type AdmissionList,
  type AdmissionRow,
  type AdmissionSource,
  type AdmissionStatus,
  type AdmissionsLetterhead,
  type AdmissionsMeta,
  type AdmissionsSettings,
  type AdmissionsStats,
  type ApplicationInput,
  type ApplicationListQuery,
  type Audience,
  type EnrolApplicantInput,
  type EnrolPreview,
  type EnrolResult,
  type FeeSummary,
  type OfferLetter,
  type PublicApplicationStatus,
} from '@aischool/shared';
import type { AdmissionApplication, Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password';
import { SenderService } from '../comms/sender.service';
import { dateOnly, fullName, parseDate } from '../common/format';
import { currentContext, currentTenantId, RequestContextStore } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../prisma/prisma.service';
import { admissionNotice, nextSteps, whenText, type NoticeKind } from './messages';

type App = AdmissionApplication;
type Tx = Prisma.TransactionClient;

const TITLES = /^(mr|mrs|miss|ms|dr|chief|alhaji|alhaja|pastor|rev|prof|engr|barr|hon|sir|lady|prince|princess)\.?\s+/i;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const newPassword = () => randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 10) + '7a';
const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === 'P2002';

/** "Mrs Ngozi Adaeze Okafor" → Ngozi / Adaeze Okafor's surname (last word). One word → the child's surname. */
export function splitParentName(full: string, fallbackLast: string): { firstName: string; lastName: string } {
  const parts = full.replace(TITLES, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: full.trim() || 'Parent', lastName: fallbackLast };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: fallbackLast };
  return { firstName: parts[0]!, lastName: parts[parts.length - 1]! };
}

/** "Chidera Okafor" → Chidera / Okafor; "Chidera Ada Okafor" → middle name Ada. */
export function splitChildName(full: string, fallbackLast: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? full.trim(), middle: null as string | null, last: fallbackLast };
  return { first: parts[0]!, middle: parts.length > 2 ? parts.slice(1, -1).join(' ') : null, last: parts[parts.length - 1]! };
}

/** UTC instants bounding a school-local day. */
function dayBounds(date: string, timezone: string): { gte: Date; lt: Date } {
  const probe = new Date(`${date}T12:00:00Z`);
  const local = new Date(probe.toLocaleString('en-US', { timeZone: timezone }));
  const offsetMs = local.getTime() - new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  const start = new Date(Date.parse(`${date}T00:00:00Z`) - offsetMs);
  return { gte: start, lt: new Date(start.getTime() + 86_400_000) };
}

const docsOf = (v: unknown): AdmissionDocument[] => (Array.isArray(v) ? (v as AdmissionDocument[]).filter((d) => d && typeof d.fileId === 'string') : []);
const childName = (a: { childFirstName: string; childMiddleName: string | null; childLastName: string }) =>
  [a.childFirstName, a.childMiddleName, a.childLastName].filter(Boolean).join(' ');

@Injectable()
export class AdmissionsService {
  private readonly logger = new Logger(AdmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sender: SenderService,
    private readonly finance: FinanceService,
  ) {}

  // ---------------------------------------------------------- school & settings

  async school() {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({
      where: { id: currentTenantId() },
      select: { name: true, motto: true, address: true, phone: true, email: true, logoUrl: true, primaryColor: true, timezone: true, currency: true, operationsSettings: true },
    });
    const saved = ((t.operationsSettings as { admissions?: Partial<AdmissionsSettings> } | null) ?? {}).admissions ?? {};
    const settings: AdmissionsSettings = { ...DEFAULT_ADMISSIONS_SETTINGS, ...saved };
    const letterhead: AdmissionsLetterhead = { name: t.name, motto: t.motto, address: t.address, phone: t.phone, email: t.email, logoUrl: t.logoUrl, primaryColor: t.primaryColor };
    return { ...t, settings, letterhead, today: schoolNow(t.timezone).date };
  }

  async settings(): Promise<AdmissionsSettings> {
    return (await this.school()).settings;
  }

  /** Kept under `admissions` in the tenant's operations settings column. */
  async setSettings(settings: AdmissionsSettings): Promise<AdmissionsSettings> {
    const tenantId = currentTenantId();
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { operationsSettings: true } });
    const ops = (t.operationsSettings as Record<string, unknown> | null) ?? {};
    await this.prisma.root.tenant.update({ where: { id: tenantId }, data: { operationsSettings: { ...ops, admissions: settings } as unknown as Prisma.InputJsonValue } });
    await this.audit.log({
      action: 'admissions.settings',
      summary: `Updated admissions settings (application fee ${settings.applicationFeeKobo ? formatMoney(settings.applicationFeeKobo) : 'none'})`,
    });
    return this.settings();
  }

  async meta(): Promise<AdmissionsMeta> {
    const db = this.prisma.db;
    const school = await this.school();
    const [levels, counts, terms] = await Promise.all([
      db.classLevel.findMany({ orderBy: { order: 'asc' }, select: { id: true, name: true, arms: { select: { id: true, name: true, capacity: true }, orderBy: { name: 'asc' } } } }),
      db.student.groupBy({ by: ['classArmId'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
      db.term.findMany({ where: { endsOn: { gte: parseDate(school.today) } }, include: { session: { select: { name: true } } }, orderBy: { startsOn: 'asc' }, take: 6 }),
    ]);
    const perArm = new Map(counts.map((c) => [c.classArmId, c._count._all]));
    return {
      settings: school.settings,
      currency: school.currency,
      today: school.today,
      classLevels: levels.map((l) => ({ id: l.id, name: l.name, arms: l.arms.map((a) => ({ id: a.id, name: a.name, capacity: a.capacity, students: perArm.get(a.id) ?? 0 })) })),
      terms: terms.map((t) => ({ id: t.id, name: t.name, session: t.session.name, isCurrent: t.isCurrent, startsOn: dateOnly(t.startsOn)!, endsOn: dateOnly(t.endsOn)! })),
      school: school.letterhead,
    };
  }

  private async levelNames(): Promise<Map<string, string>> {
    const levels = await this.prisma.db.classLevel.findMany({ select: { id: true, name: true } });
    return new Map(levels.map((l) => [l.id, l.name]));
  }

  // ---------------------------------------------------------- rows

  row(a: App, levels: Map<string, string>): AdmissionRow {
    return {
      id: a.id,
      number: a.number,
      status: a.status as AdmissionStatus,
      source: a.source as AdmissionSource,
      childName: childName(a),
      childFirstName: a.childFirstName,
      childLastName: a.childLastName,
      gender: a.gender,
      dateOfBirth: dateOnly(a.dateOfBirth),
      classLevel: a.classLevelId ? { id: a.classLevelId, name: levels.get(a.classLevelId) ?? 'Class removed' } : null,
      entryTerm: a.entryTerm,
      parentName: a.parentName,
      parentPhone: a.parentPhone,
      parentEmail: a.parentEmail,
      examAt: a.examAt?.toISOString() ?? null,
      examVenue: a.examVenue,
      examScore: a.examScore,
      interviewAt: a.interviewAt?.toISOString() ?? null,
      offerExpiresOn: dateOnly(a.offerExpiresOn),
      feeDue: !!a.applicationFeeKobo && !a.feePaidAt,
      documentsCount: docsOf(a.documents).length,
      studentId: a.studentId,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    };
  }

  async list(q: ApplicationListQuery): Promise<AdmissionList> {
    const db = this.prisma.db;
    const school = await this.school();
    const terms = q.q?.split(/\s+/).filter(Boolean) ?? [];
    const base: Prisma.AdmissionApplicationWhereInput = {
      ...(q.classLevelId ? { classLevelId: q.classLevelId === 'none' ? null : q.classLevelId } : {}),
      ...(q.source ? { source: q.source } : {}),
      ...(q.from || q.to
        ? { createdAt: { ...(q.from ? { gte: dayBounds(q.from, school.timezone).gte } : {}), ...(q.to ? { lt: dayBounds(q.to, school.timezone).lt } : {}) } }
        : {}),
      AND: terms.map((t) => ({
        OR: [
          { number: { contains: t, mode: 'insensitive' as const } },
          { childFirstName: { contains: t, mode: 'insensitive' as const } },
          { childLastName: { contains: t, mode: 'insensitive' as const } },
          { parentName: { contains: t, mode: 'insensitive' as const } },
          { parentPhone: { contains: t } },
        ],
      })),
    };
    const status: Prisma.AdmissionApplicationWhereInput =
      q.status === 'OPEN'
        ? { status: { in: ['SUBMITTED', 'REVIEWING', 'EXAM_SCHEDULED', 'INTERVIEW', 'OFFERED', 'ACCEPTED', 'WAITLISTED'] } }
        : q.status && q.status !== 'ALL'
          ? { status: q.status }
          : {};
    const where = { ...base, ...status };
    const [rows, total, grouped, levels] = await Promise.all([
      db.admissionApplication.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.admissionApplication.count({ where }),
      db.admissionApplication.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      this.levelNames(),
    ]);
    const counts = Object.fromEntries(ADMISSION_STATUSES.map((s) => [s, 0])) as Record<AdmissionStatus, number>;
    for (const g of grouped) if (g.status in counts) counts[g.status as AdmissionStatus] = g._count._all;
    return { items: rows.map((r) => this.row(r, levels)), total, page: q.page, pageSize: q.pageSize, counts };
  }

  async get(id: string): Promise<App> {
    const a = await this.prisma.db.admissionApplication.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Application not found');
    return a;
  }

  async detail(id: string): Promise<AdmissionDetail> {
    const a = await this.get(id);
    const [levels, timeline, student, creator] = await Promise.all([
      this.levelNames(),
      this.timeline(a.id),
      a.studentId
        ? this.prisma.db.student.findUnique({ where: { id: a.studentId }, select: { id: true, firstName: true, lastName: true, admissionNumber: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } } })
        : null,
      a.createdById ? this.prisma.root.user.findUnique({ where: { id: a.createdById }, select: { firstName: true, lastName: true } }) : null,
    ]);
    const status = a.status as AdmissionStatus;
    return {
      ...this.row(a, levels),
      childMiddleName: a.childMiddleName,
      previousSchool: a.previousSchool,
      relationship: a.relationship,
      address: a.address,
      medicalNotes: a.medicalNotes,
      notes: a.notes,
      decisionNote: a.decisionNote,
      applicationFeeKobo: a.applicationFeeKobo,
      feePaidAt: a.feePaidAt?.toISOString() ?? null,
      feeReference: a.feeReference,
      documents: docsOf(a.documents),
      enquiryId: a.enquiryId,
      student: student
        ? { id: student.id, name: fullName(student), admissionNumber: student.admissionNumber, classArm: student.classArm ? `${student.classArm.classLevel.name} ${student.classArm.name}` : null }
        : null,
      createdBy: creator ? fullName(creator) : null,
      timeline,
      next: ADMISSION_NEXT[status] ?? [],
      canEnrol: !a.studentId && ADMISSION_ENROLLABLE.includes(status),
    };
  }

  /** The application's history, from the audit log, with what happened to each message sent. */
  private async timeline(id: string): Promise<AdmissionEvent[]> {
    const logs = await this.prisma.root.auditLog.findMany({
      where: { tenantId: currentTenantId(), entityType: 'AdmissionApplication', entityId: id },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const actorIds = [...new Set(logs.map((l) => l.actorUserId).filter((x): x is string => !!x))];
    const broadcastIds = logs.map((l) => (l.metadata as { broadcastId?: string } | null)?.broadcastId).filter((x): x is string => !!x);
    const [users, deliveries] = await Promise.all([
      actorIds.length ? this.prisma.root.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
      broadcastIds.length
        ? this.prisma.root.delivery.findMany({ where: { tenantId: currentTenantId(), broadcastId: { in: broadcastIds } }, select: { broadcastId: true, status: true, error: true, channel: true } })
        : [],
    ]);
    const names = new Map(users.map((u) => [u.id, fullName(u)]));
    return logs.map((l) => {
      const meta = l.metadata as { broadcastId?: string; channels?: string[] } | null;
      const ds = meta?.broadcastId ? deliveries.filter((d) => d.broadcastId === meta.broadcastId) : [];
      return {
        id: l.id,
        at: l.createdAt.toISOString(),
        action: l.action,
        summary: l.summary,
        actor: l.actorUserId ? (names.get(l.actorUserId) ?? null) : null,
        notification: meta?.broadcastId
          ? {
              channels: meta.channels ?? [...new Set(ds.map((d) => d.channel))],
              sent: ds.filter((d) => d.status === 'SENT').length,
              queued: ds.filter((d) => d.status === 'QUEUED').length,
              failed: ds.filter((d) => d.status === 'FAILED').length,
              skipped: ds.filter((d) => d.status === 'SKIPPED').length,
              problem: ds.find((d) => d.error)?.error ?? null,
            }
          : null,
      };
    });
  }

  private log(a: Pick<App, 'id'>, action: string, summary: string, metadata?: Prisma.InputJsonValue) {
    return this.audit.log({ action, entityType: 'AdmissionApplication', entityId: a.id, summary, metadata });
  }

  // ---------------------------------------------------------- create & edit

  /** APP/2026/0001 — per school, per (school-local) year. */
  private async nextNumber(year: string): Promise<string> {
    const stem = `APP/${year}/`;
    const last = await this.prisma.db.admissionApplication.findFirst({ where: { number: { startsWith: stem } }, orderBy: { number: 'desc' }, select: { number: true } });
    const n = (last ? Number(last.number.slice(stem.length)) || 0 : 0) + 1;
    return `${stem}${String(n).padStart(4, '0')}`;
  }

  private async checkLevel(classLevelId: string | null) {
    if (classLevelId) await this.prisma.db.classLevel.findUniqueOrThrow({ where: { id: classLevelId } });
  }

  async create(input: ApplicationInput, createdById: string | null = currentContext().userId ?? null): Promise<App> {
    const db = this.prisma.db;
    const school = await this.school();
    await this.checkLevel(input.classLevelId);
    const { enquiryId, source, ...data } = input;
    if (enquiryId) {
      const e = await db.enquiry.findUnique({ where: { id: enquiryId } });
      if (!e) throw new BadRequestException('That enquiry no longer exists');
      const taken = await db.admissionApplication.findFirst({ where: { enquiryId }, select: { number: true } });
      if (taken) throw new BadRequestException(`This enquiry already has an application (${taken.number})`);
    }
    const fee = school.settings.applicationFeeKobo || null;
    let app: App | null = null;
    for (let attempt = 0; !app; attempt++) {
      try {
        app = await db.admissionApplication.create({
          data: {
            ...data,
            tenantId: currentTenantId(),
            number: await this.nextNumber(school.today.slice(0, 4)),
            source: enquiryId && source === 'FRONT_DESK' ? 'ENQUIRY' : source,
            enquiryId,
            dateOfBirth: data.dateOfBirth ? parseDate(data.dateOfBirth) : null,
            applicationFeeKobo: fee,
            createdById,
          },
        });
      } catch (e) {
        if (attempt < 4 && isUniqueViolation(e)) continue;
        throw e;
      }
    }
    if (enquiryId) await db.enquiry.updateMany({ where: { id: enquiryId, status: { notIn: ['ENROLLED'] } }, data: { status: 'APPLIED' } });
    await this.log(app, 'admissions.created', `Application ${app.number} for ${childName(app)} received (${source === 'WEBSITE' ? 'school website' : enquiryId ? 'from an enquiry' : 'front desk'})`);
    return app;
  }

  async update(id: string, input: ApplicationInput): Promise<App> {
    const before = await this.get(id);
    if (before.status === 'ENROLLED') throw new BadRequestException('This child is enrolled — edit the student record instead');
    await this.checkLevel(input.classLevelId);
    const { enquiryId: _e, source: _s, ...data } = input;
    const a = await this.prisma.db.admissionApplication.update({ where: { id }, data: { ...data, dateOfBirth: data.dateOfBirth ? parseDate(data.dateOfBirth) : null } });
    await this.log(a, 'admissions.updated', `Updated the details on ${a.number}`);
    return a;
  }

  /**
   * A website application: an admissions application (source WEBSITE) and,
   * for the front desk's follow-up list, a linked enquiry marked Applied.
   */
  async createFromWebsite(body: {
    parentName: string;
    phone: string;
    email: string | null;
    childName: string;
    childGender: 'MALE' | 'FEMALE';
    childDateOfBirth: string | null;
    classOfInterest: string;
    entryTerm: string | null;
    currentSchool: string | null;
    message: string | null;
  }, today: string): Promise<App> {
    const db = this.prisma.db;
    const levels = await db.classLevel.findMany({ select: { id: true, name: true } });
    const level = levels.find((l) => norm(l.name) === norm(body.classOfInterest)) ?? levels.find((l) => norm(body.classOfInterest).includes(norm(l.name)));
    const parentLast = splitParentName(body.parentName, '').lastName;
    const child = splitChildName(body.childName, parentLast || body.childName.trim());
    const notes = [body.childDateOfBirth ? `Date of birth: ${body.childDateOfBirth}` : '', body.currentSchool ? `Current school: ${body.currentSchool}` : '', 'Applied on the school website.'].filter(Boolean).join('\n');
    const enquiry = await db.enquiry.create({
      data: {
        tenantId: currentTenantId(),
        parentName: body.parentName,
        phone: body.phone,
        email: body.email,
        childName: body.childName,
        classOfInterest: body.classOfInterest,
        entryTerm: body.entryTerm,
        source: 'WEBSITE',
        status: 'APPLIED',
        question: body.message,
        notes,
        followUpOn: parseDate(new Date(Date.parse(`${today}T00:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10)),
      },
    });
    return this.create(
      {
        childFirstName: child.first,
        childMiddleName: child.middle,
        childLastName: child.last,
        gender: body.childGender,
        dateOfBirth: body.childDateOfBirth,
        classLevelId: level?.id ?? null,
        entryTerm: body.entryTerm,
        previousSchool: body.currentSchool,
        parentName: body.parentName,
        parentPhone: body.phone,
        parentEmail: body.email,
        relationship: null,
        address: null,
        medicalNotes: null,
        notes: [level ? '' : `Class applied for: ${body.classOfInterest}`, body.message ? `Message from the parent: ${body.message}` : ''].filter(Boolean).join('\n') || null,
        source: 'WEBSITE',
        enquiryId: enquiry.id,
      },
      null,
    );
  }

  /** Prefill for converting a reception enquiry. */
  async enquiryPrefill(enquiryId: string) {
    const db = this.prisma.db;
    const e = await db.enquiry.findUnique({ where: { id: enquiryId } });
    if (!e) throw new NotFoundException('Enquiry not found');
    const existing = await db.admissionApplication.findFirst({ where: { enquiryId }, select: { id: true, number: true } });
    const levels = await db.classLevel.findMany({ select: { id: true, name: true } });
    const wanted = e.classOfInterest ? levels.find((l) => norm(l.name) === norm(e.classOfInterest!)) ?? levels.find((l) => norm(e.classOfInterest!).includes(norm(l.name))) : undefined;
    const parentLast = splitParentName(e.parentName, '').lastName;
    const child = e.childName ? splitChildName(e.childName, parentLast) : null;
    return {
      enquiry: { id: e.id, parentName: e.parentName, phone: e.phone, childName: e.childName, classOfInterest: e.classOfInterest, status: e.status },
      existing,
      prefill: {
        childFirstName: child?.first ?? '',
        childMiddleName: child?.middle ?? '',
        childLastName: child?.last ?? parentLast,
        classLevelId: wanted?.id ?? null,
        entryTerm: e.entryTerm ?? '',
        parentName: e.parentName,
        parentPhone: e.phone,
        parentEmail: e.email ?? '',
        notes: [e.question ? `Enquiry: ${e.question}` : '', e.notes ?? ''].filter(Boolean).join('\n'),
      },
    };
  }

  // ---------------------------------------------------------- pipeline

  private assertMove(a: App, to: AdmissionStatus) {
    const from = a.status as AdmissionStatus;
    if (!(ADMISSION_NEXT[from] ?? []).includes(to)) {
      throw new BadRequestException(`An application that is ${ADMISSION_STATUS_LABELS[from].toLowerCase()} can't be moved to ${ADMISSION_STATUS_LABELS[to].toLowerCase()}`);
    }
  }

  async move(id: string, to: 'REVIEWING' | 'ACCEPTED' | 'WITHDRAWN', note: string | null): Promise<App> {
    const a = await this.get(id);
    this.assertMove(a, to);
    const updated = await this.prisma.db.admissionApplication.update({
      where: { id },
      data: { status: to, ...(note ? { decisionNote: note } : {}) },
    });
    if (to === 'WITHDRAWN' && a.enquiryId) await this.prisma.db.enquiry.updateMany({ where: { id: a.enquiryId }, data: { status: 'CLOSED' } });
    const verb = to === 'REVIEWING' ? (a.status === 'SUBMITTED' ? 'Started reviewing' : 'Reopened') : to === 'ACCEPTED' ? 'Family accepted the offer for' : 'Withdrew';
    await this.log(updated, `admissions.${to.toLowerCase()}`, `${verb} ${updated.number}${note ? ` — ${note}` : ''}`);
    return updated;
  }

  async schedule(id: string, body: { examAt: string | null; examVenue: string | null; interviewAt: string | null; notify: boolean }): Promise<App> {
    const a = await this.get(id);
    const to: AdmissionStatus = body.examAt ? 'EXAM_SCHEDULED' : 'INTERVIEW';
    this.assertMove(a, to);
    const school = await this.school();
    const updated = await this.prisma.db.admissionApplication.update({
      where: { id },
      data: {
        status: to,
        examAt: body.examAt ? new Date(body.examAt) : a.examAt,
        examVenue: body.examAt ? body.examVenue : a.examVenue,
        interviewAt: body.interviewAt ? new Date(body.interviewAt) : to === 'INTERVIEW' ? null : a.interviewAt,
      },
    });
    const parts = [
      body.examAt ? `entrance exam ${whenText(new Date(body.examAt), school.timezone)}${body.examVenue ? ` at ${body.examVenue}` : ''}` : '',
      body.interviewAt ? `interview ${whenText(new Date(body.interviewAt), school.timezone)}` : '',
    ].filter(Boolean);
    await this.log(updated, 'admissions.scheduled', `Booked ${parts.join(' and ')} for ${updated.number}`);
    if (body.notify) await this.notify(updated, body.examAt ? 'EXAM' : 'INTERVIEW');
    return updated;
  }

  async score(id: string, body: { examScore: number; note: string | null }): Promise<App> {
    const a = await this.get(id);
    if (['ENROLLED', 'WITHDRAWN'].includes(a.status)) throw new BadRequestException('This application is closed');
    const notes = body.note ? [a.notes, `Exam: ${body.note}`].filter(Boolean).join('\n') : a.notes;
    const updated = await this.prisma.db.admissionApplication.update({ where: { id }, data: { examScore: body.examScore, notes } });
    await this.log(updated, 'admissions.scored', `Recorded an entrance exam score of ${body.examScore} for ${updated.number}${body.note ? ` — ${body.note}` : ''}`);
    return updated;
  }

  async offer(id: string, body: { offerExpiresOn: string; note: string | null; classLevelId: string | null; notify: boolean }): Promise<App> {
    const a = await this.get(id);
    this.assertMove(a, 'OFFERED');
    const school = await this.school();
    if (body.offerExpiresOn < school.today) throw new BadRequestException('The acceptance deadline has already passed');
    await this.checkLevel(body.classLevelId);
    const updated = await this.prisma.db.admissionApplication.update({
      where: { id },
      data: { status: 'OFFERED', offerExpiresOn: parseDate(body.offerExpiresOn), decisionNote: body.note, ...(body.classLevelId ? { classLevelId: body.classLevelId } : {}) },
    });
    const level = updated.classLevelId ? (await this.levelNames()).get(updated.classLevelId) : null;
    await this.log(updated, 'admissions.offered', `${a.status === 'OFFERED' ? 'Updated the offer' : 'Offered a place'}${level ? ` in ${level}` : ''} to ${childName(updated)} (${updated.number}), to accept by ${body.offerExpiresOn}`);
    if (body.notify) await this.notify(updated, 'OFFER');
    return updated;
  }

  async decide(id: string, body: { outcome: 'REJECTED' | 'WAITLISTED'; note: string | null; notify: boolean }): Promise<App> {
    const a = await this.get(id);
    this.assertMove(a, body.outcome);
    const updated = await this.prisma.db.admissionApplication.update({ where: { id }, data: { status: body.outcome, decisionNote: body.note } });
    if (body.outcome === 'REJECTED' && a.enquiryId) await this.prisma.db.enquiry.updateMany({ where: { id: a.enquiryId }, data: { status: 'CLOSED' } });
    await this.log(updated, `admissions.${body.outcome.toLowerCase()}`, `${body.outcome === 'REJECTED' ? 'Did not offer a place to' : 'Put on the waiting list:'} ${childName(updated)} (${updated.number})${body.note ? ` — ${body.note}` : ''}`);
    if (body.notify) await this.notify(updated, body.outcome);
    return updated;
  }

  async recordFee(id: string, body: { reference: string; paidOn: string | null }): Promise<App> {
    const a = await this.get(id);
    const school = await this.school();
    const amount = a.applicationFeeKobo || school.settings.applicationFeeKobo;
    if (!amount) throw new BadRequestException('There is no application fee to record');
    if (a.feePaidAt) throw new BadRequestException('The application fee is already recorded as paid');
    const updated = await this.prisma.db.admissionApplication.update({
      where: { id },
      data: { applicationFeeKobo: amount, feePaidAt: body.paidOn ? parseDate(body.paidOn) : new Date(), feeReference: body.reference },
    });
    await this.log(updated, 'admissions.fee_paid', `Recorded the ${formatMoney(amount, school.currency)} application fee for ${updated.number} (ref ${body.reference})`);
    return updated;
  }

  // ---------------------------------------------------------- documents

  async addDocument(id: string, doc: AdmissionDocument): Promise<App> {
    const a = await this.get(id);
    const file = await this.prisma.db.fileObject.findUnique({ where: { id: doc.fileId }, select: { id: true, filename: true } });
    if (!file) throw new BadRequestException('Upload the file first');
    const docs = docsOf(a.documents).filter((d) => d.fileId !== doc.fileId);
    if (docs.length >= 20) throw new BadRequestException('An application can hold up to 20 documents');
    const updated = await this.prisma.db.admissionApplication.update({ where: { id }, data: { documents: [...docs, doc] as unknown as Prisma.InputJsonValue } });
    await this.log(updated, 'admissions.document', `Attached ${doc.kind.toLowerCase()} (${doc.name}) to ${updated.number}`);
    return updated;
  }

  async removeDocument(id: string, fileId: string): Promise<App> {
    const a = await this.get(id);
    const docs = docsOf(a.documents);
    const doc = docs.find((d) => d.fileId === fileId);
    if (!doc) throw new NotFoundException('Document not found');
    const updated = await this.prisma.db.admissionApplication.update({ where: { id }, data: { documents: docs.filter((d) => d.fileId !== fileId) as unknown as Prisma.InputJsonValue } });
    await this.log(updated, 'admissions.document_removed', `Removed ${doc.kind.toLowerCase()} (${doc.name}) from ${updated.number}`);
    return updated;
  }

  async documentFileId(id: string, fileId: string): Promise<string> {
    const a = await this.get(id);
    if (!docsOf(a.documents).some((d) => d.fileId === fileId)) throw new NotFoundException('Document not found');
    return fileId;
  }

  // ---------------------------------------------------------- notifications

  /**
   * Tells the parent by the school's configured channels (SMS/email), through
   * the normal messaging pipeline so it shows in Messages with delivery
   * status. Never fails the action that triggered it.
   */
  async notify(a: App, kind: NoticeKind, extra: { admissionNumber?: string; classArm?: string; invoice?: { number: string; totalKobo: number } | null } = {}): Promise<boolean> {
    try {
      const school = await this.school();
      const phone = normalisePhone(a.parentPhone);
      const channels = school.settings.notifyChannels.filter((c) => (c === 'SMS' ? !!phone : !!a.parentEmail));
      if (!channels.length) return false;
      const level = a.classLevelId ? (await this.levelNames()).get(a.classLevelId) ?? null : null;
      const msg = admissionNotice(kind, {
        school: { name: school.name, phone: school.phone, timezone: school.timezone, currency: school.currency },
        parentName: a.parentName,
        childFirstName: a.childFirstName,
        childName: childName(a),
        number: a.number,
        classLevel: level,
        entryTerm: a.entryTerm,
        examAt: a.examAt,
        examVenue: a.examVenue,
        interviewAt: a.interviewAt,
        examInstructions: school.settings.examInstructions,
        offerExpiresOn: a.offerExpiresOn,
        offerNote: a.decisionNote,
        ...extra,
      });
      const tenantId = currentTenantId();
      const audience: Audience = { type: 'CONTACTS', contacts: [{ name: a.parentName, email: a.parentEmail, phone: a.parentPhone.slice(0, 20) }] };
      const b = await this.prisma.db.broadcast.create({
        data: {
          tenantId,
          title: msg.title,
          channels,
          audience: audience as unknown as Prisma.InputJsonValue,
          audienceSummary: a.parentName,
          subject: msg.subject,
          body: msg.body,
          smsBody: msg.sms,
          source: 'ADMISSIONS',
          createdById: RequestContextStore.get()?.userId ?? null,
        },
      });
      await this.sender.start(tenantId, b.id);
      const how = channels.map((c) => (c === 'SMS' ? 'SMS' : 'email')).join(' and ');
      await this.log(a, 'admissions.notified', `Sent "${msg.title}" to ${a.parentName} by ${how}`, { broadcastId: b.id, channels });
      return true;
    } catch (err) {
      this.logger.warn(`Admissions notice for ${a.number} not sent: ${(err as Error).message}`);
      await this.log(a, 'admissions.notify_failed', `Couldn't message ${a.parentName}: ${(err as Error).message}`.slice(0, 300));
      return false;
    }
  }

  // ---------------------------------------------------------- enrolment

  /** e.g. GRE/2026/0042 — the same series the Students page uses. */
  private async nextAdmissionNumber(client: unknown): Promise<string> {
    const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { slug: true, shortName: true } });
    const prefix = `${(tenant.shortName ?? tenant.slug).replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase()}/${new Date().getFullYear()}/`;
    const last = await (client as Tx).student.findFirst({
      where: { tenantId: currentTenantId(), admissionNumber: { startsWith: prefix } },
      orderBy: { admissionNumber: 'desc' },
      select: { admissionNumber: true },
    });
    const next = (last ? Number(last.admissionNumber.slice(prefix.length)) || 0 : 0) + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  /** Compulsory fees for a class level in a term. */
  async feeSummary(classLevelId: string | null, termId?: string | null): Promise<FeeSummary | null> {
    const db = this.prisma.db;
    const term = termId ? await db.term.findUnique({ where: { id: termId } }) : await db.term.findFirst({ where: { isCurrent: true } });
    if (!term) return null;
    const fees = await db.feeItem.findMany({ where: { termId: term.id, optional: false }, orderBy: { name: 'asc' } });
    const items = fees.filter((f) => !f.classLevelIds.length || !classLevelId || f.classLevelIds.includes(classLevelId));
    if (!items.length) return null;
    return { termId: term.id, termName: term.name, items: items.map((f) => ({ name: f.name, amountKobo: f.amountKobo })), totalKobo: items.reduce((n, f) => n + f.amountKobo, 0) };
  }

  private async guardianMatches(phone: string, email: string | null) {
    const wanted = normalisePhone(phone);
    const lowered = email?.toLowerCase() ?? null;
    // Phones are stored as typed ("0803 123 4567", "+234…"), so compare normalised numbers.
    const all = await this.prisma.db.guardian.findMany({ select: { id: true, phone: true, email: true } });
    const ids = all.filter((g) => (wanted && normalisePhone(g.phone) === wanted) || (lowered && g.email?.toLowerCase() === lowered)).map((g) => g.id).slice(0, 20);
    const candidates = ids.length
      ? await this.prisma.db.guardian.findMany({ where: { id: { in: ids } }, include: { students: { include: { student: { select: { firstName: true, lastName: true } } } } } })
      : [];
    return candidates
      .map((g) => {
        const byPhone = !!wanted && normalisePhone(g.phone) === wanted;
        const byEmail = !!email && g.email?.toLowerCase() === email.toLowerCase();
        return { g, byPhone, byEmail };
      })
      .filter((m) => m.byPhone || m.byEmail)
      .map(({ g, byPhone, byEmail }) => ({
        id: g.id,
        name: fullName(g),
        phone: g.phone,
        email: g.email,
        relationship: g.relationship,
        hasLogin: !!g.userId,
        children: g.students.map((s) => fullName(s.student)),
        matchedOn: (byPhone && byEmail ? 'both' : byPhone ? 'phone' : 'email') as 'phone' | 'email' | 'both',
      }));
  }

  async enrolPreview(id: string): Promise<EnrolPreview> {
    const a = await this.get(id);
    const db = this.prisma.db;
    const [admissionNumber, matches, arms, counts, fees, account] = await Promise.all([
      this.nextAdmissionNumber(db),
      this.guardianMatches(a.parentPhone, a.parentEmail),
      db.classArm.findMany({ where: a.classLevelId ? { classLevelId: a.classLevelId } : {}, include: { classLevel: { select: { name: true, order: true } } }, orderBy: [{ classLevel: { order: 'asc' } }, { name: 'asc' }] }),
      db.student.groupBy({ by: ['classArmId'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
      this.feeSummary(a.classLevelId),
      a.parentEmail ? this.prisma.root.user.findUnique({ where: { email: a.parentEmail }, select: { id: true } }) : null,
    ]);
    const perArm = new Map(counts.map((c) => [c.classArmId, c._count._all]));
    const name = splitParentName(a.parentName, a.childLastName);
    return {
      alreadyEnrolled: !!a.studentId,
      admissionNumber,
      suggestedGuardian: { firstName: name.firstName, lastName: name.lastName, relationship: a.relationship ?? 'Parent', phone: a.parentPhone, email: a.parentEmail },
      guardianMatches: matches,
      emailHasAccount: !!account,
      arms: arms.map((r) => ({ id: r.id, name: r.name, classLevel: r.classLevel.name, capacity: r.capacity, students: perArm.get(r.id) ?? 0 })),
      fees,
    };
  }

  /**
   * One step from applicant to student: the student record, the parent (new
   * or an existing one), optionally a portal login and the first invoice, all
   * in one transaction. Safe to retry: a second call never creates a second
   * student.
   */
  async enrol(id: string, body: EnrolApplicantInput): Promise<EnrolResult> {
    const db = this.prisma.db;
    const tenantId = currentTenantId();
    const a = await this.get(id);
    if (a.studentId) return this.enrolledResult(a);
    if (!ADMISSION_ENROLLABLE.includes(a.status as AdmissionStatus)) {
      throw new BadRequestException(`An application that is ${ADMISSION_STATUS_LABELS[a.status as AdmissionStatus].toLowerCase()} can't be enrolled — reopen it first`);
    }
    const arm = await db.classArm.findUnique({ where: { id: body.classArmId }, include: { classLevel: { select: { name: true } } } });
    if (!arm) throw new BadRequestException('Choose a class');
    const armLabel = `${arm.classLevel.name} ${arm.name}`;
    const existingGuardian = body.guardianId ? await db.guardian.findUnique({ where: { id: body.guardianId } }) : null;
    if (body.guardianId && !existingGuardian) throw new BadRequestException('That parent record no longer exists');
    const loginEmail = (existingGuardian ? existingGuardian.email : body.guardian.email)?.toLowerCase() ?? null;
    if (body.createLogin && !loginEmail) throw new BadRequestException('Add the parent’s email address to create a portal login');
    if (body.admissionNumber && (await db.student.findFirst({ where: { admissionNumber: { equals: body.admissionNumber, mode: 'insensitive' } }, select: { id: true } }))) {
      throw new BadRequestException(`Admission number ${body.admissionNumber} is already in use`);
    }
    const parentRole = body.createLogin ? await db.role.findFirst({ where: { key: 'parent' } }) : null;
    if (body.createLogin && !parentRole) throw new BadRequestException('This school has no Parent role');
    // Hash outside the transaction: scrypt is deliberately slow.
    const password = body.createLogin && !existingGuardian?.userId ? newPassword() : null;
    const passwordHash = password ? await hashPassword(password) : null;
    const termId = body.raiseInvoice ? (body.termId ?? (await db.term.findFirst({ where: { isCurrent: true }, select: { id: true } }))?.id ?? null) : null;
    const school = await this.school();

    const result = await db.$transaction(
      async (tx) => {
        // Claim the application first, so two clicks can't make two students.
        const claim = await tx.admissionApplication.updateMany({ where: { id, studentId: null, status: { in: ADMISSION_ENROLLABLE } }, data: { status: 'ENROLLED' } });
        if (!claim.count) throw new ConflictException('This applicant has just been enrolled — refresh the page');
        const admissionNumber = body.admissionNumber ?? (await this.nextAdmissionNumber(tx));
        const student = await tx.student.create({
          data: {
            tenantId,
            admissionNumber,
            firstName: a.childFirstName,
            middleName: a.childMiddleName,
            lastName: a.childLastName,
            gender: a.gender,
            dateOfBirth: a.dateOfBirth,
            classArmId: arm.id,
            admittedOn: body.admittedOn ? parseDate(body.admittedOn) : parseDate(school.today),
            address: a.address,
            medicalNotes: a.medicalNotes,
          },
        });
        const guardian =
          existingGuardian ??
          (await tx.guardian.create({
            data: { tenantId, ...body.guardian, email: body.guardian.email, address: a.address },
          }));
        await tx.studentGuardian.create({ data: { tenantId, studentId: student.id, guardianId: guardian.id, isPrimary: true } });

        let login: EnrolResult['login'] = null;
        if (body.createLogin && loginEmail) {
          if (guardian.userId) login = { email: loginEmail, password: null, existing: true };
          else {
            let user = await tx.user.findUnique({ where: { email: loginEmail } });
            let fresh = false;
            if (!user) {
              user = await tx.user.create({ data: { email: loginEmail, firstName: guardian.firstName, lastName: guardian.lastName, passwordHash: passwordHash! } });
              fresh = true;
            }
            const m = await tx.membership.upsert({ where: { tenantId_userId: { tenantId, userId: user.id } }, update: { status: 'ACTIVE' }, create: { tenantId, userId: user.id } });
            await tx.membershipRole.createMany({ data: [{ membershipId: m.id, roleId: parentRole!.id }], skipDuplicates: true });
            await tx.guardian.update({ where: { id: guardian.id }, data: { userId: user.id } });
            login = { email: loginEmail, password: fresh ? password : null, existing: !fresh };
          }
        }

        let invoice: EnrolResult['invoice'] = null;
        let invoiceNote: string | null = null;
        if (body.raiseInvoice) {
          if (!termId) invoiceNote = 'No current term is set, so no invoice was raised';
          else {
            const r = await this.finance.invoiceStudent(tx, student.id, termId);
            invoice = r.invoice;
            invoiceNote = r.reason;
          }
        }
        await tx.admissionApplication.update({ where: { id }, data: { studentId: student.id } });
        if (a.enquiryId) await tx.enquiry.updateMany({ where: { id: a.enquiryId }, data: { status: 'ENROLLED' } });
        return { student, guardian, guardianCreated: !existingGuardian, login, invoice, invoiceNote };
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    const { student, guardian } = result;
    await this.audit.log({ action: 'students.admitted', entityType: 'Student', entityId: student.id, summary: `Admitted ${student.firstName} ${student.lastName} (${student.admissionNumber}) to ${armLabel} from application ${a.number}` });
    await this.log(
      a,
      'admissions.enrolled',
      `Enrolled ${childName(a)} in ${armLabel} as ${student.admissionNumber}${result.guardianCreated ? '' : `, linked to ${fullName(guardian)}`}${result.login ? ', with a parent portal login' : ''}${result.invoice ? `, invoice ${result.invoice.number}` : ''}`,
    );
    const fresh = await this.get(id);
    const notified = body.notify ? await this.notify(fresh, 'ENROLLED', { admissionNumber: student.admissionNumber, classArm: armLabel, invoice: result.invoice }) : false;
    return {
      student: { id: student.id, name: fullName(student), admissionNumber: student.admissionNumber, classArm: armLabel },
      guardian: { id: guardian.id, name: fullName(guardian), created: result.guardianCreated },
      login: result.login,
      invoice: result.invoice,
      invoiceNote: result.invoiceNote,
      notified,
    };
  }

  /** The outcome of an enrolment already done (a retry, or a second click). */
  private async enrolledResult(a: App): Promise<EnrolResult> {
    const s = await this.prisma.db.student.findUniqueOrThrow({
      where: { id: a.studentId! },
      include: { classArm: { include: { classLevel: true } }, guardians: { orderBy: { isPrimary: 'desc' }, take: 1, include: { guardian: true } } },
    });
    const g = s.guardians[0]?.guardian;
    return {
      student: { id: s.id, name: fullName(s), admissionNumber: s.admissionNumber, classArm: s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}` : '' },
      guardian: g ? { id: g.id, name: fullName(g), created: false } : { id: '', name: '', created: false },
      login: null,
      invoice: null,
      invoiceNote: null,
      notified: false,
    };
  }

  // ---------------------------------------------------------- offer letter

  async offerLetter(id: string): Promise<OfferLetter> {
    const a = await this.get(id);
    if (!a.offerExpiresOn && !['OFFERED', 'ACCEPTED', 'ENROLLED'].includes(a.status)) throw new BadRequestException('No offer has been made on this application yet');
    const [school, levels, offered] = await Promise.all([
      this.school(),
      this.levelNames(),
      this.prisma.root.auditLog.findFirst({ where: { tenantId: currentTenantId(), entityType: 'AdmissionApplication', entityId: a.id, action: 'admissions.offered' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);
    return {
      school: school.letterhead,
      currency: school.currency,
      number: a.number,
      status: a.status as AdmissionStatus,
      childName: childName(a),
      dateOfBirth: dateOnly(a.dateOfBirth),
      classLevel: a.classLevelId ? (levels.get(a.classLevelId) ?? null) : null,
      entryTerm: a.entryTerm,
      parentName: a.parentName,
      address: a.address,
      offeredOn: schoolNow(school.timezone, offered?.createdAt ?? a.updatedAt).date,
      offerExpiresOn: dateOnly(a.offerExpiresOn),
      note: a.decisionNote,
      fees: await this.feeSummary(a.classLevelId),
    };
  }

  // ---------------------------------------------------------- dashboard

  async stats(): Promise<AdmissionsStats> {
    const db = this.prisma.db;
    const school = await this.school();
    const term = await db.term.findFirst({ where: { isCurrent: true }, include: { session: { select: { name: true } } } });
    const from = term ? dateOnly(term.startsOn)! : `${school.today.slice(0, 4)}-01-01`;
    const to = term ? dateOnly(term.endsOn)! : school.today;
    const label = term ? `${term.name}, ${term.session.name}` : `${school.today.slice(0, 4)} so far`;
    // Applications taken this term — including those for next term that come in during it.
    const window = { gte: dayBounds(from, school.timezone).gte, lt: dayBounds(to > school.today ? to : school.today, school.timezone).lt };
    const now = new Date();
    const inThreeDays = parseDate(new Date(Date.parse(`${school.today}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10));
    const [apps, levels, examsThisWeek, offersExpiringSoon] = await Promise.all([
      db.admissionApplication.findMany({ where: { createdAt: window }, select: { status: true, source: true, classLevelId: true, applicationFeeKobo: true, feePaidAt: true } }),
      this.levelNames(),
      db.admissionApplication.count({ where: { status: 'EXAM_SCHEDULED', examAt: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) } } }),
      db.admissionApplication.count({ where: { status: 'OFFERED', offerExpiresOn: { gte: parseDate(school.today), lte: inThreeDays } } }),
    ]);
    const byStatus = Object.fromEntries(ADMISSION_STATUSES.map((s) => [s, 0])) as Record<AdmissionStatus, number>;
    const classes = new Map<string | null, { count: number; enrolled: number }>();
    const sources = new Map<AdmissionSource, number>();
    let fees = 0;
    for (const a of apps) {
      const s = a.status as AdmissionStatus;
      if (s in byStatus) byStatus[s]++;
      const c = classes.get(a.classLevelId) ?? { count: 0, enrolled: 0 };
      c.count++;
      if (s === 'ENROLLED') c.enrolled++;
      classes.set(a.classLevelId, c);
      sources.set(a.source as AdmissionSource, (sources.get(a.source as AdmissionSource) ?? 0) + 1);
      if (a.feePaidAt && a.applicationFeeKobo) fees += a.applicationFeeKobo;
    }
    const offered = byStatus.OFFERED + byStatus.ACCEPTED + byStatus.ENROLLED;
    return {
      window: { label, from, to },
      total: apps.length,
      byStatus,
      conversionRate: apps.length ? byStatus.ENROLLED / apps.length : null,
      offerAcceptanceRate: offered ? (byStatus.ACCEPTED + byStatus.ENROLLED) / offered : null,
      byClass: [...classes.entries()]
        .map(([id, v]) => ({ classLevelId: id, name: id ? (levels.get(id) ?? 'Class removed') : 'Not chosen', ...v }))
        .sort((x, y) => y.count - x.count),
      bySource: [...sources.entries()].map(([source, count]) => ({ source, count })).sort((x, y) => y.count - x.count),
      feesCollectedKobo: fees,
      examsThisWeek,
      offersExpiringSoon,
    };
  }

  // ---------------------------------------------------------- public status

  /**
   * The website's "check my application" box. Number and phone must both
   * match; the answer carries the child's first name and the next step only.
   */
  async publicStatus(number: string, phone: string): Promise<PublicApplicationStatus> {
    const a = await this.prisma.db.admissionApplication.findFirst({ where: { number: { equals: number.trim(), mode: 'insensitive' } } });
    const wanted = normalisePhone(phone);
    const matches = a && wanted && normalisePhone(a.parentPhone) === wanted;
    if (!a || !matches) throw new BadRequestException('We couldn’t find an application with that number and phone number. Check both and try again.');
    const school = await this.school();
    const status = a.status as AdmissionStatus;
    const feeDue = a.applicationFeeKobo && !a.feePaidAt ? formatMoney(a.applicationFeeKobo, school.currency) : null;
    const showDates = status === 'EXAM_SCHEDULED' || status === 'INTERVIEW' || status === 'OFFERED';
    return {
      number: a.number,
      childFirstName: a.childFirstName,
      status,
      label: ADMISSION_STATUS_LABELS[status],
      message: nextSteps(status, {
        childFirstName: a.childFirstName,
        examAt: a.examAt,
        examVenue: a.examVenue,
        interviewAt: a.interviewAt,
        offerExpiresOn: a.offerExpiresOn,
        timezone: school.timezone,
        feeDue,
        examInstructions: school.settings.examInstructions,
      }),
      examAt: showDates ? (a.examAt?.toISOString() ?? null) : null,
      examVenue: showDates ? a.examVenue : null,
      interviewAt: showDates ? (a.interviewAt?.toISOString() ?? null) : null,
      offerExpiresOn: status === 'OFFERED' ? dateOnly(a.offerExpiresOn) : null,
      fee: a.applicationFeeKobo ? { amountKobo: a.applicationFeeKobo, paid: !!a.feePaidAt } : null,
      currency: school.currency,
    };
  }
}
