import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ENQUIRY_STATUSES,
  aiEnquiryReplySchema,
  enquirySchema,
  formatMoney,
  pickupSchema,
  visitorSchema,
  type AiEnquiryReply,
  type AiText,
  type EnquiryInput,
  type EnquiryRow,
  type EnquiryStatus,
  type PickupInput,
  type PickupRow,
  type ReceptionToday,
  type VisitorInput,
  type VisitorRow,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { dateOnly, fullName, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { OperationsService, armLabel } from './operations.service';
import { enquiryReplyPrompt } from './prompts';

const visitorInclude = { host: { select: { firstName: true, lastName: true, jobTitle: true } } } satisfies Prisma.VisitorInclude;
const pickupInclude = {
  student: { select: { id: true, firstName: true, lastName: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } } },
} satisfies Prisma.StudentPickupInclude;

/** UTC instants bounding a school-local day (Africa/Lagos and most schools have no DST). */
function dayBounds(date: string, timezone: string): { gte: Date; lt: Date } {
  const probe = new Date(`${date}T12:00:00Z`);
  const local = new Date(probe.toLocaleString('en-US', { timeZone: timezone }));
  const offsetMs = local.getTime() - new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  const start = new Date(Date.parse(`${date}T00:00:00Z`) - offsetMs);
  return { gte: start, lt: new Date(start.getTime() + 86_400_000) };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

@Controller('reception')
export class ReceptionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ops: OperationsService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  private visitorRow(v: Prisma.VisitorGetPayload<{ include: typeof visitorInclude }>): VisitorRow {
    return {
      id: v.id,
      name: v.name,
      phone: v.phone,
      organisation: v.organisation,
      purpose: v.purpose,
      host: v.host ? `${fullName(v.host)} (${v.host.jobTitle})` : v.hostName,
      badgeNumber: v.badgeNumber,
      vehiclePlate: v.vehiclePlate,
      checkInAt: v.checkInAt.toISOString(),
      checkOutAt: v.checkOutAt?.toISOString() ?? null,
    };
  }

  private pickupRow(p: Prisma.StudentPickupGetPayload<{ include: typeof pickupInclude }>, names: Map<string, string>): PickupRow {
    return {
      id: p.id,
      student: { id: p.student.id, name: fullName(p.student), classArm: armLabel(p.student.classArm) },
      collectedBy: p.collectedBy,
      relationship: p.relationship,
      phone: p.phone,
      reason: p.reason,
      at: p.at.toISOString(),
      onRecord: p.onRecord,
      recordedBy: p.recordedById ? (names.get(p.recordedById) ?? null) : null,
    };
  }

  private enquiryRow(e: Prisma.EnquiryGetPayload<object>, names: Map<string, string>, today: string): EnquiryRow {
    const followUpOn = dateOnly(e.followUpOn);
    const open = e.status !== 'ENROLLED' && e.status !== 'CLOSED';
    return {
      id: e.id,
      parentName: e.parentName,
      phone: e.phone,
      email: e.email,
      childName: e.childName,
      classOfInterest: e.classOfInterest,
      entryTerm: e.entryTerm,
      source: e.source as EnquiryRow['source'],
      status: e.status as EnquiryStatus,
      question: e.question,
      notes: e.notes,
      followUpOn,
      createdAt: e.createdAt.toISOString(),
      createdBy: e.createdById ? (names.get(e.createdById) ?? null) : null,
      followUpDue: open && !!followUpOn && followUpOn <= today,
    };
  }

  // ---------------------------------------------------------- today

  @Get('today')
  @RequirePermissions('reception.read')
  async today(@Query(new ZodPipe(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }))) q: { date?: string }): Promise<ReceptionToday> {
    const db = this.prisma.db;
    const school = await this.ops.school();
    const date = q.date ?? school.today;
    const range = dayBounds(date, school.timezone);
    const [visitors, onSite, pickups, enquiries] = await Promise.all([
      db.visitor.findMany({ where: { checkInAt: range }, include: visitorInclude, orderBy: { checkInAt: 'desc' } }),
      db.visitor.findMany({ where: { checkOutAt: null, checkInAt: { gte: new Date(range.gte.getTime() - 86_400_000) } }, include: visitorInclude, orderBy: { checkInAt: 'asc' } }),
      db.studentPickup.findMany({ where: { at: range }, include: pickupInclude, orderBy: { at: 'desc' } }),
      db.enquiry.findMany({ select: { status: true, followUpOn: true, createdAt: true } }),
    ]);
    const names = await this.ops.userNames(pickups.map((p) => p.recordedById));
    const open = enquiries.filter((e) => e.status !== 'ENROLLED' && e.status !== 'CLOSED');
    return {
      date,
      onSite: onSite.map((v) => this.visitorRow(v)),
      visitors: visitors.map((v) => this.visitorRow(v)),
      pickups: pickups.map((p) => this.pickupRow(p, names)),
      enquiries: {
        open: open.length,
        new: enquiries.filter((e) => e.status === 'NEW').length,
        followUpsDue: open.filter((e) => e.followUpOn && dateOnly(e.followUpOn)! <= school.today).length,
        thisMonth: enquiries.filter((e) => e.createdAt.toISOString().slice(0, 7) === school.today.slice(0, 7)).length,
        enrolledThisYear: enquiries.filter((e) => e.status === 'ENROLLED' && e.createdAt.toISOString().startsWith(school.today.slice(0, 4))).length,
      },
    };
  }

  // ---------------------------------------------------------- visitors

  @Get('visitors')
  @RequirePermissions('reception.read')
  async visitors(@Query(new ZodPipe(z.object({ from: z.string().optional(), to: z.string().optional(), q: z.string().trim().max(100).optional() }))) q: { from?: string; to?: string; q?: string }): Promise<VisitorRow[]> {
    const school = await this.ops.school();
    const from = q.from ? dayBounds(q.from, school.timezone).gte : undefined;
    const to = q.to ? dayBounds(q.to, school.timezone).lt : undefined;
    const rows = await this.prisma.db.visitor.findMany({
      where: {
        ...(from || to ? { checkInAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
        ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { purpose: { contains: q.q, mode: 'insensitive' } }, { organisation: { contains: q.q, mode: 'insensitive' } }] } : {}),
      },
      include: visitorInclude,
      orderBy: { checkInAt: 'desc' },
      take: 300,
    });
    return rows.map((v) => this.visitorRow(v));
  }

  @Post('visitors')
  @RequirePermissions('reception.manage')
  async signIn(@Body(new ZodPipe(visitorSchema)) body: VisitorInput): Promise<VisitorRow> {
    if (body.hostStaffId) await this.prisma.db.staff.findUniqueOrThrow({ where: { id: body.hostStaffId } });
    const v = await this.prisma.db.visitor.create({ data: { ...body, tenantId: currentTenantId(), recordedById: currentContext().userId }, include: visitorInclude });
    await this.audit.log({ action: 'reception.visitor_in', entityType: 'Visitor', entityId: v.id, summary: `Signed in visitor ${v.name} (${v.purpose})` });
    return this.visitorRow(v);
  }

  @Post('visitors/:id/out')
  @HttpCode(200)
  @RequirePermissions('reception.manage')
  async signOut(@Param('id') id: string): Promise<VisitorRow> {
    const done = await this.prisma.db.visitor.updateMany({ where: { id, checkOutAt: null }, data: { checkOutAt: new Date() } });
    if (!done.count) throw new BadRequestException('This visitor has already signed out');
    return this.visitorRow(await this.prisma.db.visitor.findUniqueOrThrow({ where: { id }, include: visitorInclude }));
  }

  // ---------------------------------------------------------- enquiries

  @Get('enquiries')
  @RequirePermissions('reception.read')
  async enquiries(@Query(new ZodPipe(z.object({ status: z.enum([...ENQUIRY_STATUSES, 'OPEN']).optional(), q: z.string().trim().max(100).optional() }))) q: { status?: EnquiryStatus | 'OPEN'; q?: string }): Promise<EnquiryRow[]> {
    const school = await this.ops.school();
    const rows = await this.prisma.db.enquiry.findMany({
      where: {
        ...(q.status === 'OPEN' ? { status: { notIn: ['ENROLLED', 'CLOSED'] } } : q.status ? { status: q.status } : {}),
        ...(q.q ? { OR: [{ parentName: { contains: q.q, mode: 'insensitive' } }, { childName: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const names = await this.ops.userNames(rows.map((r) => r.createdById));
    return rows.map((r) => this.enquiryRow(r, names, school.today));
  }

  @Post('enquiries')
  @RequirePermissions('reception.manage')
  async createEnquiry(@Body(new ZodPipe(enquirySchema)) body: EnquiryInput): Promise<EnquiryRow> {
    const school = await this.ops.school();
    const e = await this.prisma.db.enquiry.create({
      data: { ...body, followUpOn: body.followUpOn ? parseDate(body.followUpOn) : null, tenantId: currentTenantId(), createdById: currentContext().userId },
    });
    await this.audit.log({ action: 'reception.enquiry', entityType: 'Enquiry', entityId: e.id, summary: `Logged an admissions enquiry from ${e.parentName}${e.classOfInterest ? ` for ${e.classOfInterest}` : ''}` });
    return this.enquiryRow(e, await this.ops.userNames([e.createdById]), school.today);
  }

  @Put('enquiries/:id')
  @RequirePermissions('reception.manage')
  async updateEnquiry(@Param('id') id: string, @Body(new ZodPipe(enquirySchema)) body: EnquiryInput): Promise<EnquiryRow> {
    const school = await this.ops.school();
    const before = await this.prisma.db.enquiry.findUniqueOrThrow({ where: { id } });
    const e = await this.prisma.db.enquiry.update({ where: { id }, data: { ...body, followUpOn: body.followUpOn ? parseDate(body.followUpOn) : null } });
    if (before.status !== e.status) {
      await this.audit.log({ action: 'reception.enquiry_status', entityType: 'Enquiry', entityId: id, summary: `Enquiry from ${e.parentName} moved to ${e.status.toLowerCase().replace('_', ' ')}` });
    }
    return this.enquiryRow(e, await this.ops.userNames([e.createdById]), school.today);
  }

  /** Drafts a reply from the school's real fees and term dates (nothing is sent). */
  @Post('enquiries/:id/reply')
  @HttpCode(200)
  @RequirePermissions('reception.read', 'ai.use')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async reply(@Param('id') id: string): Promise<AiEnquiryReply & AiText> {
    const db = this.prisma.db;
    const school = await this.ops.school();
    const [e, term, levels] = await Promise.all([
      db.enquiry.findUniqueOrThrow({ where: { id } }),
      this.ops.currentTerm(),
      db.classLevel.findMany({ select: { id: true, name: true }, orderBy: { order: 'asc' } }),
    ]);
    const fees = term ? await db.feeItem.findMany({ where: { termId: term.id }, orderBy: [{ optional: 'asc' }, { name: 'asc' }] }) : [];
    const wanted = e.classOfInterest ? levels.find((l) => norm(e.classOfInterest!).includes(norm(l.name)) || norm(l.name).includes(norm(e.classOfInterest!))) : undefined;
    const relevant = fees.filter((f) => !f.classLevelIds.length || !wanted || f.classLevelIds.includes(wanted.id));
    const money = (k: number) => formatMoney(k, school.currency);
    const facts = [
      'ENQUIRY',
      `Parent: ${e.parentName}. Child: ${e.childName ?? 'not given'}. Class of interest: ${e.classOfInterest ?? 'not given'}. Entry: ${e.entryTerm ?? 'not given'}. Came via ${e.source.toLowerCase().replace('_', ' ')}.`,
      `Their question: ${e.question ?? '(none recorded — write a welcoming reply with the key facts)'}`,
      '',
      'SCHOOL FACTS',
      `School: ${school.name}${school.motto ? ` — "${school.motto}"` : ''}. Classes offered: ${levels.map((l) => l.name).join(', ') || 'not recorded'}.`,
      school.address ? `Address: ${school.address}.` : '',
      [school.phone ? `phone ${school.phone}` : '', school.email ? `email ${school.email}` : ''].filter(Boolean).length
        ? `Admissions office: ${[school.phone ? `phone ${school.phone}` : '', school.email ? `email ${school.email}` : ''].filter(Boolean).join(', ')}.`
        : '',
      term ? `Current term: ${term.name}, ${dateOnly(term.startsOn)} to ${dateOnly(term.endsOn)}.` : '',
      relevant.length
        ? `Fees per term${wanted ? ` for ${wanted.name}` : ''} (${term?.name}): ${relevant.map((f) => `${f.name} ${money(f.amountKobo)}${f.optional ? ' (optional)' : ''}`).join('; ')}. Compulsory total ${money(relevant.filter((f) => !f.optional).reduce((n, f) => n + f.amountKobo, 0))}.`
        : 'Fees: not published in the system — say the admissions office will send the fee schedule.',
      'Visits: parents can book a school tour with the admissions office.',
    ]
      .filter((l) => l !== '')
      .join('\n');
    const { system, user } = enquiryReplyPrompt(school.name, facts);
    const r = await this.gateway.generateJson({ tier: 'standard', system, messages: [{ role: 'user', content: user }] }, aiEnquiryReplySchema, 'enquiry-reply');
    return { ...r.data, text: r.data.message, provider: r.provider, model: r.model };
  }

  // ---------------------------------------------------------- early pick-ups

  @Get('pickups')
  @RequirePermissions('reception.read')
  async pickups(@Query(new ZodPipe(z.object({ studentId: z.string().optional() }))) q: { studentId?: string }): Promise<PickupRow[]> {
    const rows = await this.prisma.db.studentPickup.findMany({
      where: q.studentId ? { studentId: q.studentId } : {},
      include: pickupInclude,
      orderBy: { at: 'desc' },
      take: 300,
    });
    const names = await this.ops.userNames(rows.map((r) => r.recordedById));
    return rows.map((r) => this.pickupRow(r, names));
  }

  /**
   * Logs a child leaving early. The collector is checked against the
   * parents and guardians on record (by name or phone) so the desk can see
   * at a glance when someone unfamiliar is collecting.
   */
  @Post('pickups')
  @RequirePermissions('reception.manage')
  async pickup(@Body(new ZodPipe(pickupSchema)) body: PickupInput): Promise<PickupRow> {
    const db = this.prisma.db;
    const student = await db.student.findUniqueOrThrow({
      where: { id: body.studentId },
      include: { guardians: { include: { guardian: { select: { firstName: true, lastName: true, phone: true } } } } },
    });
    if (student.status !== 'ACTIVE') throw new BadRequestException(`${fullName(student)} is not an active student`);
    const collector = norm(body.collectedBy);
    const phone = body.phone?.replace(/\D/g, '').slice(-10);
    const onRecord = student.guardians.some(
      ({ guardian: g }) =>
        (collector.includes(norm(g.firstName)) && collector.includes(norm(g.lastName))) || (!!phone && !!g.phone && g.phone.replace(/\D/g, '').slice(-10) === phone),
    );
    const p = await db.studentPickup.create({
      data: { ...body, onRecord, tenantId: currentTenantId(), recordedById: currentContext().userId },
      include: pickupInclude,
    });
    await this.audit.log({
      action: 'reception.pickup',
      entityType: 'Student',
      entityId: student.id,
      summary: `${fullName(student)} collected early by ${body.collectedBy} (${body.relationship}${onRecord ? '' : ', not on record'}) — ${body.reason}`,
    });
    return this.pickupRow(p, await this.ops.userNames([p.recordedById]));
  }
}
