import type { ScopedPrisma } from '../prisma/prisma.service';

/** A transaction client from the scoped (tenant-filtered) Prisma client. */
type Db = Parameters<Parameters<ScopedPrisma['$transaction']>[0]>[0];

const NOTE = 'Contact details are a parent’s, copied from the school record when they graduated. Update them when the old student gets in touch.';

/**
 * Creates (or fills in) alumni records for students who have just
 * graduated: their names, graduation year and final class, and, when the
 * student has no contact of their own, their main parent's phone and email
 * so the school can still reach them. Returns how many were created.
 */
export async function recordGraduates(db: Db, tenantId: string, grads: { studentId: string; finalClass: string | null }[], graduationYear: number | null): Promise<{ created: number; updated: number }> {
  if (!grads.length) return { created: 0, updated: 0 };
  const students = await db.student.findMany({
    where: { id: { in: grads.map((g) => g.studentId) } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      user: { select: { email: true } },
      alumniProfile: { select: { id: true, graduationYear: true, finalClass: true } },
      guardians: { orderBy: { isPrimary: 'desc' }, take: 1, select: { guardian: { select: { phone: true, email: true } } } },
    },
  });
  const finalClass = new Map(grads.map((g) => [g.studentId, g.finalClass]));
  let created = 0;
  let updated = 0;
  for (const s of students) {
    const cls = finalClass.get(s.id) ?? null;
    if (s.alumniProfile) {
      const data = {
        ...(s.alumniProfile.graduationYear === null && graduationYear ? { graduationYear } : {}),
        ...(s.alumniProfile.finalClass === null && cls ? { finalClass: cls } : {}),
      };
      if (Object.keys(data).length) {
        await db.alumniProfile.update({ where: { id: s.alumniProfile.id }, data });
        updated++;
      }
      continue;
    }
    const g = s.guardians[0]?.guardian;
    const ownEmail = s.user?.email && !/@.*\.(demo|local|invalid)$/i.test(s.user.email) ? s.user.email : null;
    const usesParent = !ownEmail && !!g;
    await db.alumniProfile.create({
      data: {
        tenantId,
        studentId: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        graduationYear,
        finalClass: cls,
        email: ownEmail ?? g?.email ?? null,
        phone: g?.phone ?? null,
        source: 'GRADUATED',
        verified: true,
        consentToContact: true,
        notes: usesParent ? NOTE : null,
      },
    });
    created++;
  }
  return { created, updated };
}

/**
 * Undoing a promotion: removes the alumni records it created, unless
 * someone has since changed them (then they stay, still linked).
 */
export async function forgetGraduates(db: Db, studentIds: string[], since: Date): Promise<{ removed: number; kept: number }> {
  if (!studentIds.length) return { removed: 0, kept: 0 };
  const rows = await db.alumniProfile.findMany({
    where: { studentId: { in: studentIds }, source: 'GRADUATED', createdAt: { gte: new Date(since.getTime() - 60_000) } },
    select: { id: true, createdAt: true, updatedAt: true },
  });
  const untouched = rows.filter((r) => r.updatedAt.getTime() - r.createdAt.getTime() < 2000).map((r) => r.id);
  if (untouched.length) await db.alumniProfile.deleteMany({ where: { id: { in: untouched } } });
  return { removed: untouched.length, kept: rows.length - untouched.length };
}

/** The year a session ends ("2025/2026" ending July 2026 → 2026). */
export function graduationYearOf(endsOn: string | Date | null | undefined): number | null {
  if (!endsOn) return null;
  const y = typeof endsOn === 'string' ? Number(endsOn.slice(0, 4)) : endsOn.getUTCFullYear();
  return Number.isFinite(y) && y > 1900 ? y : null;
}

