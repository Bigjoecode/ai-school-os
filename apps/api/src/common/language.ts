import { asLanguage, DEFAULT_LANGUAGE, type LanguageCode } from '@aischool/shared';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Which language to talk in. Students choose their tutor language (or a
 * parent sets it); parents choose theirs, else the school's default for
 * parent messages (commsSettings.parentLanguage), else English.
 */

/** The school's default language for parent messages. */
export async function schoolParentLanguage(prisma: PrismaService, tenantId: string): Promise<LanguageCode> {
  const t = await prisma.root.tenant.findUnique({ where: { id: tenantId }, select: { commsSettings: true } });
  return asLanguage((t?.commsSettings as { parentLanguage?: unknown } | null)?.parentLanguage) ?? DEFAULT_LANGUAGE;
}

/** The student's tutor language (English when unset). */
export async function studentLanguage(prisma: PrismaService, studentId: string): Promise<LanguageCode> {
  const s = await prisma.root.student.findUnique({ where: { id: studentId }, select: { tutorLanguage: true } });
  return asLanguage(s?.tutorLanguage) ?? DEFAULT_LANGUAGE;
}

/** A parent's own choice in one school, or null when they haven't chosen. */
export async function parentChoice(prisma: PrismaService, tenantId: string, userId: string): Promise<LanguageCode | null> {
  const rows = await prisma.root.guardian.findMany({ where: { tenantId, userId }, select: { preferredLanguage: true }, orderBy: { createdAt: 'asc' } });
  for (const r of rows) {
    const l = asLanguage(r.preferredLanguage);
    if (l) return l;
  }
  return null;
}

/** The language for a parent (signed-in user) in a school: their choice, else the school default. */
export async function parentLanguage(prisma: PrismaService, tenantId: string, userId: string): Promise<LanguageCode> {
  return (await parentChoice(prisma, tenantId, userId)) ?? (await schoolParentLanguage(prisma, tenantId));
}
