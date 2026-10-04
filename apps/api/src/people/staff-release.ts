import type { PrismaService } from '../prisma/prisma.service';

/** Frees someone's teaching duties and closes their sign-in to this school. */
export async function releaseStaff(prisma: PrismaService, id: string, userId: string | null, removeMembership = false) {
  const db = prisma.db;
  const [classes, subjects, periods] = await Promise.all([
    db.classArm.updateMany({ where: { classTeacherId: id }, data: { classTeacherId: null } }),
    db.classSubject.updateMany({ where: { teacherId: id }, data: { teacherId: null } }),
    db.timetableEntry.updateMany({ where: { teacherId: id }, data: { teacherId: null } }),
    db.department.updateMany({ where: { headStaffId: id }, data: { headStaffId: null } }),
  ]);
  if (userId) {
    const membership = await db.membership.findFirst({ where: { userId }, include: { roles: { include: { role: { select: { key: true } } } } } });
    const isParent = (await db.guardian.count({ where: { userId } })) > 0;
    if (membership && isParent) {
      // Also a parent here: keep the parent role, drop the staff ones.
      const staffRoles = membership.roles.filter((r) => r.role.key !== 'parent').map((r) => r.roleId);
      await prisma.root.membershipRole.deleteMany({ where: { membershipId: membership.id, roleId: { in: staffRoles } } });
    } else if (membership) {
      if (removeMembership) await db.membership.delete({ where: { id: membership.id } });
      else await db.membership.update({ where: { id: membership.id }, data: { status: 'DISABLED' } });
    }
  }
  return { classes: classes.count, subjects: subjects.count, periods: periods.count };
}
