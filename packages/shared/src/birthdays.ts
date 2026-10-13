import { z } from 'zod';

/**
 * Birthdays: the student's own celebration card, class teachers' "birthdays in
 * my class", and the admin list. Privacy: anything shown to students or
 * teachers carries the day and month only — never the year or an age.
 */

/** Bonus XP a student gets in EduGames, once, on their birthday. */
export const BIRTHDAY_BONUS_XP = 25;

/** The default message on the student's own birthday card. Placeholders: {{first_name}}, {{school}}. */
export const DEFAULT_STUDENT_GREETING =
  'Everyone at {{school}} hopes your special day is full of fun, laughter and lots of smiles. Have a wonderful day, {{first_name}}!';

/** "MM-DD" of a YYYY-MM-DD date. */
export function monthDayOf(date: string): string {
  return date.slice(5, 10);
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * The birthdays (MM-DD) celebrated on a school date. In a year without
 * 29 February, people born on it celebrate on the 28th.
 */
export function birthdayKeysFor(today: string): string[] {
  const md = monthDayOf(today);
  if (md === '02-28' && !isLeap(Number(today.slice(0, 4)))) return ['02-28', '02-29'];
  return [md];
}

/** Whether someone born on `dob` (YYYY-MM-DD) celebrates on `today`. */
export function isBirthdayOn(dob: string | null | undefined, today: string): boolean {
  return !!dob && birthdayKeysFor(today).includes(monthDayOf(dob));
}

/** Days from `today` to the next celebration of a MM-DD birthday (0 = today). */
export function daysUntilBirthday(md: string, today: string): number {
  const year = Number(today.slice(0, 4));
  const base = Date.parse(`${today}T00:00:00Z`);
  for (const y of [year, year + 1]) {
    const day = md === '02-29' && !isLeap(y) ? '02-28' : md;
    const at = Date.parse(`${y}-${day}T00:00:00Z`);
    if (at >= base) return Math.round((at - base) / 86_400_000);
  }
  return 365;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "14 Oct" for "10-14": day and month only. */
export function dayMonthLabel(md: string): string {
  return `${Number(md.slice(3, 5))} ${MONTHS[Number(md.slice(0, 2)) - 1] ?? ''}`.trim();
}

/** Fills {{first_name}} and {{school}} in the student greeting. */
export function studentGreetingText(template: string, firstName: string, school: string): string {
  return template.replace(/\{\{\s*first_name\s*\}\}/g, firstName).replace(/\{\{\s*name\s*\}\}/g, firstName).replace(/\{\{\s*school\s*\}\}/g, school);
}

// ------------------------------------------------------------ the student's own card

export interface MyBirthday {
  /** It is the student's birthday today and the school greets students. */
  today: boolean;
  firstName: string;
  /** The school's message, filled in. */
  message: string;
  school: string;
  /** Nursery to Primary 3: the simpler, picture-heavy card. */
  young: boolean;
  /** Bonus XP given in EduGames today (null when none). */
  bonusXp: number | null;
  /** The demo school: a "preview my birthday card" button is offered. */
  demoPreview: boolean;
}

// ------------------------------------------------------------ class teachers

/** A birthday in a list. `day` is MM-DD only: no year, no age. */
export interface BirthdayRow {
  id: string;
  kind: 'STUDENT' | 'STAFF';
  name: string;
  firstName: string;
  /** Class (students) or job title (staff). */
  detail: string | null;
  classArmId: string | null;
  /** MM-DD */
  day: string;
  /** "14 Oct" */
  dayLabel: string;
  /** 0 = today. */
  inDays: number;
}

export interface ClassBirthdays {
  today: string;
  /** The classes the teacher leads or teaches. */
  classes: { classArmId: string; label: string; lead: boolean }[];
  /** Today and the next 7 days, students only. */
  birthdays: BirthdayRow[];
  /** Classes that have had their wishes posted today. */
  wishesSent: string[];
}

export const classWishesSchema = z.object({
  classArmId: z.string().min(1).max(40),
  /** Optional extra line from the teacher. */
  note: z.string().trim().max(300).nullish().transform((v) => v || null),
});
export type ClassWishesInput = z.infer<typeof classWishesSchema>;

export interface ClassWishesResult {
  announcementId: string;
  title: string;
  names: string[];
}

// ------------------------------------------------------------ admin

export const upcomingBirthdaysQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(366).default(30),
  classArmId: z.string().max(40).optional(),
});

export interface UpcomingBirthdays {
  today: string;
  days: number;
  students: BirthdayRow[];
  staff: BirthdayRow[];
  classes: { id: string; label: string }[];
  /** People with no date of birth on record, so no birthday can be shown. */
  missing: {
    students: number;
    staff: number;
    studentSample: { id: string; name: string; detail: string | null; admissionNumber: string }[];
    staffSample: { id: string; name: string; detail: string | null }[];
  };
  settings: { students: boolean; staff: boolean; greetStudent: boolean; sendAt: string; greetingTemplate: string };
  school: string;
}
