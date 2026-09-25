import { z } from 'zod';

/**
 * Attendance contracts: daily class registers, staff attendance (manual and
 * QR kiosk check-in), reports and AI help. Rates are always over registers
 * actually taken, so a forgotten register never counts as absence.
 */

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export const STAFF_ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE'] as const;
export type StaffAttendanceStatus = (typeof STAFF_ATTENDANCE_STATUSES)[number];

/** Present-or-late counts as attending; excused absences don't count against the rate. */
export function attendanceRate(c: { present: number; late: number; absent: number; excused: number }): number | null {
  const counted = c.present + c.late + c.absent;
  return counted ? Math.round(((c.present + c.late) / counted) * 1000) / 10 : null;
}

/** Below this term rate a learner is flagged as persistently absent. */
export const CHRONIC_ABSENCE_THRESHOLD = 90;

export interface AttendanceSettings {
  /** Staff checking in after this (school time) are marked late. */
  staffLateAfter: string;
  /** How many days back teachers may still edit a register. */
  editWindowDays: number;
}

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = { staffLateAfter: '07:45', editWindowDays: 7 };

// ------------------------------------------------------------ schemas

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const attendanceSettingsSchema = z.object({
  staffLateAfter: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM'),
  editWindowDays: z.number().int().min(0).max(60),
});

export const registerQuerySchema = z.object({
  classArmId: z.string().min(1),
  /** Defaults to today in the school's time zone. */
  date: isoDate.optional(),
});
export type RegisterQuery = z.infer<typeof registerQuerySchema>;

export const saveRegisterSchema = z.object({
  classArmId: z.string().min(1),
  date: isoDate,
  marks: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(ATTENDANCE_STATUSES),
        note: z
          .string()
          .trim()
          .max(200)
          .optional()
          .transform((v) => (v ? v : undefined)),
      }),
    )
    .min(1)
    .max(200),
});
export type SaveRegisterInput = z.infer<typeof saveRegisterSchema>;

export const dateQuerySchema = z.object({ date: isoDate.optional() });

export const termQuerySchema = z.object({
  /** Defaults to the current term. */
  termId: z.string().optional(),
  classArmId: z.string().optional(),
});
export type AttendanceTermQuery = z.infer<typeof termQuerySchema>;

export const saveStaffAttendanceSchema = z.object({
  date: isoDate,
  marks: z
    .array(
      z.object({
        staffId: z.string().min(1),
        status: z.enum(STAFF_ATTENDANCE_STATUSES),
        note: z
          .string()
          .trim()
          .max(200)
          .optional()
          .transform((v) => (v ? v : undefined)),
      }),
    )
    .min(1)
    .max(500),
});
export type SaveStaffAttendanceInput = z.infer<typeof saveStaffAttendanceSchema>;

export const checkInSchema = z.object({ token: z.string().min(10).max(2000) });

export const absenceMessageSchema = z.object({
  studentId: z.string().min(1),
  termId: z.string().optional(),
});

/** What the AI returns when drafting a note to a parent. */
export const aiAbsenceMessageSchema = z.object({
  subject: z.string(),
  message: z.string(),
  smsVersion: z.string(),
});
export type AiAbsenceMessage = z.infer<typeof aiAbsenceMessageSchema>;

// ------------------------------------------------------------ responses

interface Ref {
  id: string;
  name: string;
}

export interface AttendanceCounts {
  present: number;
  absent: number;
  late: number;
  excused: number;
}

export interface RegisterView {
  classArm: Ref & { levelName: string; classTeacher: string | null };
  date: string;
  dayName: string;
  /** False for weekends and other non-school days. */
  schoolDay: boolean;
  taken: boolean;
  takenBy: string | null;
  takenAt: string | null;
  canEdit: boolean;
  /** Why editing is off, when it is. */
  readOnlyReason: string | null;
  students: {
    id: string;
    name: string;
    admissionNumber: string;
    status: AttendanceStatus | null;
    note: string | null;
    /** Term rate so far, to spot patterns while marking. */
    termRate: number | null;
  }[];
  counts: AttendanceCounts;
}

export interface TodayAttendance {
  date: string;
  dayName: string;
  schoolDay: boolean;
  term: Ref | null;
  students: AttendanceCounts & { rate: number | null; onRoll: number; unmarked: number };
  classes: {
    classArm: Ref & { levelName: string };
    classTeacher: string | null;
    classTeacherUserId: string | null;
    taken: boolean;
    counts: AttendanceCounts;
    rate: number | null;
    onRoll: number;
  }[];
  registersTaken: number;
  registersExpected: number;
  staff: { present: number; late: number; absent: number; onLeave: number; notIn: number; total: number };
  absentees: { id: string; name: string; classArm: string; status: 'ABSENT' | 'LATE'; note: string | null; consecutive: number }[];
}

export interface StudentAttendanceView {
  student: { id: string; name: string; admissionNumber: string; classArm: string | null };
  term: Ref & { startsOn: string; endsOn: string };
  counts: AttendanceCounts;
  rate: number | null;
  daysMarked: number;
  /** Consecutive absences ending on the latest marked day. */
  currentAbsenceStreak: number;
  days: { date: string; status: AttendanceStatus; note: string | null }[];
  byWeekday: { day: number; rate: number | null }[];
}

export interface ClassAttendanceReport {
  classArm: Ref & { levelName: string };
  term: Ref;
  registersTaken: number;
  schoolDaysSoFar: number;
  rate: number | null;
  students: {
    id: string;
    name: string;
    admissionNumber: string;
    counts: AttendanceCounts;
    rate: number | null;
    chronic: boolean;
  }[];
  daily: { date: string; rate: number | null }[];
}

export interface SchoolAttendanceReport {
  term: Ref & { startsOn: string; endsOn: string };
  rate: number | null;
  counts: AttendanceCounts;
  daily: { date: string; rate: number | null; registers: number }[];
  byWeekday: { day: number; rate: number | null }[];
  classes: { classArm: Ref & { levelName: string }; rate: number | null; registersTaken: number }[];
  chronic: { id: string; name: string; classArm: string; rate: number; absent: number }[];
  staffRate: number | null;
  staffLateDays: number;
}

export interface StaffAttendanceDay {
  date: string;
  settings: AttendanceSettings;
  staff: {
    id: string;
    name: string;
    jobTitle: string;
    type: 'TEACHING' | 'NON_TEACHING';
    status: StaffAttendanceStatus | null;
    checkInAt: string | null;
    checkOutAt: string | null;
    method: string | null;
    note: string | null;
  }[];
}

export interface KioskToken {
  token: string;
  /** The URL staff open (the QR code encodes it). */
  url: string;
  expiresAt: string;
  schoolName: string;
  recent: { name: string; action: 'in' | 'out'; at: string; late: boolean }[];
}

export interface CheckInResult {
  action: 'in' | 'out';
  at: string;
  status: StaffAttendanceStatus;
  name: string;
  message: string;
}

export interface MyAttendanceToday {
  isStaff: boolean;
  date: string;
  status: StaffAttendanceStatus | null;
  checkInAt: string | null;
  checkOutAt: string | null;
}

export interface AbsenceMessage extends AiAbsenceMessage {
  guardian: { name: string; phone: string; email: string | null } | null;
  provider: string;
  model: string;
}
