import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { registerTickTask } from '../common/tick-tasks';
import { PrismaService } from './prisma.service';

/**
 * Retention for tables that only ever grow (documented in DEPLOYMENT.md and
 * docs/legal/data-retention.md). Sign-in history and read notifications are
 * kept a little over a school year because the success dashboard counts
 * active users and opened updates per term, including last year's terms.
 */
export const RETENTION = {
  /** Sign-in session records (refresh tokens). They expire after 30 days; the record is kept for activity history. */
  sessionDays: 400,
  /** In-app notifications the user has read. Unread ones are kept. */
  readNotificationDays: 400,
  /** Server game rounds started but never answered (no score, no XP). */
  abandonedRoundDays: 30,
} as const;

const DAY_MS = 86_400_000;
const BATCH = 5000;
/** At most this many rows per table per run, so one run never holds the database for long. */
const MAX_BATCHES = 40;

/**
 * Daily pruning, on the scheduler's tick (every minute in-process, and the
 * cron tick): runs at most once a day per process. Deletes in small batches.
 * The audit log is never touched here (sign-ins stay recorded there).
 */
@Injectable()
export class HousekeepingService implements OnModuleInit {
  private readonly logger = new Logger(HousekeepingService.name);
  private lastRun = 0;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    registerTickTask('housekeeping', () => this.daily());
  }

  /** Once a day: the rows pruned (0 when it isn't due yet). */
  async daily(now = new Date()): Promise<number> {
    if (this.running || now.getTime() - this.lastRun < DAY_MS) return 0;
    this.running = true;
    try {
      const r = await this.prune(now);
      this.lastRun = now.getTime();
      const total = r.sessions + r.notifications + r.gameRounds;
      if (total) this.logger.log(`Pruned ${r.sessions} old sign-in session(s), ${r.notifications} read notification(s), ${r.gameRounds} abandoned game round(s)`);
      return total;
    } finally {
      this.running = false;
    }
  }

  async prune(now = new Date()) {
    const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const sessionCutoff = before(RETENTION.sessionDays);
    const notificationCutoff = before(RETENTION.readNotificationDays);
    const roundCutoff = before(RETENTION.abandonedRoundDays);
    const db = this.prisma.root;
    return {
      // Older than the retention period and no longer usable (expired or revoked).
      sessions: await this.batched(
        () => db.$executeRaw`
          DELETE FROM auth_sessions WHERE id IN (
            SELECT id FROM auth_sessions
            WHERE "createdAt" < ${sessionCutoff} AND ("expiresAt" < ${now} OR "revokedAt" IS NOT NULL)
            LIMIT ${BATCH})`,
      ),
      notifications: await this.batched(
        () => db.$executeRaw`
          DELETE FROM notifications WHERE id IN (
            SELECT id FROM notifications WHERE "readAt" IS NOT NULL AND "createdAt" < ${notificationCutoff} LIMIT ${BATCH})`,
      ),
      gameRounds: await this.batched(
        () => db.$executeRaw`
          DELETE FROM game_rounds WHERE id IN (
            SELECT id FROM game_rounds WHERE mode = 'SERVER' AND total = 0 AND "startedAt" < ${roundCutoff} LIMIT ${BATCH})`,
      ),
    };
  }

  private async batched(run: () => Promise<number>): Promise<number> {
    let total = 0;
    for (let i = 0; i < MAX_BATCHES; i++) {
      const n = await run();
      total += n;
      if (n < BATCH) break;
    }
    return total;
  }
}
