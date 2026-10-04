import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  SICK_BAY_OUTCOMES,
  SICK_BAY_OUTCOME_LABELS,
  SICK_BAY_SERIOUS,
  listQuerySchema,
  medicalAlerts,
  medicalProfileSchema,
  notifyParentsSchema,
  sickBayUpdateSchema,
  sickBayVisitSchema,
  type MedicalAlertRow,
  type MedicalProfile,
  type Paginated,
  type SickBayCreateResult,
  type SickBayOutcome,
  type SickBayRow,
  type SickBaySummary,
  type StudentWelfareSummary,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { paginate, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, behaviourInclude, localDayStart, studentRef, studentSelect, tally, visitInclude, WelfareService } from './welfare.service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const listQuery = listQuerySchema.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  studentId: z.string().optional(),
  classArmId: z.string().optional(),
  outcome: z.enum(SICK_BAY_OUTCOMES).optional(),
});
type ListQuery = z.infer<typeof listQuery>;
type VisitParsed = z.output<typeof sickBayVisitSchema>;
type VisitUpdate = z.output<typeof sickBayUpdateSchema>;
type MedicalParsed = z.output<typeof medicalProfileSchema>;
type NotifyParsed = z.output<typeof notifyParentsSchema>;

const medicalSelect = { ...studentSelect, bloodGroup: true, genotype: true, allergies: true, chronicConditions: true, medicalNotes: true } satisfies Prisma.StudentSelect;
type MedicalPick = Prisma.StudentGetPayload<{ select: typeof medicalSelect }>;

export function toMedical(s: MedicalPick): MedicalProfile {
  return {
    studentId: s.id,
    student: studentRef(s),
    bloodGroup: s.bloodGroup,
    genotype: s.genotype,
    allergies: s.allergies,
    chronicConditions: s.chronicConditions,
    medicalNotes: s.medicalNotes,
  };
}

/**
 * The sick bay (school clinic) and students' medical details. The nurse,
 * principal and vice principal record visits and keep the medical profile;
 * teachers and other welfare staff can read them.
 */
@Controller('welfare')
export class SickBayController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly welfare: WelfareService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------- visits

  @Get('sick-bay')
  @RequirePermissions('welfare.read')
  async list(@Query(new ZodPipe(listQuery)) q: ListQuery): Promise<Paginated<SickBayRow>> {
    const { timezone } = await this.welfare.school();
    const terms = q.q?.split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.SickBayVisitWhereInput = {
      ...(q.studentId ? { studentId: q.studentId } : {}),
      ...(q.outcome ? { outcome: q.outcome } : {}),
      ...(q.classArmId ? { student: { classArmId: q.classArmId } } : {}),
      ...(q.from || q.to
        ? { visitedAt: { ...(q.from ? { gte: localDayStart(timezone, q.from) } : {}), ...(q.to ? { lt: localDayStart(timezone, addDays(q.to, 1)) } : {}) } }
        : {}),
      AND: terms.map((t) => ({
        OR: [
          { complaint: { contains: t, mode: 'insensitive' } },
          { student: { firstName: { contains: t, mode: 'insensitive' } } },
          { student: { lastName: { contains: t, mode: 'insensitive' } } },
          { student: { admissionNumber: { contains: t, mode: 'insensitive' } } },
        ],
      })),
    };
    const [rows, total] = await Promise.all([
      this.prisma.db.sickBayVisit.findMany({ where, include: visitInclude, orderBy: { visitedAt: 'desc' }, ...paginate(q.page, q.pageSize) }),
      this.prisma.db.sickBayVisit.count({ where }),
    ]);
    return { items: await this.welfare.visitRows(rows), total, page: q.page, pageSize: q.pageSize };
  }

  @Get('sick-bay/summary')
  @RequirePermissions('welfare.read')
  async summary(): Promise<SickBaySummary> {
    const db = this.prisma.db;
    const { timezone } = await this.welfare.school();
    const today = await this.welfare.today();
    const start = localDayStart(timezone, today);
    const [todays, observing, week, month] = await Promise.all([
      db.sickBayVisit.findMany({ where: { visitedAt: { gte: start } }, select: { outcome: true } }),
      db.sickBayVisit.count({ where: { outcome: 'OBSERVATION' } }),
      db.sickBayVisit.count({ where: { visitedAt: { gte: localDayStart(timezone, addDays(today, -6)) } } }),
      db.sickBayVisit.groupBy({ by: ['studentId'], where: { visitedAt: { gte: localDayStart(timezone, addDays(today, -29)) } }, _count: { _all: true } }),
    ]);
    const byOutcome = Object.fromEntries(SICK_BAY_OUTCOMES.map((o) => [o, 0])) as Record<SickBayOutcome, number>;
    for (const v of todays) byOutcome[v.outcome as SickBayOutcome] = (byOutcome[v.outcome as SickBayOutcome] ?? 0) + 1;
    const frequentIds = month.filter((m) => m._count._all >= 3).sort((a, b) => b._count._all - a._count._all).slice(0, 10);
    const students = frequentIds.length ? await db.student.findMany({ where: { id: { in: frequentIds.map((f) => f.studentId) } }, select: studentSelect }) : [];
    const byId = new Map(students.map((s) => [s.id, s]));
    return {
      today: todays.length,
      todayByOutcome: byOutcome,
      underObservation: observing,
      last7Days: week,
      frequent: frequentIds.filter((f) => byId.has(f.studentId)).map((f) => ({ student: studentRef(byId.get(f.studentId)!), visits: f._count._all })),
    };
  }

  @Post('sick-bay')
  @RequirePermissions('health.manage')
  async create(@Body(new ZodPipe(sickBayVisitSchema)) body: VisitParsed): Promise<SickBayCreateResult> {
    const db = this.prisma.db;
    const student = await db.student.findUnique({ where: { id: body.studentId }, select: studentSelect });
    if (!student) throw new NotFoundException('Student not found');
    const visitedAt = body.visitedAt ? new Date(body.visitedAt) : new Date();
    if (visitedAt.getTime() > Date.now() + 10 * 60_000) throw new BadRequestException('The visit time cannot be in the future');
    const visit = await db.sickBayVisit.create({
      data: {
        tenantId: currentTenantId(),
        studentId: body.studentId,
        visitedAt,
        complaint: body.complaint,
        temperature: body.temperature,
        assessment: body.assessment,
        treatment: body.treatment,
        medication: body.medication,
        outcome: body.outcome,
        followUp: body.followUp,
        recordedById: currentContext().userId ?? null,
      },
      include: visitInclude,
    });
    await this.audit.log({
      action: 'sickbay.visit_recorded',
      entityType: 'SickBayVisit',
      entityId: visit.id,
      summary: `Recorded a sick-bay visit for ${student.firstName} ${student.lastName} (${SICK_BAY_OUTCOME_LABELS[body.outcome].toLowerCase()})`,
    });
    let res: { notified: number; notice: string | null } = { notified: 0, notice: null };
    if (body.notifyParents) res = await this.notify(visit.id, body.channels, null);
    const fresh = await db.sickBayVisit.findUniqueOrThrow({ where: { id: visit.id }, include: visitInclude });
    return { visit: (await this.welfare.visitRows([fresh]))[0]!, ...res };
  }

  @Patch('sick-bay/:id')
  @RequirePermissions('health.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(sickBayUpdateSchema)) body: VisitUpdate): Promise<SickBayRow> {
    const db = this.prisma.db;
    const v = await db.sickBayVisit.findUnique({ where: { id } });
    if (!v) throw new NotFoundException('Visit not found');
    const updated = await db.sickBayVisit.update({
      where: { id },
      data: {
        visitedAt: body.visitedAt ? new Date(body.visitedAt) : undefined,
        complaint: body.complaint,
        temperature: body.temperature === undefined ? undefined : body.temperature,
        assessment: body.assessment === undefined ? undefined : body.assessment,
        treatment: body.treatment === undefined ? undefined : body.treatment,
        medication: body.medication === undefined ? undefined : body.medication,
        outcome: body.outcome,
        followUp: body.followUp === undefined ? undefined : body.followUp,
      },
      include: visitInclude,
    });
    await this.audit.log({
      action: 'sickbay.visit_updated',
      entityType: 'SickBayVisit',
      entityId: id,
      summary: `Updated a sick-bay visit for ${updated.student.firstName} ${updated.student.lastName}${body.outcome && body.outcome !== v.outcome ? ` (now ${SICK_BAY_OUTCOME_LABELS[body.outcome].toLowerCase()})` : ''}`,
    });
    return (await this.welfare.visitRows([updated]))[0]!;
  }

  @Delete('sick-bay/:id')
  @RequirePermissions('health.manage')
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    const db = this.prisma.db;
    const v = await db.sickBayVisit.findUnique({ where: { id }, include: visitInclude });
    if (!v) throw new NotFoundException('Visit not found');
    await db.sickBayVisit.delete({ where: { id } });
    await this.audit.log({
      action: 'sickbay.visit_deleted',
      entityType: 'SickBayVisit',
      entityId: id,
      summary: `Deleted a sick-bay visit for ${v.student.firstName} ${v.student.lastName} (${v.complaint})`,
    });
    return { ok: true };
  }

  @Post('sick-bay/:id/notify')
  @RequirePermissions('health.manage')
  async notifyLater(@Param('id') id: string, @Body(new ZodPipe(notifyParentsSchema)) body: NotifyParsed): Promise<{ notified: number; notice: string | null; visit: SickBayRow }> {
    const v = await this.prisma.db.sickBayVisit.findUnique({ where: { id }, select: { id: true } });
    if (!v) throw new NotFoundException('Visit not found');
    const res = await this.notify(id, body.channels, body.message);
    const fresh = await this.prisma.db.sickBayVisit.findUniqueOrThrow({ where: { id }, include: visitInclude });
    return { ...res, visit: (await this.welfare.visitRows([fresh]))[0]! };
  }

  // ---------------------------------------------------------- medical profile

  @Get('students/:id/medical')
  @RequirePermissions('welfare.read')
  async medical(@Param('id') id: string): Promise<MedicalProfile> {
    const s = await this.prisma.db.student.findUnique({ where: { id }, select: medicalSelect });
    if (!s) throw new NotFoundException('Student not found');
    return toMedical(s);
  }

  @Put('students/:id/medical')
  @RequirePermissions('health.manage')
  async setMedical(@Param('id') id: string, @Body(new ZodPipe(medicalProfileSchema)) body: MedicalParsed): Promise<MedicalProfile> {
    const db = this.prisma.db;
    const s = await db.student.findUnique({ where: { id }, select: { id: true } });
    if (!s) throw new NotFoundException('Student not found');
    const allergies = [...new Map(body.allergies.map((a) => [a.toLowerCase(), a])).values()];
    const updated = await db.student.update({
      where: { id },
      data: { bloodGroup: body.bloodGroup, genotype: body.genotype, allergies, chronicConditions: body.chronicConditions, medicalNotes: body.medicalNotes },
      select: medicalSelect,
    });
    await this.audit.log({
      action: 'students.medical_updated',
      entityType: 'Student',
      entityId: id,
      summary: `Updated ${updated.firstName} ${updated.lastName}'s medical profile`,
    });
    return toMedical(updated);
  }

  /** Students the nurse and teachers should know about: allergies, sickle cell, long-term conditions. */
  @Get('medical-alerts')
  @RequirePermissions('welfare.read')
  async alerts(@Query(new ZodPipe(z.object({ classArmId: z.string().optional() }))) q: { classArmId?: string }): Promise<MedicalAlertRow[]> {
    const rows = await this.prisma.db.student.findMany({
      where: {
        status: 'ACTIVE',
        ...(q.classArmId ? { classArmId: q.classArmId } : {}),
        OR: [{ allergies: { isEmpty: false } }, { genotype: { in: ['SS', 'SC'] } }, { chronicConditions: { not: null } }],
      },
      select: medicalSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 500,
    });
    return rows
      .filter((s) => medicalAlerts(s).length > 0)
      .map((s) => ({ student: studentRef(s), bloodGroup: s.bloodGroup, genotype: s.genotype, allergies: s.allergies, chronicConditions: s.chronicConditions }));
  }

  /** Everything welfare for the student profile sheet. */
  @Get('students/:id/summary')
  @RequirePermissions('welfare.read')
  async studentSummary(@Param('id') id: string): Promise<StudentWelfareSummary> {
    const db = this.prisma.db;
    const s = await db.student.findUnique({ where: { id }, select: medicalSelect });
    if (!s) throw new NotFoundException('Student not found');
    const term = await this.welfare.currentTerm();
    const [termRows, recent, visits] = await Promise.all([
      db.behaviourRecord.findMany({ where: { studentId: id, ...(term ? { date: { gte: parseDate(term.startsOn), lte: parseDate(term.endsOn) } } : {}) }, select: { kind: true, points: true, status: true } }),
      db.behaviourRecord.findMany({ where: { studentId: id }, include: behaviourInclude, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 5 }),
      db.sickBayVisit.findMany({ where: { studentId: id }, include: visitInclude, orderBy: { visitedAt: 'desc' }, take: 5 }),
    ]);
    return {
      medical: toMedical(s),
      behaviour: { term, tally: tally(termRows), recent: await this.welfare.behaviourRows(recent) },
      sickBay: await this.welfare.visitRows(visits),
    };
  }

  // ---------------------------------------------------------- helpers

  private async notify(visitId: string, channels: VisitParsed['channels'], extra: string | null) {
    const db = this.prisma.db;
    const v = await db.sickBayVisit.findUniqueOrThrow({ where: { id: visitId }, include: { student: { select: { id: true, firstName: true } } } });
    const { timezone } = await this.welfare.school();
    const first = v.student.firstName;
    const when = `${this.welfare.localTime(timezone, v.visitedAt)} on ${this.welfare.longDate(new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(v.visitedAt))}`;
    const outcome = v.outcome as SickBayOutcome;
    const next: Record<SickBayOutcome, string> = {
      RETURNED_TO_CLASS: `${first} felt better and returned to class.`,
      OBSERVATION: `${first} is resting in the sick bay under observation. We will let you know if anything changes.`,
      SENT_HOME: `${first} needs to go home to rest. Please arrange for ${first} to be collected from school as soon as possible.`,
      REFERRED: `We have advised that ${first} sees a doctor. Please contact the school so we can share the details.`,
      HOSPITAL: `${first} has been taken to hospital for care. Please contact the school immediately.`,
    };
    const lines = [
      `Dear Parent/Guardian,`,
      `${first} visited the school sick bay at ${when} with ${v.complaint.toLowerCase()}.${v.temperature ? ` Temperature: ${v.temperature.toFixed(1)}°C.` : ''}`,
      [v.treatment ? `Care given: ${v.treatment}.` : '', v.medication ? `Medication: ${v.medication}.` : ''].filter(Boolean).join(' '),
      next[outcome],
      v.followUp ? `Follow-up: ${v.followUp}` : '',
      extra ?? '',
      '{{school}}',
    ].filter(Boolean);
    const serious = SICK_BAY_SERIOUS.includes(outcome);
    const res = await this.welfare.notifyParents(v.studentId, channels, {
      title: `${first} visited the sick bay`,
      subject: serious ? `Important: ${first} — ${SICK_BAY_OUTCOME_LABELS[outcome].toLowerCase()}` : `${first} visited the sick bay today`,
      body: lines.join('\n\n'),
      sms: `{{school}}: ${first} visited the sick bay (${v.complaint}). ${next[outcome]}`,
    });
    if (res.notified) await db.sickBayVisit.update({ where: { id: visitId }, data: { parentNotifiedAt: new Date() } });
    return res;
  }
}
