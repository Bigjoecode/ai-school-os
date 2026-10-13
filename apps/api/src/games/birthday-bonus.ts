import { BIRTHDAY_BONUS_XP } from '@aischool/shared';
import type { PrismaClient } from '../generated/prisma/client';

/**
 * A once-a-year birthday treat in EduGames: bonus XP and the "Birthday star"
 * badge. Idempotent: the automation_runs row (one per student per school date)
 * is the claim, so calling it again the same day does nothing. Takes the same
 * per-student advisory lock as GamesService.award, so XP never races a round.
 * Returns true when the bonus was given by this call.
 */
export async function awardBirthdayBonus(db: PrismaClient, tenantId: string, studentId: string, today: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${`games:${studentId}`}))) l`;
    const claimed = await tx.automationRun.createMany({
      data: [{ tenantId, kind: 'BIRTHDAY_GAMES_BONUS', subjectKey: studentId, runDate: new Date(`${today}T00:00:00Z`) }],
      skipDuplicates: true,
    });
    if (!claimed.count) return false;
    const prev = await tx.gameProfile.upsert({ where: { studentId }, update: {}, create: { tenantId, studentId } });
    const badges = { ...((prev.badges ?? {}) as Record<string, string>), BIRTHDAY: new Date().toISOString() };
    await tx.gameProfile.update({ where: { id: prev.id }, data: { xp: prev.xp + BIRTHDAY_BONUS_XP, badges } });
    return true;
  });
}
