/**
 * "Now" as the school experiences it: its local date, weekday and clock time.
 * The server may run in any time zone; registers, lateness and "today" must
 * follow the school's.
 */
export interface SchoolNow {
  /** YYYY-MM-DD in the school's time zone. */
  date: string;
  /** 1 = Monday … 7 = Sunday */
  weekday: number;
  /** HH:MM, 24-hour. */
  time: string;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function schoolNow(timezone: string, at: Date = new Date()): SchoolNow {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS.indexOf(parts.weekday!) + 1,
    time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`,
  };
}

/** Weekday (1 = Monday) of a YYYY-MM-DD date. */
export function weekdayOf(date: string): number {
  const d = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** YYYY-MM-DD dates from `from` to `to` inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00.000Z`); d.toISOString().slice(0, 10) <= to; d = new Date(d.getTime() + 86_400_000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** School-local HH:MM of an instant. */
export function schoolTimeOf(timezone: string, at: Date): string {
  return schoolNow(timezone, at).time;
}
