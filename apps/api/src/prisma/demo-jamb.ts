import type { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../auth/password';

const EMAIL = 'jamb@greenfield.demo';
/** The demo students' password (also the BECE candidate's, demo-bece.ts). */
export const DEMO_PASSWORD = 'Greenfield#2026';
const YEAR_MS = 365 * 86_400_000;

/**
 * At start-up, demo school only: an SS 3 student who can sign in
 * (jamb@greenfield.demo) with JAMB Prep active, so the operator can sit a
 * full JAMB UTME CBT mock. The student is created once ever; on later
 * starts only the JAMB Prep grant is renewed if it has run out. Real
 * schools are never touched.
 */
export async function autoSeedDemoJamb(prisma: PrismaClient): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'greenfield' }, select: { id: true } });
  if (!tenant) return '';
  const tenantId = tenant.id;
  const onceKey = `demo-jamb:${tenantId}`;
  const done = await prisma.platformSetting.findUnique({ where: { key: onceKey } });
  let created = false;

  if (!done) {
    await prisma.platformSetting.create({ data: { key: onceKey, value: { at: new Date().toISOString() } } });
    const level = await prisma.classLevel.findFirst({ where: { tenantId, OR: [{ code: 'SS3' }, { name: 'SS 3' }] } });
    if (!level) return '';
    const arm = await prisma.classArm.findFirst({ where: { tenantId, classLevelId: level.id }, orderBy: { name: 'asc' } });
    if (!arm) return '';
    let user = await prisma.user.findUnique({ where: { email: EMAIL } });
    if (!user) user = await prisma.user.create({ data: { email: EMAIL, firstName: 'Amaka', lastName: 'Okonkwo', passwordHash: await hashPassword(DEMO_PASSWORD) } });
    if (!(await prisma.student.findFirst({ where: { tenantId, userId: user.id } }))) {
      await prisma.student.create({
        data: { tenantId, firstName: 'Amaka', lastName: 'Okonkwo', gender: 'FEMALE', admissionNumber: 'GIS/SS3/UTME01', classArmId: arm.id, userId: user.id, status: 'ACTIVE', admittedOn: new Date() },
      });
    }
    if (!(await prisma.membership.findFirst({ where: { tenantId, userId: user.id } }))) {
      const role = await prisma.role.findUniqueOrThrow({ where: { tenantId_key: { tenantId, key: 'student' } } });
      await prisma.membership.create({ data: { tenantId, userId: user.id, roles: { create: { roleId: role.id } } } });
    }
    created = true;
  }

  // JAMB Prep and WAEC Prep (platform grants), each renewed when it has run out.
  const student = await prisma.student.findFirst({ where: { tenantId, user: { email: EMAIL } }, select: { id: true } });
  if (!student) return '';
  const now = new Date();
  const granted: string[] = [];
  for (const [key, note] of [
    ['EXAM_JAMB', 'Demo: JAMB Prep for trying the full UTME CBT mock'],
    ['EXAM_WAEC', 'Demo: WAEC Prep for trying objective, mock and theory practice'],
  ] as const) {
    const active = await prisma.studentEntitlement.findFirst({ where: { studentId: student.id, key, status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } } });
    if (active) continue;
    await prisma.studentEntitlement.create({ data: { tenantId, studentId: student.id, key, source: 'PLATFORM', startsAt: now, endsAt: new Date(now.getTime() + YEAR_MS), note } });
    granted.push(key === 'EXAM_JAMB' ? 'JAMB Prep' : 'WAEC Prep');
  }
  if (!created && !granted.length) return '';
  return `${created ? `Demo SS 3 JAMB candidate ready (${EMAIL})` : `Demo JAMB candidate (${EMAIL})`}${granted.length ? ` with ${granted.join(' and ')} for a year` : ''}`;
}
