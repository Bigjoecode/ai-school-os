import { Controller, ForbiddenException, Get, Param } from '@nestjs/common';
import type { PortalHouse } from '@aischool/shared';
import { currentContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { houseRef, HousesService } from './houses.service';

type Viewer = { role: 'PARENT' | 'STUDENT'; childIds: Set<string> };

/** The family portal: a child's house and this term's house standings. */
@Controller('portal')
export class PortalHousesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly houses: HousesService,
  ) {}

  @Get('students/:id/house')
  async house(@Param('id') id: string): Promise<PortalHouse> {
    const v = await this.viewer();
    if (!v.childIds.has(id)) throw new ForbiddenException(v.role === 'PARENT' ? 'You can only see your own children' : 'You can only see your own records');
    const db = this.prisma.db;
    const s = await db.student.findUniqueOrThrow({ where: { id }, select: { house: true } });
    const period = await this.houses.period('TERM');
    if (!(await db.house.count())) return { house: null, periodLabel: period.label, standings: [], myPoints: 0 };
    const st = await this.houses.standings(period, { contributors: 100000 });
    const mine = st.topContributors.find((c) => c.student.id === id)?.points ?? 0;
    return {
      house: s.house ? { ...houseRef(s.house), motto: s.house.motto } : null,
      periodLabel: period.label,
      standings: st.standings.map((x) => ({ house: houseRef(x.house), rank: x.rank, total: x.total })),
      myPoints: mine,
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
