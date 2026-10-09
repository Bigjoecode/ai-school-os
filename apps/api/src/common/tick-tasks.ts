import { Logger } from '@nestjs/common';
import { raiseAlert } from '../alerts/alerts.service';

/**
 * Housekeeping that other modules want run on the scheduler's tick (every
 * minute in-process, and on POST /api/cron/tick from a cron job), without
 * the comms module having to depend on them. Each task must be idempotent.
 */
type TickTask = () => Promise<number>;

const tasks = new Map<string, TickTask>();
const logger = new Logger('TickTasks');

export function registerTickTask(name: string, run: TickTask) {
  tasks.set(name, run);
}

/** Runs every registered task; returns how much each one did. */
export async function runTickTasks(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [name, run] of tasks) {
    try {
      out[name] = await run();
    } catch (err) {
      logger.error(`${name} failed: ${(err as Error).message}`);
      raiseAlert('job', `tick:${name}`, `Scheduled job "${name}" failed`, `${(err as Error).message}`.slice(0, 1000));
      out[name] = 0;
    }
  }
  return out;
}
