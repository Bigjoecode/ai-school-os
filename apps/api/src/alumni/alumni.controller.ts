import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Logger, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ALUMNI_CSV_FIELDS,
  ALUMNI_SOURCE_LABELS,
  alumniFilterSchema,
  alumniImportSchema,
  alumniListQuerySchema,
  alumniMessageSchema,
  alumniSchema,
  alumniVerifySchema,
  normalisePhone,
  type AlumniBackfillResult,
  type AlumniCount,
  type AlumniImportResult,
  type AlumniMessageResult,
  type AlumniPending,
  type AlumniRow,
  type AlumniSource,
  type AlumniStats,
  type Audience,
  type Channel,
  type Paginated,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { SenderService } from '../comms/sender.service';
import { RequirePermissions } from '../common/decorators';
import { paginate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { csvCell, normHeader, parseCsv } from '../onboarding/csv';
import { PrismaService } from '../prisma/prisma.service';
import { alumniInclude, alumniRow, AlumniService, alumniWhere } from './alumni.service';
import { recordGraduates } from './graduates';

type AlumniParsed = z.output<typeof alumniSchema>;
type ListParsed = z.output<typeof alumniListQuerySchema>;
type FilterParsed = z.output<typeof alumniFilterSchema>;
type MessageParsed = z.output<typeof alumniMessageSchema>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const titleCase = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/\b([a-z])([a-z']*)/gi, (_m, a: string, b: string) => a.toUpperCase() + b.toLowerCase());

/** Top values of a text column, case-insensitively grouped. */
function topCounts(values: (string | null)[], n = 8): AlumniCount[] {
  const m = new Map<string, AlumniCount>();
  for (const v of values) {
    const t = v?.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    const c = m.get(k) ?? { name: t, count: 0 };
    c.count++;
    m.set(k, c);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, n);
}

/**
 * The alumni directory: graduates, website sign-ups waiting to be
 * verified, CSV import and export, statistics, and messages to old
 * students who agreed to be contacted.
 */
@Controller('alumni')
export class AlumniController {
  private readonly logger = new Logger(AlumniController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alumni: AlumniService,
    private readonly sender: SenderService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('alumni.read')
  async list(@Query(new ZodPipe(alumniListQuerySchema)) q: ListParsed): Promise<Paginated<AlumniRow>> {
    const where = alumniWhere(q);
    const db = this.prisma.db;
    const [rows, total] = await Promise.all([
      db.alumniProfile.findMany({ where, include: alumniInclude, orderBy: [{ graduationYear: { sort: 'desc', nulls: 'last' } }, { lastName: 'asc' }, { firstName: 'asc' }], ...paginate(q.page, q.pageSize) }),
      db.alumniProfile.count({ where }),
    ]);
    return { items: rows.map(alumniRow), total, page: q.page, pageSize: q.pageSize };
  }

  @Get('stats')
  @RequirePermissions('alumni.read')
  async stats(): Promise<AlumniStats> {
    const db = this.prisma.db;
    const [rows, graduatesWithoutRecord] = await Promise.all([
      db.alumniProfile.findMany({ select: { graduationYear: true, verified: true, consentToContact: true, email: true, phone: true, currentInstitution: true, employer: true, occupation: true, city: true, finalClass: true } }),
      db.student.count({ where: { status: 'GRADUATED', alumniProfile: null } }),
    ]);
    const years = new Map<number, number>();
    for (const r of rows) if (r.graduationYear) years.set(r.graduationYear, (years.get(r.graduationYear) ?? 0) + 1);
    const contactable = rows.filter((r) => r.verified && r.consentToContact);
    return {
      total: rows.length,
      verified: rows.filter((r) => r.verified).length,
      pending: rows.filter((r) => !r.verified).length,
      withConsent: rows.filter((r) => r.consentToContact).length,
      reachable: { email: contactable.filter((r) => r.email && EMAIL.test(r.email)).length, sms: contactable.filter((r) => normalisePhone(r.phone)).length },
      byYear: [...years.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year),
      institutions: topCounts(rows.map((r) => r.currentInstitution)),
      employers: topCounts(rows.map((r) => r.employer)),
      occupations: topCounts(rows.map((r) => r.occupation)),
      cities: topCounts(rows.map((r) => r.city)),
      graduatesWithoutRecord,
      years: [...years.keys()].sort((a, b) => b - a),
      finalClasses: [...new Set(rows.map((r) => r.finalClass?.trim()).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    };
  }

  /** Website sign-ups waiting for a member of staff, with likely matches. */
  @Get('pending')
  @RequirePermissions('alumni.read')
  async pending(): Promise<AlumniPending[]> {
    const rows = await this.prisma.db.alumniProfile.findMany({ where: { verified: false }, include: alumniInclude, orderBy: { createdAt: 'desc' }, take: 200 });
    return this.alumni.withMatches(rows);
  }

  @Get('export.csv')
  @RequirePermissions('alumni.read')
  @Header('content-type', 'text/csv; charset=utf-8')
  async exportCsv(@Query(new ZodPipe(alumniFilterSchema)) q: FilterParsed): Promise<string> {
    const rows = await this.prisma.db.alumniProfile.findMany({ where: alumniWhere(q), include: alumniInclude, orderBy: [{ graduationYear: 'desc' }, { lastName: 'asc' }] });
    const fields = ALUMNI_CSV_FIELDS.filter((f) => f.field !== 'name');
    const head = [...fields.map((f) => f.label), 'Admission no.', 'Source', 'Verified'];
    const lines = rows.map((r) =>
      [
        ...fields.map((f) => {
          const v = r[f.field as Exclude<(typeof f)['field'], 'name'>];
          return typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v;
        }),
        r.student?.admissionNumber ?? '',
        ALUMNI_SOURCE_LABELS[r.source as AlumniSource] ?? r.source,
        r.verified ? 'Yes' : 'No',
      ]
        .map(csvCell)
        .join(','),
    );
    await this.audit.log({ action: 'alumni.exported', summary: `Exported ${rows.length} alumni record(s) to CSV` });
    return [head.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n';
  }

  @Post('import')
  @HttpCode(200)
  @RequirePermissions('alumni.manage')
  async import(@Body(new ZodPipe(alumniImportSchema)) body: z.output<typeof alumniImportSchema>): Promise<AlumniImportResult> {
    const { headers, rows } = parseCsv(body.csv);
    if (!headers.length) throw new BadRequestException('The file is empty');
    if (rows.length > 5000) throw new BadRequestException('Import at most 5,000 rows at a time; split the file');
    const used = new Set<string>();
    const columns = headers.map((header) => {
      const h = normHeader(header);
      const f = ALUMNI_CSV_FIELDS.find((x) => !used.has(x.field) && (compact(x.field) === compact(h) || normHeader(x.label) === h || x.aliases.some((a) => normHeader(a) === h)));
      if (f) used.add(f.field);
      return { header, field: f?.field ?? null };
    });
    if (!used.has('name') && !(used.has('firstName') && used.has('lastName'))) {
      throw new BadRequestException('The file needs "First name" and "Surname" columns (or one "Name" column)');
    }
    const db = this.prisma.db;
    const existing = await db.alumniProfile.findMany({ select: { id: true, firstName: true, lastName: true, graduationYear: true, email: true, phone: true } });
    const byEmail = new Map(existing.filter((e) => e.email).map((e) => [e.email!.toLowerCase(), e.id]));
    const byPhone = new Map(existing.map((e) => [normalisePhone(e.phone), e.id]).filter((x): x is [string, string] => !!x[0]));
    const byName = new Map(existing.map((e) => [`${compact(e.firstName)}|${compact(e.lastName)}|${e.graduationYear ?? ''}`, e.id]));

    const result: AlumniImportResult = { dryRun: body.dryRun, create: 0, update: 0, skip: 0, errors: [], columns };
    const ops: { id: string | null; data: Prisma.AlumniProfileUncheckedCreateInput }[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const get = (f: string) => {
        const i = columns.findIndex((c) => c.field === f);
        return i >= 0 ? (r.values[i] ?? '').trim() : '';
      };
      let first = titleCase(get('firstName'));
      let last = titleCase(get('lastName'));
      if ((!first || !last) && get('name')) {
        const parts = titleCase(get('name')).split(' ');
        if (parts.length >= 2) {
          // Nigerian lists often put the surname first in capitals: "OKAFOR Chidi" → surname Okafor.
          const raw = get('name').trim().split(/\s+/);
          const surnameFirst = raw[0] === raw[0]!.toUpperCase() && raw.slice(1).some((p) => p !== p.toUpperCase());
          last ||= surnameFirst ? parts[0]! : parts.at(-1)!;
          first ||= surnameFirst ? parts.slice(1).join(' ') : parts.slice(0, -1).join(' ');
        }
      }
      if (!first || !last) {
        result.errors.push({ line: r.line, message: 'Name is missing' });
        continue;
      }
      const yearRaw = get('graduationYear');
      const yearMatch = /(19|20)\d{2}/.exec(yearRaw);
      if (yearRaw && !yearMatch) {
        result.errors.push({ line: r.line, message: `${first} ${last}: graduation year "${yearRaw}" isn't a year` });
        continue;
      }
      const year = yearMatch ? Number(yearMatch[0]) : null;
      const email = get('email').toLowerCase() || null;
      if (email && !EMAIL.test(email)) {
        result.errors.push({ line: r.line, message: `${first} ${last}: email "${email}" isn't valid` });
        continue;
      }
      const phone = get('phone') || null;
      const consentRaw = get('consentToContact').toLowerCase();
      const consent = consentRaw ? !/^(n|no|false|0|off)$/.test(consentRaw) : true;
      const key = `${compact(first)}|${compact(last)}|${year ?? ''}`;
      if (seen.has(key)) {
        result.skip++;
        result.errors.push({ line: r.line, message: `${first} ${last} appears twice in the file; only the first row is used` });
        continue;
      }
      seen.add(key);
      const id = (email && byEmail.get(email)) || (normalisePhone(phone) && byPhone.get(normalisePhone(phone)!)) || byName.get(key) || null;
      const opt = (f: string, max: number) => get(f).slice(0, max) || null;
      ops.push({
        id,
        data: {
          tenantId: currentTenantId(),
          firstName: first.slice(0, 80),
          lastName: last.slice(0, 80),
          graduationYear: year,
          finalClass: opt('finalClass', 60),
          email,
          phone: phone?.slice(0, 30) ?? null,
          currentInstitution: opt('currentInstitution', 160),
          course: opt('course', 120),
          occupation: opt('occupation', 120),
          employer: opt('employer', 160),
          city: opt('city', 80),
          country: opt('country', 80),
          consentToContact: consent,
          notes: opt('notes', 2000),
          source: 'IMPORTED',
          verified: true,
        },
      });
      if (id) result.update++;
      else result.create++;
    }
    if (body.dryRun) return result;

    await db.$transaction(
      ops.map((o) => {
        if (!o.id) return db.alumniProfile.create({ data: o.data });
        // Updates only fill in what the file has; blanks keep what we know.
        const { tenantId: _t, source: _s, verified: _v, ...rest } = o.data;
        const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null && v !== undefined));
        return db.alumniProfile.update({ where: { id: o.id }, data });
      }),
      { timeout: 120_000 },
    );
    await this.audit.log({ action: 'alumni.imported', summary: `Imported alumni from CSV: ${result.create} added, ${result.update} updated${result.errors.length ? `, ${result.errors.length} row(s) with problems` : ''}` });
    return result;
  }

  /** Alumni records for students already marked GRADUATED (before this feature, or changed by hand). */
  @Post('backfill')
  @HttpCode(200)
  @RequirePermissions('alumni.manage')
  async backfill(): Promise<AlumniBackfillResult> {
    const db = this.prisma.db;
    const students = await db.student.findMany({ where: { status: 'GRADUATED', alumniProfile: null }, select: { id: true, updatedAt: true } });
    if (!students.length) return { created: 0, updated: 0 };
    const info = await this.alumni.graduationInfo(students.map((s) => s.id));
    // Group by graduation year (promotion record, else the year the record was last changed).
    const byYear = new Map<number | null, { studentId: string; finalClass: string | null }[]>();
    for (const s of students) {
      const g = info.get(s.id);
      const year = g?.year ?? s.updatedAt.getUTCFullYear();
      byYear.set(year, [...(byYear.get(year) ?? []), { studentId: s.id, finalClass: g?.finalClass ?? null }]);
    }
    const tenantId = currentTenantId();
    let created = 0;
    let updated = 0;
    await db.$transaction(
      async (tx) => {
        for (const [year, list] of byYear) {
          const r = await recordGraduates(tx, tenantId, list, year);
          created += r.created;
          updated += r.updated;
        }
      },
      { timeout: 120_000 },
    );
    await this.audit.log({ action: 'alumni.backfill', summary: `Created ${created} alumni record(s) for students already marked as graduated` });
    return { created, updated };
  }

  @Post('message')
  @HttpCode(200)
  @RequirePermissions('alumni.manage', 'comms.send')
  async message(@Body(new ZodPipe(alumniMessageSchema)) body: MessageParsed): Promise<AlumniMessageResult> {
    const db = this.prisma.db;
    const where: Prisma.AlumniProfileWhereInput = body.ids.length ? { id: { in: body.ids } } : alumniWhere(body.filter);
    const rows = await db.alumniProfile.findMany({ where, select: { firstName: true, lastName: true, email: true, phone: true, consentToContact: true, verified: true } });
    const wantsEmail = body.channels.includes('EMAIL');
    const wantsSms = body.channels.includes('SMS');
    const contacts = rows
      .filter((r) => r.verified && r.consentToContact)
      .map((r) => ({ name: `${r.firstName} ${r.lastName}`.slice(0, 120), email: wantsEmail && r.email && EMAIL.test(r.email) ? r.email : null, phone: wantsSms ? (normalisePhone(r.phone) ?? null) : null }))
      .filter((c) => c.email || c.phone);
    const excluded = rows.length - contacts.length;
    if (body.dryRun) return { recipients: contacts.length, excluded, broadcastId: null, notice: null };
    if (!contacts.length) throw new BadRequestException('None of these alumni can be reached: they need to have agreed to be contacted and have an email address or phone number for the channels you chose');
    const tenantId = currentTenantId();
    const audience: Audience = { type: 'CONTACTS', contacts: contacts.map((c) => ({ name: c.name, email: c.email, phone: c.phone })) };
    const summary = `${contacts.length} alumni${body.ids.length ? '' : body.filter.year ? ` (class of ${body.filter.year})` : ''}`;
    const b = await db.broadcast.create({
      data: {
        tenantId,
        title: body.title,
        channels: body.channels as Channel[],
        audience: audience as unknown as Prisma.InputJsonValue,
        audienceSummary: summary,
        subject: body.subject ?? body.title,
        body: body.body,
        smsBody: body.sms,
        source: 'ALUMNI',
        createdById: currentContext().userId ?? null,
      },
    });
    await this.sender.start(tenantId, b.id);
    // Channels the school hasn't set up are skipped by the sender; say so.
    const skipped = await this.prisma.root.delivery.groupBy({ by: ['error'], where: { broadcastId: b.id, status: 'SKIPPED' }, _count: { _all: true } });
    const notice = skipped.length ? skipped.map((s) => `${s._count._all} skipped: ${s.error ?? 'not sent'}`).join('; ') : null;
    await this.audit.log({
      action: 'alumni.messaged',
      entityType: 'Broadcast',
      entityId: b.id,
      summary: `Sent "${body.title}" to ${summary} by ${body.channels.map((c) => (c === 'SMS' ? 'SMS' : 'email')).join(' and ')}`,
    });
    if (notice) this.logger.log(`Alumni message ${b.id}: ${notice}`);
    return { recipients: contacts.length, excluded, broadcastId: b.id, notice };
  }

  @Post()
  @RequirePermissions('alumni.manage')
  async create(@Body(new ZodPipe(alumniSchema)) body: AlumniParsed): Promise<AlumniRow> {
    const a = await this.prisma.db.alumniProfile.create({
      data: { ...body, verified: body.verified ?? true, tenantId: currentTenantId(), source: 'ADDED' },
      include: alumniInclude,
    });
    await this.audit.log({ action: 'alumni.created', entityType: 'AlumniProfile', entityId: a.id, summary: `Added ${a.firstName} ${a.lastName}${a.graduationYear ? ` (class of ${a.graduationYear})` : ''} to the alumni directory` });
    return alumniRow(a);
  }

  @Get(':id')
  @RequirePermissions('alumni.read')
  async get(@Param('id') id: string): Promise<AlumniPending> {
    const a = await this.prisma.db.alumniProfile.findUnique({ where: { id }, include: alumniInclude });
    if (!a) throw new NotFoundException('Alumni record not found');
    if (!a.verified) return (await this.alumni.withMatches([a]))[0]!;
    return { ...alumniRow(a), admissionNumberGiven: null, matches: [] };
  }

  @Patch(':id')
  @RequirePermissions('alumni.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(alumniSchema.partial())) body: Partial<AlumniParsed>): Promise<AlumniRow> {
    const db = this.prisma.db;
    if (!(await db.alumniProfile.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('Alumni record not found');
    const a = await db.alumniProfile.update({ where: { id }, data: body, include: alumniInclude });
    await this.audit.log({ action: 'alumni.updated', entityType: 'AlumniProfile', entityId: id, summary: `Updated ${a.firstName} ${a.lastName}'s alumni record (${Object.keys(body).join(', ')})` });
    return alumniRow(a);
  }

  @Delete(':id')
  @RequirePermissions('alumni.manage')
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    const db = this.prisma.db;
    const a = await db.alumniProfile.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Alumni record not found');
    await db.alumniProfile.delete({ where: { id } });
    await this.audit.log({
      action: a.verified ? 'alumni.deleted' : 'alumni.rejected',
      entityType: 'AlumniProfile',
      entityId: id,
      summary: `${a.verified ? 'Deleted' : 'Turned down the sign-up of'} ${a.firstName} ${a.lastName}${a.graduationYear ? ` (class of ${a.graduationYear})` : ''}`,
    });
    return { ok: true };
  }

  /** Confirm a website sign-up, linking it to a student record or merging it into an existing alumni record. */
  @Post(':id/verify')
  @HttpCode(200)
  @RequirePermissions('alumni.manage')
  async verify(@Param('id') id: string, @Body(new ZodPipe(alumniVerifySchema)) body: z.output<typeof alumniVerifySchema>): Promise<AlumniRow> {
    const db = this.prisma.db;
    const a = await db.alumniProfile.findUnique({ where: { id }, include: alumniInclude });
    if (!a) throw new NotFoundException('Alumni record not found');
    let result = a;
    let how = 'Verified';
    if (body.intoId) {
      if (body.intoId === id) throw new BadRequestException('Choose a different record to merge into');
      const into = await db.alumniProfile.findUnique({ where: { id: body.intoId }, select: { id: true } });
      if (!into) throw new NotFoundException('The record to merge into was not found');
      result = await this.alumni.merge(a, into.id);
      how = 'Merged the sign-up into the existing record for';
    } else if (body.studentId) {
      const s = await db.student.findUnique({ where: { id: body.studentId }, select: { id: true, firstName: true, lastName: true, admissionNumber: true, alumniProfile: { select: { id: true } } } });
      if (!s) throw new NotFoundException('Student not found');
      if (s.alumniProfile && s.alumniProfile.id !== id) {
        result = await this.alumni.merge(a, s.alumniProfile.id);
        how = `Merged the sign-up into the alumni record of ${s.admissionNumber}:`;
      } else {
        const g = (await this.alumni.graduationInfo([s.id])).get(s.id);
        result = await db.alumniProfile.update({
          where: { id },
          data: { studentId: s.id, verified: true, graduationYear: a.graduationYear ?? g?.year ?? null, finalClass: a.finalClass ?? g?.finalClass ?? null },
          include: alumniInclude,
        });
        how = `Verified and linked to ${s.admissionNumber}:`;
      }
    } else {
      result = await db.alumniProfile.update({ where: { id }, data: { verified: true }, include: alumniInclude });
    }
    await this.audit.log({ action: 'alumni.verified', entityType: 'AlumniProfile', entityId: result.id, summary: `${how} ${a.firstName} ${a.lastName}${a.graduationYear ? ` (class of ${a.graduationYear})` : ''}` });
    return alumniRow(result);
  }
}
