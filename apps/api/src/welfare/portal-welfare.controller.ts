import { Controller, ForbiddenException, Get, Param } from '@nestjs/common';
import type { BehaviourKind, BehaviourStatus, PortalWelfare, SickBayOutcome } from '@aischool/shared';
import { dateOnly, parseDate } from '../common/format';
import { currentContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { tally, WelfareService } from './welfare.service';

type Viewer = { role: 'PARENT' | 'STUDENT'; childIds: Set<string> };

/**
 * "Behaviour & health" in the family portal. Parents see the behaviour
 * records the school shares, their child's sick-bay visits and medical
 * profile (editing stays with the school). Students see their own shared
 * behaviour records only — never medical details.
 */
@Controller('portal')
export class PortalWelfareController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly welfare: WelfareService,
  ) {}

  @Get('students/:id/welfare')
  async welfareView(@Param('id') id: string): Promise<PortalWelfare> {
    const v = await this.viewer();
    if (!v.childIds.has(id)) throw new ForbiddenException(v.role === 'PARENT' ? 'You can only see your own children' : 'You can only see your own records');
    const db = this.prisma.db;
    const parent = v.role === 'PARENT';
    const term = await this.welfare.currentTerm();
    const [records, termRows, visits, medical] = await Promise.all([
      db.behaviourRecord.findMany({ where: { studentId: id, visibleToParents: true }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 100 }),
      db.behaviourRecord.findMany({
        where: { studentId: id, visibleToParents: true, ...(term ? { date: { gte: parseDate(term.startsOn), lte: parseDate(term.endsOn) } } : {}) },
        select: { kind: true, points: true, status: true },
      }),
      parent ? db.sickBayVisit.findMany({ where: { studentId: id }, orderBy: { visitedAt: 'desc' }, take: 30 }) : null,
      parent ? db.student.findUniqueOrThrow({ where: { id }, select: { bloodGroup: true, genotype: true, allergies: true, chronicConditions: true, medicalNotes: true } }) : null,
    ]);
    return {
      term,
      tally: tally(termRows),
      behaviour: records.map((r) => ({
        id: r.id,
        date: dateOnly(r.date)!,
        kind: r.kind as BehaviourKind,
        category: r.category,
        title: r.title,
        description: r.description,
        points: r.points,
        actionTaken: r.actionTaken,
        status: r.status as BehaviourStatus,
      })),
      sickBay:
        visits?.map((x) => ({
          id: x.id,
          visitedAt: x.visitedAt.toISOString(),
          complaint: x.complaint,
          temperature: x.temperature,
          treatment: x.treatment,
          medication: x.medication,
          outcome: x.outcome as SickBayOutcome,
          followUp: x.followUp,
        })) ?? null,
      medical,
    };
  }

  /** Same rule as the rest of the portal: parents see linked active children, students themselves. */
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
}
