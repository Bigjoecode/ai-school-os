import { DEFAULT_COMMS_SETTINGS, type CommsSettings } from '@aischool/shared';
import type { Prisma, PrismaClient } from '../generated/prisma/client';

/**
 * At start-up, once ever, demo school only: turns on student and staff
 * birthday greetings with app channels only (in-app and push, never SMS), so
 * the demo shows the birthday card and morning notes at no cost. Real schools
 * keep greetings off until they choose (consent and SMS cost). Nobody's date
 * of birth is changed: the student dashboard offers a demo-only preview.
 */
export async function autoDemoBirthdays(prisma: PrismaClient): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'greenfield' }, select: { id: true, commsSettings: true } });
  if (!tenant) return '';
  const onceKey = `demo-birthdays:${tenant.id}`;
  if (await prisma.platformSetting.findUnique({ where: { key: onceKey } })) return '';
  await prisma.platformSetting.create({ data: { key: onceKey, value: { at: new Date().toISOString() } } });

  const saved = (tenant.commsSettings as Partial<CommsSettings> | null) ?? {};
  const b = { ...DEFAULT_COMMS_SETTINGS.birthdays, ...(saved.birthdays ?? {}) };
  const app: CommsSettings['birthdays']['students']['channels'] = ['IN_APP', 'PUSH'];
  const next: CommsSettings = {
    ...DEFAULT_COMMS_SETTINGS,
    ...saved,
    birthdays: {
      ...b,
      students: { ...b.students, enabled: true, channels: app },
      staff: { ...b.staff, enabled: true, channels: app },
      studentGreeting: { ...b.studentGreeting, enabled: true },
    },
  };
  await prisma.tenant.update({ where: { id: tenant.id }, data: { commsSettings: next as unknown as Prisma.InputJsonValue } });
  return 'Demo birthday greetings on (students, staff; in-app and push only)';
}
