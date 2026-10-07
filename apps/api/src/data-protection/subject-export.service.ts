import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Writable } from 'node:stream';
import type { DsrSubjectHit, DsrSubjectType } from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { SENSITIVE_FIELD, columnsOf, line } from '../backup/backup.service';
import { ZipWriter } from '../backup/zip-writer';
import { currentTenantId } from '../common/request-context';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Delegate = { findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]> };
type Row = Record<string, unknown>;

interface Part {
  model: Prisma.ModelName;
  file: string;
  about: string;
  where: Record<string, unknown> | null;
}

/** Rows per table in one person's export; far more than any one person has. */
const MAX_ROWS = 50_000;
/** Account fields safe to hand back (never the password hash or two-step secrets). */
const USER_FIELDS = { id: true, email: true, firstName: true, lastName: true, phone: true, status: true, lastLoginAt: true, totpEnabledAt: true, createdAt: true } as const;

const BOM = '﻿';
const name = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

/**
 * Data subject requests: find one student, parent or member of staff and
 * gather everything the school holds about them, as JSON or a ZIP of CSV
 * files. Built on the school export's column rules (no secrets, tokens or
 * password hashes) and strictly filtered to the current school.
 */
@Injectable()
export class SubjectExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async search(q: string): Promise<DsrSubjectHit[]> {
    const tenantId = currentTenantId();
    const term = q.trim();
    if (term.length < 2) return [];
    const words = term.split(/\s+/).slice(0, 3);
    const nameMatch = (fields: string[]) => ({
      AND: words.map((w) => ({ OR: fields.map((f) => ({ [f]: { contains: w, mode: 'insensitive' } })) })),
    });
    const db = this.prisma.root;
    const [students, guardians, staff] = await Promise.all([
      db.student.findMany({
        where: { tenantId, ...nameMatch(['firstName', 'lastName', 'middleName', 'admissionNumber']) },
        take: 10,
        select: { id: true, firstName: true, lastName: true, admissionNumber: true, status: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } },
      }),
      db.guardian.findMany({
        where: { tenantId, OR: [nameMatch(['firstName', 'lastName']), { phone: { contains: term.replace(/\s+/g, '') } }, { email: { contains: term, mode: 'insensitive' } }] },
        take: 10,
        select: { id: true, firstName: true, lastName: true, phone: true, email: true },
      }),
      db.staff.findMany({
        where: { tenantId, ...nameMatch(['firstName', 'lastName', 'staffNumber']) },
        take: 10,
        select: { id: true, firstName: true, lastName: true, staffNumber: true, jobTitle: true },
      }),
    ]);
    return [
      ...students.map((s) => ({
        type: 'student' as const,
        id: s.id,
        name: name(s),
        detail: [s.admissionNumber, s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}` : null, s.status !== 'ACTIVE' ? s.status.toLowerCase() : null].filter(Boolean).join(' · '),
      })),
      ...guardians.map((g) => ({ type: 'guardian' as const, id: g.id, name: name(g), detail: [g.phone, g.email].filter(Boolean).join(' · ') })),
      ...staff.map((s) => ({ type: 'staff' as const, id: s.id, name: name(s), detail: `${s.staffNumber} · ${s.jobTitle}` })),
    ];
  }

  /** Everything about one person, as JSON. */
  async json(type: DsrSubjectType, id: string): Promise<Record<string, unknown>> {
    const tenantId = currentTenantId();
    const { subject, account, parts } = await this.plan(tenantId, type, id);
    const tables: Record<string, Row[]> = {};
    if (account) tables['account'] = [account];
    for (const p of parts) tables[p.file.replace(/\.csv$/, '')] = (await this.fetch(tenantId, p)).rows;
    await this.log(tenantId, type, subject, 'JSON');
    return {
      about: `Personal data held by ${subject.school} about ${subject.name} (${type}), exported for a data subject request.`,
      generatedAt: new Date().toISOString(),
      subject: { type, id, name: subject.name },
      notIncluded: NOT_INCLUDED,
      tables,
    };
  }

  /** Everything about one person, as a ZIP of CSV files. */
  async zip(type: DsrSubjectType, id: string, out: Writable): Promise<void> {
    const tenantId = currentTenantId();
    const { subject, account, parts } = await this.plan(tenantId, type, id);
    const zip = new ZipWriter(out);
    const counts: [string, number, string][] = [];
    try {
      await this.writeZip(zip, subject, type, account, parts, counts, tenantId);
      out.end();
    } catch {
      // The browser cancelled or the connection dropped: nothing more to send, and headers are already out.
      out.destroy();
      return;
    }
    await this.log(tenantId, type, subject, 'ZIP of CSV files');
  }

  private async writeZip(zip: ZipWriter, subject: { name: string; school: string }, type: DsrSubjectType, account: Row | null, parts: Part[], counts: [string, number, string][], tenantId: string) {
    if (account) {
      await zip.addFile('account.csv', [BOM + line(Object.keys(account)) + line(Object.values(account))]);
      counts.push(['account.csv', 1, 'Their sign-in account (no password or two-step secrets)']);
    }
    for (const p of parts) {
      const { rows, columns } = await this.fetch(tenantId, p);
      let csv = BOM + line(columns);
      for (const r of rows) csv += line(columns.map((c) => r[c]));
      await zip.addFile(p.file, [csv]);
      counts.push([p.file, rows.length, p.about]);
    }
    await zip.addFile('README.txt', [
      [
        `Personal data held by ${subject.school} about ${subject.name} (${type})`,
        `Created ${new Date().toUTCString()} by AI School OS for a data subject request.`,
        '',
        'FILES',
        ...counts.map(([f, n, about]) => `  ${f.padEnd(32)} ${String(n).padStart(7)} rows   ${about}`),
        '',
        'NOT INCLUDED',
        ...NOT_INCLUDED.map((n) => `  - ${n}`),
        '',
        'Dates and times are UTC (ISO 8601). Columns ending in "Id" link rows between files.',
        'This file contains personal data. Send it only to the person entitled to it, by a secure route,',
        'and delete your working copies when the request is closed.',
        '',
      ].join('\r\n'),
    ]);
    await zip.finish();
  }

  async fileName(type: DsrSubjectType, id: string): Promise<string> {
    const tenantId = currentTenantId();
    const { subject } = await this.plan(tenantId, type, id);
    return `${subject.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || type}-${type}-data-${new Date().toISOString().slice(0, 10)}`;
  }

  // ------------------------------------------------------------------ internals

  private async log(tenantId: string, type: DsrSubjectType, subject: { name: string }, format: string) {
    await this.audit.log({
      action: 'privacy.subject_export',
      entityType: type === 'student' ? 'Student' : type === 'guardian' ? 'Guardian' : 'Staff',
      summary: `Exported all data about ${subject.name} (${type}) for a data subject request (${format})`,
      tenantId,
      metadata: { type, format },
    });
  }

  private async fetch(tenantId: string, p: Part): Promise<{ rows: Row[]; columns: string[] }> {
    const columns = (columnsOf(p.model) ?? []).filter((c) => !SENSITIVE_FIELD.test(c));
    if (!p.where || !columns.length) return { rows: [], columns };
    const delegate = (this.prisma.root as unknown as Record<string, Delegate | undefined>)[p.model.charAt(0).toLowerCase() + p.model.slice(1)];
    if (!delegate) return { rows: [], columns };
    const where = columns.includes('tenantId') ? { ...p.where, tenantId } : p.where;
    const rows = await delegate.findMany({ where, select: Object.fromEntries(columns.map((c) => [c, true])), take: MAX_ROWS });
    // Belt and braces: never hand over another school's row.
    return { rows: columns.includes('tenantId') ? rows.filter((r) => r.tenantId === tenantId) : rows, columns };
  }

  private async account(userId: string | null) {
    if (!userId) return null;
    const u = await this.prisma.root.user.findUnique({ where: { id: userId }, select: USER_FIELDS });
    return u ? ({ ...u, totpEnabledAt: undefined, twoStepSignIn: u.totpEnabledAt ? 'on' : 'off' } as Row) : null;
  }

  private async conversations(tenantId: string, where: Record<string, unknown>) {
    const convs = await this.prisma.root.aiConversation.findMany({ where: { tenantId, ...where }, select: { id: true } });
    return convs.map((c) => c.id);
  }

  private async plan(tenantId: string, type: DsrSubjectType, id: string): Promise<{ subject: { name: string; school: string }; account: Row | null; parts: Part[] }> {
    const db = this.prisma.root;
    const school = (await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } })).name;
    const P = (model: Prisma.ModelName, file: string, about: string, where: Record<string, unknown> | null): Part => ({ model, file, about, where });

    if (type === 'student') {
      const s = await db.student.findFirst({ where: { id, tenantId }, select: { id: true, firstName: true, lastName: true, userId: true } });
      if (!s) throw new NotFoundException('Student not found in this school');
      const bySt = { studentId: s.id };
      const convIds = await this.conversations(tenantId, { OR: [{ studentId: s.id }, ...(s.userId ? [{ userId: s.userId }] : [])] });
      const invoices = await db.invoice.findMany({ where: { tenantId, studentId: s.id }, select: { id: true } });
      const links = await db.studentGuardian.findMany({ where: { tenantId, studentId: s.id }, select: { guardianId: true } });
      return {
        subject: { name: name(s), school },
        account: await this.account(s.userId),
        parts: [
          P('Student', 'student.csv', 'Student record, including health details', { id: s.id }),
          P('StudentGuardian', 'guardian_links.csv', 'Links to parents and guardians', bySt),
          P('Guardian', 'guardians.csv', 'Their parents and guardians', { id: { in: links.map((l) => l.guardianId) } }),
          P('StudentAttendance', 'attendance.csv', 'Attendance marks', bySt),
          P('Score', 'scores.csv', 'Scores', bySt),
          P('ReportCard', 'report_cards.csv', 'Report cards', bySt),
          P('StudentTraitRating', 'trait_ratings.csv', 'Affective and psychomotor ratings', bySt),
          P('StudentPromotion', 'promotions.csv', 'Promotion decisions', bySt),
          P('OnlineExamAttempt', 'online_exam_attempts.csv', 'Online (CBT) exam attempts', bySt),
          P('HomeworkSubmission', 'homework_submissions.csv', 'Homework submissions and marks', bySt),
          P('BehaviourRecord', 'behaviour_records.csv', 'Behaviour and merit records', bySt),
          P('SickBayVisit', 'sick_bay_visits.csv', 'Sick bay visits', bySt),
          P('HousePointEntry', 'house_points.csv', 'House points', bySt),
          P('Invoice', 'invoices.csv', 'Fee invoices', bySt),
          P('InvoiceLine', 'invoice_lines.csv', 'Fee invoice lines', invoices.length ? { invoiceId: { in: invoices.map((i) => i.id) } } : null),
          P('Payment', 'payments.csv', 'Fee payments', bySt),
          P('StudentDiscount', 'discounts.csv', 'Fee discounts and scholarships', bySt),
          P('LibraryLoan', 'library_loans.csv', 'Library loans', bySt),
          P('TransportAssignment', 'transport.csv', 'School transport', bySt),
          P('HostelAllocation', 'hostel.csv', 'Hostel beds', bySt),
          P('Exeat', 'exeats.csv', 'Exeats', bySt),
          P('StudentPickup', 'pickups.csv', 'Authorised pick-ups', bySt),
          P('Certificate', 'certificates.csv', 'Certificates', bySt),
          P('LiveAttendance', 'live_class_attendance.csv', 'Live class attendance', bySt),
          P('AdmissionApplication', 'admission_applications.csv', 'Admission applications', bySt),
          P('AlumniProfile', 'alumni.csv', 'Alumni profile', bySt),
          P('CareerProfile', 'career_profile.csv', 'Career interests and plans', bySt),
          P('MasteryRecord', 'mastery.csv', 'Topic mastery', bySt),
          P('MasteryEvidence', 'mastery_evidence.csv', 'Evidence behind topic mastery', bySt),
          P('StudyPlan', 'study_plans.csv', 'Study plans', bySt),
          P('FlashcardDeck', 'flashcards.csv', 'Flashcard decks', bySt),
          P('PracticeAttempt', 'practice_attempts.csv', 'Practice attempts', bySt),
          P('StudentMemory', 'ai_tutor_notes.csv', 'What the AI tutor remembers about how they learn', bySt),
          P('LearningUpdate', 'learning_updates.csv', 'Weekly learning updates to parents', bySt),
          P('StudentEntitlement', 'ai_entitlements.csv', 'AI and exam-prep access', bySt),
          P('StudentAiUsage', 'ai_allowance_usage.csv', 'AI allowance usage', bySt),
          P('AiConversation', 'ai_conversations.csv', 'AI tutor and assistant conversations', convIds.length ? { id: { in: convIds } } : null),
          P('AiMessage', 'ai_messages.csv', 'Messages in those conversations', convIds.length ? { conversationId: { in: convIds } } : null),
          P('AiUsage', 'ai_usage.csv', 'AI usage records (counts and costs, no content)', { OR: [{ studentId: s.id }, ...(s.userId ? [{ userId: s.userId }] : [])] }),
          P('Notification', 'notifications.csv', 'In-app notifications', s.userId ? { userId: s.userId } : null),
          P('AuditLog', 'audit_log.csv', 'Audit entries about them or by their account', { OR: [{ entityId: s.id }, ...(s.userId ? [{ actorUserId: s.userId }] : [])] }),
        ],
      };
    }

    if (type === 'guardian') {
      const g = await db.guardian.findFirst({ where: { id, tenantId }, select: { id: true, firstName: true, lastName: true, userId: true } });
      if (!g) throw new NotFoundException('Parent not found in this school');
      const convIds = g.userId ? await this.conversations(tenantId, { userId: g.userId }) : [];
      return {
        subject: { name: name(g), school },
        account: await this.account(g.userId),
        parts: [
          P('Guardian', 'guardian.csv', 'Parent / guardian record, including consent', { id: g.id }),
          P('StudentGuardian', 'children_links.csv', 'Links to their children (see the children’s own exports for their data)', { guardianId: g.id }),
          P('Delivery', 'messages_received.csv', 'Messages sent to them (email, SMS, WhatsApp, in-app)', { guardianId: g.id }),
          P('WhatsAppMessage', 'whatsapp_messages.csv', 'WhatsApp assistant messages', { guardianId: g.id }),
          P('AiConversation', 'ai_conversations.csv', 'Parent AI conversations', convIds.length ? { id: { in: convIds } } : null),
          P('AiMessage', 'ai_messages.csv', 'Messages in those conversations', convIds.length ? { conversationId: { in: convIds } } : null),
          P('AiUsage', 'ai_usage.csv', 'AI usage records (counts and costs, no content)', g.userId ? { userId: g.userId } : null),
          P('Notification', 'notifications.csv', 'In-app notifications', g.userId ? { userId: g.userId } : null),
          P('AuditLog', 'audit_log.csv', 'Audit entries about them or by their account', { OR: [{ entityId: g.id }, ...(g.userId ? [{ actorUserId: g.userId }] : [])] }),
        ],
      };
    }

    if (type === 'staff') {
      const s = await db.staff.findFirst({ where: { id, tenantId }, select: { id: true, firstName: true, lastName: true, userId: true } });
      if (!s) throw new NotFoundException('Staff member not found in this school');
      const bySt = { staffId: s.id };
      const convIds = s.userId ? await this.conversations(tenantId, { userId: s.userId }) : [];
      return {
        subject: { name: name(s), school },
        account: await this.account(s.userId),
        parts: [
          P('Staff', 'staff.csv', 'Staff record', { id: s.id }),
          P('StaffAttendance', 'attendance.csv', 'Staff attendance', bySt),
          P('StaffPayProfile', 'pay_profile.csv', 'Pay profile (salary, bank, deductions)', bySt),
          P('Payslip', 'payslips.csv', 'Payslips', bySt),
          P('LeaveRequest', 'leave_requests.csv', 'Leave requests', bySt),
          P('Award', 'awards.csv', 'Awards and recognition', bySt),
          P('StaffUnavailability', 'unavailability.csv', 'Timetable unavailability', bySt),
          P('Certificate', 'certificates.csv', 'Certificates', bySt),
          P('LibraryLoan', 'library_loans.csv', 'Library loans', bySt),
          P('Delivery', 'messages_received.csv', 'Messages sent to them', bySt),
          P('AiConversation', 'ai_conversations.csv', 'AI assistant conversations', convIds.length ? { id: { in: convIds } } : null),
          P('AiMessage', 'ai_messages.csv', 'Messages in those conversations', convIds.length ? { conversationId: { in: convIds } } : null),
          P('AiUsage', 'ai_usage.csv', 'AI usage records (counts and costs, no content)', s.userId ? { userId: s.userId } : null),
          P('Notification', 'notifications.csv', 'In-app notifications', s.userId ? { userId: s.userId } : null),
          P('AuditLog', 'audit_log.csv', 'Audit entries about them or by their account', { OR: [{ entityId: s.id }, ...(s.userId ? [{ actorUserId: s.userId }] : [])] }),
        ],
      };
    }

    throw new BadRequestException('Unknown kind of person');
  }
}

const NOT_INCLUDED = [
  'Passwords, two-step sign-in secrets, recovery codes, sign-in sessions and tokens',
  'Uploaded files themselves (photos, hand-ins, documents): only their records and links',
  'Records where the person is only mentioned in free text written about someone else',
  'Other schools on the platform',
];
