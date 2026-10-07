import { ConflictException, Injectable, Logger } from '@nestjs/common';
import type { Writable } from 'node:stream';
import { BACKUP_SECTIONS, type BackupExportRow } from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ZipWriter } from './zip-writer';

/** Rows fetched per query (cursor pagination keeps memory flat for big schools). */
const BATCH = 2000;
/** Safety cap per table; a school would need years of daily registers to reach it. */
const MAX_ROWS_PER_TABLE = 2_000_000;

/** Never exported, whatever the table: credentials and anything that could sign someone in. */
export const SENSITIVE_FIELD = /password|secret|token|hash|credential|apikey|recoverycode|totp/i;

interface TableSpec {
  /** Prisma model name (also used to find its column list). */
  model: Prisma.ModelName;
  file: string;
  about: string;
  /** Tables without a single `id` column are paged by these columns instead. */
  orderBy?: string[];
  /** Extra filter on top of tenantId. */
  where?: () => Record<string, unknown>;
}

const TABLES: TableSpec[] = [
  { model: 'Branch', file: 'branches.csv', about: 'Campuses / branches' },
  { model: 'AcademicSession', file: 'academic_sessions.csv', about: 'Academic sessions (years)' },
  { model: 'Term', file: 'terms.csv', about: 'Terms in each session' },
  { model: 'ClassLevel', file: 'class_levels.csv', about: 'Class levels (e.g. JSS 1)' },
  { model: 'ClassArm', file: 'class_arms.csv', about: 'Class arms (e.g. JSS 1 A)' },
  { model: 'Subject', file: 'subjects.csv', about: 'Subjects' },
  { model: 'ClassSubject', file: 'class_subjects.csv', about: 'Which subjects each class takes, and the teacher' },
  { model: 'Department', file: 'departments.csv', about: 'Staff departments' },
  { model: 'Student', file: 'students.csv', about: 'Students, including health notes' },
  { model: 'Guardian', file: 'guardians.csv', about: 'Parents and guardians' },
  { model: 'StudentGuardian', file: 'student_guardians.csv', about: 'Links between students and guardians', orderBy: ['studentId', 'guardianId'] },
  { model: 'Staff', file: 'staff.csv', about: 'Staff records' },
  { model: 'Score', file: 'scores.csv', about: 'Scores per student, subject, term and component (CA, exam…)' },
  { model: 'ReportCard', file: 'report_cards.csv', about: 'Report cards' },
  { model: 'StudentTraitRating', file: 'trait_ratings.csv', about: 'Affective and psychomotor ratings' },
  { model: 'StudentPromotion', file: 'promotions.csv', about: 'End-of-session promotion decisions' },
  { model: 'Homework', file: 'homework.csv', about: 'Homework and assignments' },
  { model: 'HomeworkSubmission', file: 'homework_submissions.csv', about: 'Homework submissions and marks' },
  { model: 'Timetable', file: 'timetables.csv', about: 'Timetables' },
  { model: 'TimetableEntry', file: 'timetable_entries.csv', about: 'Timetable periods' },
  { model: 'AttendanceRegister', file: 'attendance_registers.csv', about: 'Daily class registers' },
  { model: 'StudentAttendance', file: 'student_attendance.csv', about: 'Student attendance marks' },
  { model: 'StaffAttendance', file: 'staff_attendance.csv', about: 'Staff attendance' },
  { model: 'BehaviourRecord', file: 'behaviour_records.csv', about: 'Behaviour and merit records' },
  { model: 'SickBayVisit', file: 'sick_bay_visits.csv', about: 'Sick bay visits' },
  { model: 'FeeItem', file: 'fee_items.csv', about: 'Fee items' },
  { model: 'Invoice', file: 'invoices.csv', about: 'Invoices' },
  { model: 'InvoiceLine', file: 'invoice_lines.csv', about: 'Invoice lines' },
  { model: 'Payment', file: 'payments.csv', about: 'Payments received' },
  { model: 'Expense', file: 'expenses.csv', about: 'Expenses' },
  { model: 'PayrollRun', file: 'payroll_runs.csv', about: 'Payroll runs' },
  { model: 'Payslip', file: 'payslips.csv', about: 'Payslips' },
  { model: 'LeaveRequest', file: 'leave_requests.csv', about: 'Staff leave requests' },
  { model: 'AdmissionApplication', file: 'admission_applications.csv', about: 'Admission applications' },
  { model: 'Enquiry', file: 'enquiries.csv', about: 'Front-office enquiries' },
  { model: 'Visitor', file: 'visitors.csv', about: 'Visitor log' },
  { model: 'Announcement', file: 'announcements.csv', about: 'Announcements' },
  { model: 'SchoolEvent', file: 'events.csv', about: 'Calendar events' },
  { model: 'LibraryBook', file: 'library_books.csv', about: 'Library books' },
  { model: 'LibraryLoan', file: 'library_loans.csv', about: 'Library loans' },
  { model: 'InventoryItem', file: 'inventory_items.csv', about: 'Inventory items' },
  {
    model: 'AuditLog',
    file: 'audit_log.csv',
    about: 'Audit log for the last 12 months',
    where: () => ({ createdAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } }),
  },
];

const BOM = '﻿';

export function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'string') {
    s = v;
    // Spreadsheet formula injection: a name like "=HYPERLINK(...)" must not run when opened in Excel.
    if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  } else if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') s = String(v);
  else if (Prisma.Decimal.isDecimal(v)) s = v.toString();
  else s = JSON.stringify(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const line = (values: unknown[]) => `${values.map(cell).join(',')}\r\n`;

export function columnsOf(model: Prisma.ModelName): string[] | null {
  const fieldEnum = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[`${model}ScalarFieldEnum`];
  if (!fieldEnum) return null;
  return Object.values(fieldEnum);
}

const delegateName = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

type Delegate = { findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]> };

/**
 * One ZIP of CSV files with this school's records — for the school's own
 * safekeeping or to move elsewhere. Strictly tenant-filtered; never includes
 * password hashes, two-step secrets, tokens, or payment keys.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async fileName(tenantId: string): Promise<string> {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { slug: true } });
    return `${t.slug}-school-data-${new Date().toISOString().slice(0, 10)}.zip`;
  }

  claim(tenantId: string) {
    if (this.running.has(tenantId)) throw new ConflictException('An export for this school is already running. Wait for it to finish.');
    this.running.add(tenantId);
  }

  /** Streams the ZIP into `out`. Always writes an audit entry, whether it finished or not. */
  async export(tenantId: string, actorUserId: string, out: Writable): Promise<void> {
    const zip = new ZipWriter(out);
    const counts: Record<string, number> = {};
    let status: 'completed' | 'failed' | 'aborted' = 'completed';
    let error: string | undefined;
    const started = Date.now();
    try {
      const tenant = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId } });

      await zip.addFile('school.csv', this.schoolProfile(tenant));
      counts['school.csv'] = 1;
      counts['users.csv'] = 0;
      await zip.addFile('users.csv', this.users(tenantId, (n) => (counts['users.csv'] = n)));

      for (const spec of TABLES) {
        const columns = columnsOf(spec.model)?.filter((c) => !SENSITIVE_FIELD.test(c));
        // Only tables that carry tenantId can be filtered to this school: anything else is skipped, never guessed.
        if (!columns || !columns.includes('tenantId')) continue;
        const delegate = (this.prisma.root as unknown as Record<string, Delegate | undefined>)[delegateName(spec.model)];
        if (!delegate) continue;
        counts[spec.file] = 0;
        await zip.addFile(spec.file, this.rows(delegate, spec, columns, tenantId, (n) => (counts[spec.file] = n)));
      }

      await zip.addFile('README.txt', this.readme(tenant.name, counts));
      await zip.finish();
      out.end();
    } catch (err) {
      error = (err as Error).message;
      status = /cancelled/i.test(error) || out.destroyed ? 'aborted' : 'failed';
      if (status === 'failed') this.logger.error(`School export failed for ${tenantId}: ${(err as Error).stack ?? error}`);
      out.destroy();
    } finally {
      this.running.delete(tenantId);
      const rows = Object.values(counts).reduce((a, b) => a + b, 0);
      const files = Object.keys(counts).length + (status === 'completed' ? 1 : 0);
      await this.audit.log({
        action: 'backup.export',
        entityType: 'Tenant',
        entityId: tenantId,
        summary:
          status === 'completed'
            ? `Downloaded the school data export (${rows.toLocaleString('en-GB')} rows in ${files} files)`
            : status === 'aborted'
              ? 'A school data export was cancelled before it finished'
              : 'A school data export failed',
        tenantId,
        actorUserId,
        metadata: { status, rows, files, bytes: zip.bytes, seconds: Math.round((Date.now() - started) / 1000), ...(error && status === 'failed' ? { error: error.slice(0, 300) } : {}) },
      });
    }
  }

  async history(tenantId: string): Promise<BackupExportRow[]> {
    const rows = await this.prisma.root.auditLog.findMany({
      where: { tenantId, action: 'backup.export' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { actor: { select: { firstName: true, lastName: true } } },
    });
    return rows.map((r) => {
      const m = (r.metadata ?? {}) as { status?: BackupExportRow['status']; rows?: number; bytes?: number; files?: number };
      return {
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        actorName: r.actor ? `${r.actor.firstName} ${r.actor.lastName}` : null,
        summary: r.summary,
        status: m.status ?? 'completed',
        rows: m.rows ?? null,
        bytes: m.bytes ?? null,
        files: m.files ?? null,
      };
    });
  }

  // ------------------------------------------------------------------ files

  private *schoolProfile(tenant: Record<string, unknown>) {
    const cols = ['id', 'slug', 'name', 'shortName', 'motto', 'email', 'phone', 'address', 'country', 'currency', 'timezone', 'status', 'createdAt'];
    yield BOM + line(cols);
    yield line(cols.map((c) => tenant[c]));
  }

  /** Everyone who can sign in to this school, with their roles — never password or two-step data. */
  private async *users(tenantId: string, count: (n: number) => void) {
    yield BOM + line(['userId', 'firstName', 'lastName', 'email', 'phone', 'accountStatus', 'membershipStatus', 'roles', 'twoStepSignIn', 'lastLoginAt', 'addedAt']);
    let cursor: string | undefined;
    let n = 0;
    for (;;) {
      const batch = await this.prisma.root.membership.findMany({
        where: { tenantId, ...(cursor ? { id: { gt: cursor } } : {}) },
        orderBy: { id: 'asc' },
        take: BATCH,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true, lastLoginAt: true, totpEnabledAt: true } },
          roles: { include: { role: { select: { name: true } } } },
        },
      });
      if (!batch.length) break;
      let chunk = '';
      for (const m of batch) {
        chunk += line([
          m.user.id,
          m.user.firstName,
          m.user.lastName,
          m.user.email,
          m.user.phone,
          m.user.status,
          m.status,
          m.roles.map((r) => r.role.name).join('; '),
          m.user.totpEnabledAt ? 'on' : 'off',
          m.user.lastLoginAt,
          m.createdAt,
        ]);
      }
      n += batch.length;
      count(n);
      yield chunk;
      cursor = batch[batch.length - 1]!.id;
      if (batch.length < BATCH) break;
    }
  }

  private async *rows(delegate: Delegate, spec: TableSpec, columns: string[], tenantId: string, count: (n: number) => void) {
    yield BOM + line(columns);
    const select = Object.fromEntries(columns.map((c) => [c, true]));
    const base = { tenantId, ...(spec.where?.() ?? {}) };
    const byId = !spec.orderBy && columns.includes('id');
    let cursor: string | undefined;
    let skip = 0;
    let n = 0;
    while (n < MAX_ROWS_PER_TABLE) {
      const batch = await delegate.findMany(
        byId
          ? { where: { ...base, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: BATCH, select }
          : { where: base, orderBy: (spec.orderBy ?? columns.slice(0, 2)).map((c) => ({ [c]: 'asc' })), skip, take: BATCH, select },
      );
      if (!batch.length) break;
      let chunk = '';
      for (const row of batch) {
        // Belt and braces: the query is tenant-filtered, but never write another school's row.
        if (row.tenantId !== tenantId) continue;
        chunk += line(columns.map((c) => row[c]));
      }
      n += batch.length;
      skip += batch.length;
      count(n);
      yield chunk;
      cursor = batch[batch.length - 1]!.id as string | undefined;
      if (batch.length < BATCH) break;
    }
  }

  private readme(schoolName: string, counts: Record<string, number>): string {
    const about = new Map<string, string>([
      ['school.csv', 'The school profile'],
      ['users.csv', 'Everyone who can sign in to the school, and their roles (no passwords)'],
      ...TABLES.map((t) => [t.file, t.about] as [string, string]),
    ]);
    const files = Object.entries(counts)
      .map(([f, n]) => `  ${f.padEnd(30)} ${String(n).padStart(9)} rows   ${about.get(f) ?? ''}`)
      .join('\r\n');
    const sections = BACKUP_SECTIONS.map((s) => `  ${s.title}: ${s.items.join(', ')}`).join('\r\n');
    return [
      `${schoolName} - school data export`,
      `Created ${new Date().toUTCString()} by AI School OS`,
      '',
      'WHAT THIS IS',
      "A copy of your school's records as CSV files, one per table. Open them in Excel,",
      'Google Sheets or LibreOffice. Each file starts with a header row; dates and times',
      'are in UTC (ISO 8601). Columns ending in "Id" link rows between files, e.g.',
      'scores.csv studentId matches students.csv id.',
      '',
      'WHAT IS INCLUDED',
      sections,
      '',
      'FILES',
      files,
      '',
      'WHAT IS NOT INCLUDED',
      '  - Passwords, two-step sign-in secrets, recovery codes, sign-in sessions and tokens',
      '  - Payment, SMS and other connected-service keys',
      '  - Uploaded files (photos, documents): only their records',
      '  - Other schools on the platform',
      '  - AI conversations, question banks and lesson content',
      '',
      'NOTES',
      "  - Text that begins with = + - or @ is prefixed with ' so spreadsheets do not run it as a formula.",
      '  - Money amounts are exactly as stored; a column whose name ends in Kobo is in kobo (100 kobo = 1 naira).',
      '',
      'KEEP IT SAFE',
      'This file contains personal information about children, families and staff,',
      'including health notes and salaries. Store it somewhere only authorised people',
      'can reach, and delete old copies you no longer need (NDPA 2023 / UK GDPR).',
      '',
    ].join('\r\n');
  }
}
