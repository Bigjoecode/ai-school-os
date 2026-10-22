import type { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../auth/password';
import { DEMO_PASSWORD } from './demo-jamb';

const EMAIL = 'bece@greenfield.demo';
const YEAR_MS = 365 * 86_400_000;

/**
 * At start-up, demo school only: a JSS 3 student who can sign in
 * (bece@greenfield.demo) with BECE Prep active, so the operator can sit a
 * full BECE mock. The student is created once ever; on later starts only
 * the BECE Prep grant is renewed if it has run out. Real schools are never
 * touched.
 */
export async function autoSeedDemoBece(prisma: PrismaClient): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'greenfield' }, select: { id: true } });
  if (!tenant) return '';
  const tenantId = tenant.id;
  const onceKey = `demo-bece:${tenantId}`;
  const done = await prisma.platformSetting.findUnique({ where: { key: onceKey } });
  let created = false;

  if (!done) {
    await prisma.platformSetting.create({ data: { key: onceKey, value: { at: new Date().toISOString() } } });
    const level = await prisma.classLevel.findFirst({ where: { tenantId, OR: [{ code: 'JSS3' }, { name: 'JSS 3' }] } });
    if (!level) return '';
    const arm = await prisma.classArm.findFirst({ where: { tenantId, classLevelId: level.id }, orderBy: { name: 'asc' } });
    if (!arm) return '';
    let user = await prisma.user.findUnique({ where: { email: EMAIL } });
    if (!user) user = await prisma.user.create({ data: { email: EMAIL, firstName: 'Tobi', lastName: 'Adeyemi', passwordHash: await hashPassword(DEMO_PASSWORD) } });
    if (!(await prisma.student.findFirst({ where: { tenantId, userId: user.id } }))) {
      await prisma.student.create({
        data: { tenantId, firstName: 'Tobi', lastName: 'Adeyemi', gender: 'MALE', admissionNumber: 'GIS/JSS3/BECE01', classArmId: arm.id, userId: user.id, status: 'ACTIVE', admittedOn: new Date() },
      });
    }
    if (!(await prisma.membership.findFirst({ where: { tenantId, userId: user.id } }))) {
      const role = await prisma.role.findUniqueOrThrow({ where: { tenantId_key: { tenantId, key: 'student' } } });
      await prisma.membership.create({ data: { tenantId, userId: user.id, roles: { create: { roleId: role.id } } } });
    }
    created = true;
  }

  // BECE Prep (a platform grant), renewed when it has run out.
  const student = await prisma.student.findFirst({ where: { tenantId, user: { email: EMAIL } }, select: { id: true } });
  if (!student) return '';
  const now = new Date();
  let granted = false;
  const active = await prisma.studentEntitlement.findFirst({ where: { studentId: student.id, key: 'EXAM_BECE', status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } } });
  if (!active) {
    await prisma.studentEntitlement.create({ data: { tenantId, studentId: student.id, key: 'EXAM_BECE', source: 'PLATFORM', startsAt: now, endsAt: new Date(now.getTime() + YEAR_MS), note: 'Demo: BECE Prep for trying the full BECE mock' } });
    granted = true;
  }
  if (!created && !granted) return '';
  return `${created ? `Demo JSS 3 BECE candidate ready (${EMAIL})` : `Demo BECE candidate (${EMAIL})`}${granted ? ' with BECE Prep for a year' : ''}`;
}
