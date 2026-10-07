/** Date helpers for the success dashboard: school-local calendar days and weeks. */

const DAY = 86_400_000;

/** Minutes the school's time zone is ahead of UTC at a moment (Lagos: +60). */
export function tzOffsetMs(timezone: string, at: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return Math.round((asUtc - at.getTime()) / 60_000) * 60_000;
}

/** The UTC instant of local midnight at the start of a YYYY-MM-DD date. */
export function localMidnight(date: string, timezone: string): Date {
  const guess = new Date(`${date}T00:00:00Z`);
  return new Date(guess.getTime() - tzOffsetMs(timezone, guess));
}

/** The school-local YYYY-MM-DD of an instant. */
export function localDate(at: Date, timezone: string): string {
  return new Date(at.getTime() + tzOffsetMs(timezone, at)).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
}

/** Monday of the week a YYYY-MM-DD date falls in. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(date, -dow);
}

export const dateOnlyIso = (d: Date) => d.toISOString().slice(0, 10);
