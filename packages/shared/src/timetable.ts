import { z } from 'zod';

/**
 * Timetable contracts. The bell schedule defines the day; ClassSubject loads
 * (periods per week, teacher, room kind, doubles) define what must be placed;
 * the API's solver places it; AI explains and helps edit constraints.
 */

// ------------------------------------------------------------ bell schedule

export const PERIOD_KINDS = ['LESSON', 'BREAK', 'ASSEMBLY'] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export interface BellPeriod {
  label: string;
  start: string;
  end: string;
  kind: PeriodKind;
}

export interface BellSchedule {
  /** 1 = Monday … 7 = Sunday */
  days: number[];
  periods: BellPeriod[];
}

export const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A typical Nigerian secondary school day: eight 40-minute lessons, a short break and lunch. */
export const DEFAULT_BELL_SCHEDULE: BellSchedule = {
  days: [1, 2, 3, 4, 5],
  periods: [
    { label: 'Assembly', start: '07:40', end: '08:00', kind: 'ASSEMBLY' },
    { label: 'Period 1', start: '08:00', end: '08:40', kind: 'LESSON' },
    { label: 'Period 2', start: '08:40', end: '09:20', kind: 'LESSON' },
    { label: 'Period 3', start: '09:20', end: '10:00', kind: 'LESSON' },
    { label: 'Short break', start: '10:00', end: '10:20', kind: 'BREAK' },
    { label: 'Period 4', start: '10:20', end: '11:00', kind: 'LESSON' },
    { label: 'Period 5', start: '11:00', end: '11:40', kind: 'LESSON' },
    { label: 'Period 6', start: '11:40', end: '12:20', kind: 'LESSON' },
    { label: 'Lunch', start: '12:20', end: '13:00', kind: 'BREAK' },
    { label: 'Period 7', start: '13:00', end: '13:40', kind: 'LESSON' },
    { label: 'Period 8', start: '13:40', end: '14:20', kind: 'LESSON' },
  ],
};

/** Indices of the periods that hold lessons. */
export function lessonPeriods(schedule: BellSchedule): number[] {
  return schedule.periods.flatMap((p, i) => (p.kind === 'LESSON' ? [i] : []));
}

/** A double can start at `i` when it and the next period are both lessons with no break between. */
export function canStartDouble(schedule: BellSchedule, i: number): boolean {
  return schedule.periods[i]?.kind === 'LESSON' && schedule.periods[i + 1]?.kind === 'LESSON';
}

export const ROOM_KINDS = ['CLASSROOM', 'LAB', 'ICT', 'HALL', 'LIBRARY', 'WORKSHOP', 'STUDIO', 'FIELD'] as const;
export const ROOM_KIND_LABELS: Record<(typeof ROOM_KINDS)[number], string> = {
  CLASSROOM: 'Classroom',
  LAB: 'Science lab',
  ICT: 'ICT room',
  HALL: 'Hall',
  LIBRARY: 'Library',
  WORKSHOP: 'Workshop',
  STUDIO: 'Studio',
  FIELD: 'Sports field',
};

// ------------------------------------------------------------ schemas

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

export const bellScheduleSchema = z
  .object({
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    periods: z
      .array(z.object({ label: z.string().trim().min(1).max(30), start: time, end: time, kind: z.enum(PERIOD_KINDS) }))
      .min(1)
      .max(16),
  })
  .refine((s) => s.periods.every((p) => p.end > p.start), { message: 'Each period must end after it starts', path: ['periods'] })
  .refine((s) => s.periods.every((p, i) => i === 0 || p.start >= s.periods[i - 1]!.end), {
    message: 'Periods must be in order without overlapping',
    path: ['periods'],
  })
  .refine((s) => s.periods.some((p) => p.kind === 'LESSON'), { message: 'Add at least one lesson period', path: ['periods'] });

export const roomSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(ROOM_KINDS).default('CLASSROOM'),
  capacity: z.number().int().min(1).max(2000).nullable().optional(),
  isActive: z.boolean().default(true),
});
export type RoomInput = z.infer<typeof roomSchema>;

export const subjectLoadSchema = z.object({
  classArmId: z.string().min(1),
  subjectId: z.string().min(1),
  teacherId: z.string().nullable(),
  periodsPerWeek: z.number().int().min(0).max(20),
  roomKind: z.enum(ROOM_KINDS).nullable(),
  doublePeriod: z.boolean().default(false),
});
export type SubjectLoadInput = z.infer<typeof subjectLoadSchema>;

export const saveLoadsSchema = z.object({ rows: z.array(subjectLoadSchema).min(1).max(2000) });
export type SaveLoadsInput = z.infer<typeof saveLoadsSchema>;

const slot = z.object({ day: z.number().int().min(1).max(7), period: z.number().int().min(0).max(15) });
export const availabilitySchema = z.object({
  staffId: z.string().min(1),
  /** The complete set of periods this teacher can't teach (replaces what was there). */
  unavailable: z.array(slot).max(120),
});
export type AvailabilityInput = z.infer<typeof availabilitySchema>;

export const generateTimetableSchema = z.object({
  termId: z.string().min(1),
  name: z.string().trim().max(80).optional(),
});
export type GenerateTimetableInput = z.infer<typeof generateTimetableSchema>;

export const moveEntrySchema = z.object({
  day: z.number().int().min(1).max(7),
  period: z.number().int().min(0).max(15),
  roomId: z.string().nullable().optional(),
  locked: z.boolean().optional(),
});
export type MoveEntryInput = z.infer<typeof moveEntrySchema>;

export const timetableViewQuerySchema = z.object({
  by: z.enum(['class', 'teacher', 'room']),
  id: z.string().min(1),
});
export type TimetableViewQuery = z.infer<typeof timetableViewQuerySchema>;

export const interpretRequestSchema = z.object({ text: z.string().trim().min(3).max(1500) });

/** One constraint change the AI proposes from a plain-English request. */
export const timetableChangeSchema = z.object({
  kind: z.enum(['teacher_unavailable', 'teacher_available', 'set_periods', 'set_room_kind', 'set_double']),
  /** What the change means, in one short sentence, for the user to confirm. */
  summary: z.string(),
  staffId: z.string().nullable(),
  days: z.array(z.number().int()).nullable(),
  /** Bell-schedule period indices. */
  periods: z.array(z.number().int()).nullable(),
  subjectId: z.string().nullable(),
  classLevelId: z.string().nullable(),
  periodsPerWeek: z.number().int().nullable(),
  roomKind: z.string().nullable(),
  doublePeriod: z.boolean().nullable(),
});
export type TimetableChange = z.infer<typeof timetableChangeSchema>;

export const aiInterpretationSchema = z.object({
  changes: z.array(timetableChangeSchema),
  /** Anything in the request that couldn't be turned into a change. */
  notUnderstood: z.string(),
});
export type AiInterpretation = z.infer<typeof aiInterpretationSchema>;

export const applyChangesSchema = z.object({ changes: z.array(timetableChangeSchema).min(1).max(40) });

// ------------------------------------------------------------ responses

interface Ref {
  id: string;
  name: string;
}

export interface RoomRow {
  id: string;
  name: string;
  kind: (typeof ROOM_KINDS)[number];
  capacity: number | null;
  isActive: boolean;
}

export interface TimetableSetup {
  bellSchedule: BellSchedule;
  rooms: RoomRow[];
  levels: (Ref & { code: string; arms: Ref[] })[];
  subjects: (Ref & { code: string; isCore: boolean })[];
  teachers: (Ref & { jobTitle: string; periodsAssigned: number; unavailable: { day: number; period: number }[] })[];
  loads: SubjectLoadInput[];
  /** Lesson slots available per class each week. */
  slotsPerWeek: number;
}

export interface TimetableEntryView {
  id: string;
  day: number;
  period: number;
  classArm: Ref & { levelName: string };
  subject: Ref & { code: string };
  teacher: Ref | null;
  room: Ref | null;
  doubleGroup: string | null;
  locked: boolean;
}

export interface UnplacedLesson {
  classArm: string;
  subject: string;
  teacher: string | null;
  missing: number;
  reason: string;
}

export interface SolverReport {
  required: number;
  placed: number;
  unplaced: UnplacedLesson[];
  quality: {
    /** Extra lessons of the same subject on one day for a class (lower is better). */
    sameDayRepeats: number;
    /** Core-subject lessons in the last two periods. */
    lateCoreLessons: number;
    /** Teacher-days above six lessons. */
    teacherOverloadDays: number;
    doublesPlaced: number;
    doublesRequested: number;
  };
  warnings: string[];
  durationMs: number;
}

export interface TimetableSummary {
  id: string;
  name: string;
  term: Ref & { sessionName: string };
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  generation: 'NONE' | 'QUEUED' | 'RUNNING' | 'FAILED' | 'DONE';
  generationError: string | null;
  entryCount: number;
  report: SolverReport | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface TimetableDetail extends TimetableSummary {
  bellSchedule: BellSchedule;
  entries: TimetableEntryView[];
}

export interface MoveConflict {
  kind: 'class' | 'teacher' | 'room' | 'unavailable' | 'not_lesson' | 'room_kind';
  message: string;
}

export interface TodaySchedule {
  date: string;
  day: number;
  dayName: string;
  timetable: { id: string; name: string } | null;
  /** Index of the period happening now, if any. */
  currentPeriod: number | null;
  bellSchedule: BellSchedule;
  /** The signed-in teacher's lessons today (empty for non-teachers). */
  myLessons: (TimetableEntryView & { start: string; end: string; label: string })[];
  /** Whole-school count of lessons running in the current period. */
  lessonsNow: number;
}

export interface InterpretResult extends AiInterpretation {
  provider: string;
  model: string;
}
