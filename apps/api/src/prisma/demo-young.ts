import type { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../auth/password';

const EMAIL = 'young@greenfield.demo';
const PASSWORD = 'Greenfield#2026';

/**
 * At start-up, once ever: a Primary 1 class with one pupil who can sign in
 * (young@greenfield.demo), so young mode in EduGames can be shown. Also puts
 * the demo students in a house when the school has houses and they have none.
 * Demo school only; nothing is added again once it has run.
 */
export async function autoSeedDemoYoung(prisma: PrismaClient): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'greenfield' }, select: { id: true } });
  if (!tenant) return '';
  const tenantId = tenant.id;
  const onceKey = `demo-young:${tenantId}`;
  if (await prisma.platformSetting.findUnique({ where: { key: onceKey } })) return '';
  await prisma.platformSetting.create({ data: { key: onceKey, value: { at: new Date().toISOString() } } });

  const level =
    (await prisma.classLevel.findFirst({ where: { tenantId, name: 'Primary 1' } })) ??
    (await prisma.classLevel.create({ data: { tenantId, name: 'Primary 1', code: 'PRY1', stage: 'Primary', order: 1 } }));
  const arm =
    (await prisma.classArm.findFirst({ where: { tenantId, classLevelId: level.id } })) ??
    (await prisma.classArm.create({ data: { tenantId, classLevelId: level.id, name: 'A' } }));

  // The subjects a Primary 1 pupil plays games in.
  const subjects = await prisma.subject.findMany({ where: { tenantId, name: { in: ['Mathematics', 'English Language', 'Basic Science'] } }, select: { id: true } });
  for (const s of subjects) {
    const has = await prisma.classSubject.findFirst({ where: { tenantId, classArmId: arm.id, subjectId: s.id } });
    if (!has) await prisma.classSubject.create({ data: { tenantId, classArmId: arm.id, subjectId: s.id } });
  }

  let user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) user = await prisma.user.create({ data: { email: EMAIL, firstName: 'Tobi', lastName: 'Adeyemi', passwordHash: await hashPassword(PASSWORD) } });
  if (!(await prisma.student.findFirst({ where: { tenantId, userId: user.id } }))) {
    await prisma.student.create({
      data: { tenantId, firstName: 'Tobi', lastName: 'Adeyemi', gender: 'MALE', admissionNumber: 'GIS/P1/001', classArmId: arm.id, userId: user.id, status: 'ACTIVE', admittedOn: new Date() },
    });
  }
  if (!(await prisma.membership.findFirst({ where: { tenantId, userId: user.id } }))) {
    const role = await prisma.role.findUniqueOrThrow({ where: { tenantId_key: { tenantId, key: 'student' } } });
    await prisma.membership.create({ data: { tenantId, userId: user.id, roles: { create: { roleId: role.id } } } });
  }

  // House leaderboards need the demo pupils in a house.
  const house = await prisma.house.findFirst({ where: { tenantId }, orderBy: { name: 'asc' } });
  let housed = 0;
  if (house) {
    housed = (await prisma.student.updateMany({ where: { tenantId, houseId: null, user: { email: { in: ['student@greenfield.demo', EMAIL] } } }, data: { houseId: house.id } })).count;
  }
  return `Demo Primary 1 pupil ready (${EMAIL})${housed ? `; ${housed} demo pupil(s) put in ${house!.name}` : ''}`;
}
