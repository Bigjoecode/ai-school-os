import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import {
  BEHAVIOUR_KINDS,
  BEHAVIOUR_STATUSES,
  behaviourCategoryLabel,
  behaviourSchema,
  behaviourUpdateSchema,
  listQuerySchema,
  notifyParentsSchema,
  type BehaviourCreateResult,
  type BehaviourDashboard,
  type BehaviourKind,
  type BehaviourParsed,
  type BehaviourRow,
  type BehaviourTally,
  type ClassBehaviourRow,
  type ClassBehaviourSummary,
  type Paginated,
  type StudentBehaviour,
  type WelfareStudentRef,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { dateOnly, paginate, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, addToTally, behaviourInclude, emptyTally, signedPoints, studentRef, studentSelect, tally, WelfareService } from './welfare.service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listQuery = listQuerySchema.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  classArmId: z.string().optional(),
  studentId: z.string().optional(),
  kind: z.enum(BEHAVIOUR_KINDS).optional(),
  category: z.string().max(40).optional(),
  status: z.enum(BEHAVIOUR_STATUSES).optional(),
  mine: z.enum(['true', 'false']).optional(),
});
type ListQuery = z.infer<typeof listQuery>;

const dashQuery = z.object({ from: isoDate.optional(), to: isoDate.optional(), classArmId: z.string().optional() });
type DashQuery = z.infer<typeof dashQuery>;

type UpdateParsed = z.output<typeof behaviourUpdateSchema>;
type NotifyParsed = z.output<typeof notifyParentsSchema>;

/**
 * The behaviour log: merits, demerits and incidents. Any teacher may record
 * for any student in the school; they may change their own records, senior
 * staff anyone's. Parents see what is marked visible in the family portal.
 */
@Controller('welfare/behaviour')
export class BehaviourController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly welfare: WelfareService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('welfare.read')
  async list(@Query(new ZodPipe(listQuery)) q: ListQuery): Promise<Paginated<BehaviourRow>> {
    const terms = q.q?.split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.BehaviourRecordWhereInput = {
      ...(q.studentId ? { studentId: q.studentId } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.mine === 'true' ? { reportedById: currentContext().userId } : {}),
      ...(q.from || q.to ? { date: { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) } } : {}),
      ...(q.classArmId ? { student: { classArmId: q.classArmId } } : {}),
      AND: terms.map((t) => ({
        OR: [
          { title: { contains: t, mode: 'insensitive' } },
          { student: { firstName: { contains: t, mode: 'insensitive' } } },
          { student: { lastName: { contains: t, mode: 'insensitive' } } },
          { student: { admissionNumber: { contains: t, mode: 'insensitive' } } },
        ],
      })),
    };
    const [rows, total] = await Promise.all([
      this.prisma.db.behaviourRecord.findMany({ where, include: behaviourInclude, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], ...paginate(q.page, q.pageSize) }),
      this.prisma.db.behaviourRecord.count({ where }),
    ]);
    return { items: await this.welfare.behaviourRows(rows), total, page: q.page, pageSize: q.pageSize };
  }

  @Post()
  @RequirePermissions('behaviour.manage')
  async create(@Body(new ZodPipe(behaviourSchema)) body: BehaviourParsed): Promise<BehaviourCreateResult> {
    const db = this.prisma.db;
    const ids = [...new Set(body.studentIds)];
    // Scoped lookup: another school's students are simply not found.
    const students = await db.student.findMany({ where: { id: { in: ids } }, select: studentSelect });
    if (students.length !== ids.length) throw new NotFoundException('Student not found');
    const today = await this.welfare.today();
    if (body.date > addDays(today, 1)) throw new BadRequestException('The date cannot be in the future');
    const points = signedPoints(body.kind, body.points);
    const userId = currentContext().userId ?? null;
    const status = body.kind === 'MERIT' ? 'RESOLVED' : (body.status ?? 'OPEN');
    const created = await db.$transaction(
      students.map((s) =>
        db.behaviourRecord.create({
          data: {
            tenantId: currentTenantId(),
            studentId: s.id,
            date: parseDate(body.date),
            kind: body.kind,
            category: body.category,
            title: body.title,
            description: body.description,
            points,
            severity: body.kind === 'MERIT' ? 'LOW' : body.severity,
            actionTaken: body.actionTaken,
            status,
            resolvedAt: status === 'RESOLVED' ? new Date() : null,
            visibleToParents: body.visibleToParents,
            reportedById: userId,
          },
          include: behaviourInclude,
        }),
      ),
    );
    const label = body.kind === 'MERIT' ? 'merit' : body.kind === 'DEMERIT' ? 'demerit' : 'incident';
    const names = students.map((s) => `${s.firstName} ${s.lastName}`);
    await this.audit.log({
      action: `behaviour.${label}_recorded`,
      entityType: 'BehaviourRecord',
      entityId: created[0]!.id,
      summary: `Recorded a ${label} (${behaviourCategoryLabel(body.category)}: ${body.title}) for ${names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ')}`,
    });

    let notified = 0;
    const notices = new Set<string>();
    if (body.notifyParents) {
      for (const r of created) {
        const res = await this.notify(r.id, r.student.firstName, body.kind, { ...body, date: body.date, description: body.visibleToParents ? body.description : null }, body.channels);
        notified += res.notified;
        if (res.notice) notices.add(res.notice);
      }
    }
    const fresh = body.notifyParents ? await db.behaviourRecord.findMany({ where: { id: { in: created.map((c) => c.id) } }, include: behaviourInclude }) : created;
    return { records: await this.welfare.behaviourRows(fresh), notified, notice: [...notices].join('. ') || null };
  }

  @Patch(':id')
  @RequirePermissions('behaviour.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(behaviourUpdateSchema)) body: UpdateParsed): Promise<BehaviourRow> {
    const db = this.prisma.db;
    const r = await db.behaviourRecord.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Record not found');
    if (!this.welfare.canEdit(r)) throw new ForbiddenException('You can only change records you made. Ask the principal or vice principal.');
    const kind = (body.kind ?? r.kind) as BehaviourKind;
    const points = body.points !== undefined || body.kind ? signedPoints(kind, body.points ?? Math.abs(r.points)) : undefined;
    const status = body.status ?? (body.kind === 'MERIT' ? 'RESOLVED' : undefined);
    const updated = await db.behaviourRecord.update({
      where: { id },
      data: {
        kind: body.kind,
        category: body.category,
        title: body.title,
        description: body.description === undefined ? undefined : body.description,
        points,
        severity: body.severity,
        actionTaken: body.actionTaken === undefined ? undefined : body.actionTaken,
        visibleToParents: body.visibleToParents,
        date: body.date ? parseDate(body.date) : undefined,
        status,
        resolvedAt: status === 'RESOLVED' && r.status !== 'RESOLVED' ? new Date() : status === 'OPEN' ? null : undefined,
      },
      include: behaviourInclude,
    });
    const what = status === 'RESOLVED' && r.status !== 'RESOLVED' ? 'Resolved' : status === 'OPEN' && r.status === 'RESOLVED' ? 'Reopened' : 'Updated';
    await this.audit.log({
      action: 'behaviour.updated',
      entityType: 'BehaviourRecord',
      entityId: id,
      summary: `${what} a behaviour record for ${updated.student.firstName} ${updated.student.lastName} (${updated.title})`,
    });
    return (await this.welfare.behaviourRows([updated]))[0]!;
  }

  @Delete(':id')
  @RequirePermissions('behaviour.manage')
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    const db = this.prisma.db;
    const r = await db.behaviourRecord.findUnique({ where: { id }, include: behaviourInclude });
    if (!r) throw new NotFoundException('Record not found');
    if (!this.welfare.canEdit(r)) throw new ForbiddenException('You can only delete records you made. Ask the principal or vice principal.');
    await db.behaviourRecord.delete({ where: { id } });
    await this.audit.log({
      action: 'behaviour.deleted',
      entityType: 'BehaviourRecord',
      entityId: id,
      summary: `Deleted a ${r.kind.toLowerCase()} for ${r.student.firstName} ${r.student.lastName} (${r.title}, ${dateOnly(r.date)})`,
    });
    return { ok: true };
  }

  /** Tell the parents later (e.g. after a conversation with the student). */
  @Post(':id/notify')
  @RequirePermissions('behaviour.manage')
  async notifyLater(@Param('id') id: string, @Body(new ZodPipe(notifyParentsSchema)) body: NotifyParsed): Promise<{ notified: number; notice: string | null; record: BehaviourRow }> {
    const r = await this.prisma.db.behaviourRecord.findUnique({ where: { id }, include: behaviourInclude });
    if (!r) throw new NotFoundException('Record not found');
    if (!this.welfare.canEdit(r)) throw new ForbiddenException('You can only notify parents about records you made');
    const res = await this.notify(
      r.id,
      r.student.firstName,
      r.kind as BehaviourKind,
      { date: dateOnly(r.date)!, category: r.category, title: r.title, description: r.visibleToParents ? r.description : null, actionTaken: r.actionTaken, extra: body.message },
      body.channels,
    );
    const fresh = await this.prisma.db.behaviourRecord.findUniqueOrThrow({ where: { id }, include: behaviourInclude });
    return { ...res, record: (await this.welfare.behaviourRows([fresh]))[0]! };
  }

  // ---------------------------------------------------------- views

  /** A student's timeline, with their balance this term and overall. */
  @Get('students/:id')
  @RequirePermissions('welfare.read')
  async student(@Param('id') id: string): Promise<StudentBehaviour> {
    const db = this.prisma.db;
    const s = await db.student.findUnique({ where: { id }, select: studentSelect });
    if (!s) throw new NotFoundException('Student not found');
    const [rows, term] = await Promise.all([
      db.behaviourRecord.findMany({ where: { studentId: id }, include: behaviourInclude, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 300 }),
      this.welfare.currentTerm(),
    ]);
    const inTerm = term ? rows.filter((r) => dateOnly(r.date)! >= term.startsOn && dateOnly(r.date)! <= term.endsOn) : rows;
    return { student: studentRef(s), term, termTally: tally(inTerm), allTime: tally(rows), records: await this.welfare.behaviourRows(rows) };
  }

  /** Every student in a class arm with their merits, demerits and balance this term. */
  @Get('classes/:classArmId')
  @RequirePermissions('welfare.read')
  async classSummary(@Param('classArmId') classArmId: string, @Query(new ZodPipe(z.object({ termId: z.string().optional() }))) q: { termId?: string }): Promise<ClassBehaviourSummary> {
    const db = this.prisma.db;
    const arm = await db.classArm.findUnique({ where: { id: classArmId }, include: { classLevel: { select: { name: true } } } });
    if (!arm) throw new NotFoundException('Class not found');
    const term = q.termId ? await this.welfare.termById(q.termId) : await this.welfare.currentTerm();
    const [students, rows] = await Promise.all([
      db.student.findMany({ where: { classArmId, status: 'ACTIVE' }, select: studentSelect, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
      db.behaviourRecord.findMany({
        where: { student: { classArmId }, ...(term ? { date: { gte: parseDate(term.startsOn), lte: parseDate(term.endsOn) } } : {}) },
        select: { studentId: true, kind: true, points: true, status: true, date: true },
      }),
    ]);
    const by = new Map<string, ClassBehaviourRow>(students.map((s) => [s.id, { student: studentRef(s), ...emptyTally(), lastDate: null }]));
    for (const r of rows) {
      const row = by.get(r.studentId);
      if (!row) continue;
      addToTally(row, r);
      const d = dateOnly(r.date)!;
      if (!row.lastDate || d > row.lastDate) row.lastDate = d;
    }
    const list = [...by.values()].sort((a, b) => b.points - a.points || a.student.name.localeCompare(b.student.name));
    return { classArmId, className: `${arm.classLevel.name} ${arm.name}`.trim(), term, totals: tally(rows), students: list };
  }

  /** The school at a glance: totals, categories, classes, top and concerning students, open incidents. */
  @Get('dashboard')
  @RequirePermissions('welfare.read')
  async dashboard(@Query(new ZodPipe(dashQuery)) q: DashQuery): Promise<BehaviourDashboard> {
    const db = this.prisma.db;
    let from = q.from;
    let to = q.to;
    if (!from || !to) {
      const term = await this.welfare.currentTerm();
      const today = await this.welfare.today();
      from ??= term?.startsOn ?? addDays(today, -90);
      to ??= term && term.endsOn > today ? term.endsOn : today;
    }
    const where: Prisma.BehaviourRecordWhereInput = {
      date: { gte: parseDate(from), lte: parseDate(to) },
      ...(q.classArmId ? { student: { classArmId: q.classArmId } } : {}),
    };
    const [rows, open] = await Promise.all([
      db.behaviourRecord.findMany({ where, select: { studentId: true, kind: true, category: true, points: true, status: true, student: { select: studentSelect } } }),
      db.behaviourRecord.findMany({
        where: { status: 'OPEN', kind: { not: 'MERIT' }, ...(q.classArmId ? { student: { classArmId: q.classArmId } } : {}) },
        include: behaviourInclude,
        orderBy: [{ severity: 'asc' }, { date: 'desc' }],
        take: 50,
      }),
    ]);
    const cats = new Map<string, { merits: number; demerits: number; incidents: number }>();
    const classes = new Map<string, { classArmId: string; className: string } & BehaviourTally>();
    const students = new Map<string, { student: WelfareStudentRef } & BehaviourTally>();
    for (const r of rows) {
      const c = cats.get(r.category) ?? { merits: 0, demerits: 0, incidents: 0 };
      if (r.kind === 'MERIT') c.merits++;
      else if (r.kind === 'DEMERIT') c.demerits++;
      else c.incidents++;
      cats.set(r.category, c);
      const ref = studentRef(r.student);
      if (ref.classArmId) {
        const k = classes.get(ref.classArmId) ?? { classArmId: ref.classArmId, className: ref.className ?? '', ...emptyTally() };
        classes.set(ref.classArmId, addToTally(k, r) as typeof k);
      }
      const st = students.get(r.studentId) ?? { student: ref, ...emptyTally() };
      students.set(r.studentId, addToTally(st, r) as typeof st);
    }
    const all = [...students.values()];
    const sevRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    open.sort((a, b) => (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3) || b.date.getTime() - a.date.getTime());
    return {
      from,
      to,
      totals: tally(rows),
      byCategory: [...cats.entries()]
        .map(([category, c]) => ({ category, label: behaviourCategoryLabel(category), ...c }))
        .sort((a, b) => b.merits + b.demerits + b.incidents - (a.merits + a.demerits + a.incidents)),
      byClass: [...classes.values()].sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true })),
      topStudents: all
        .filter((s) => s.points > 0)
        .sort((a, b) => b.points - a.points)
        .slice(0, 8)
        .map((s) => ({ student: s.student, points: s.points, merits: s.merits })),
      concerns: all
        .filter((s) => s.points < 0 || s.incidents > 0)
        .sort((a, b) => a.points - b.points || b.incidents - a.incidents)
        .slice(0, 8)
        .map((s) => ({ student: s.student, points: s.points, demerits: s.demerits, incidents: s.incidents })),
      openIncidents: await this.welfare.behaviourRows(open.slice(0, 15)),
    };
  }

  // ---------------------------------------------------------- helpers

  private async notify(
    recordId: string,
    firstName: string,
    kind: BehaviourKind,
    r: { date: string; category: string; title: string; description: string | null; actionTaken: string | null; extra?: string | null },
    channels: BehaviourParsed['channels'],
  ) {
    const rec = await this.prisma.db.behaviourRecord.findUniqueOrThrow({ where: { id: recordId }, select: { studentId: true } });
    const when = this.welfare.longDate(r.date);
    const cat = behaviourCategoryLabel(r.category).toLowerCase();
    const desc = r.description ? `\n\n${r.description}` : '';
    const extra = r.extra ? `\n\n${r.extra}` : '';
    const msg =
      kind === 'MERIT'
        ? {
            title: `A merit for ${firstName}`,
            subject: `Well done, ${firstName}: a merit for ${cat}`,
            body: `Dear Parent/Guardian,\n\nWe are pleased to let you know that ${firstName} received a merit on ${when} for ${cat}: **${r.title}**.${desc}${extra}\n\nThank you for your continued support.\n\n{{school}}`,
            sms: `{{school}}: Good news! ${firstName} received a merit on ${when} for ${cat}: ${r.title}. Thank you for your support.`,
          }
        : {
            title: `A note about ${firstName}'s conduct`,
            subject: `About ${firstName}'s conduct at school`,
            body: `Dear Parent/Guardian,\n\nWe would like to make you aware of a matter concerning ${firstName} on ${when}: **${r.title}** (${cat}).${desc}${r.actionTaken ? `\n\nAction taken by the school: ${r.actionTaken}.` : ''}${extra}\n\nWe would be grateful for your support in discussing this with ${firstName} at home. Please contact the school if you would like to talk about it.\n\n{{school}}`,
            sms: `{{school}}: Please note a conduct matter concerning ${firstName} on ${when}: ${r.title}.${r.actionTaken ? ` Action: ${r.actionTaken}.` : ''} Kindly contact the school if you wish to discuss.`,
          };
    const res = await this.welfare.notifyParents(rec.studentId, channels, msg);
    if (res.notified) {
      await this.prisma.db.behaviourRecord.update({ where: { id: recordId }, data: { parentNotifiedAt: new Date() } });
    }
    return res;
  }
}
