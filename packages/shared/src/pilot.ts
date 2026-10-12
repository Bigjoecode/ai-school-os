import { z } from 'zod';
import type { BillingStatus, SchoolTypeKey } from './self-serve';

/**
 * The free pilot programme: a limited number of schools (25 by default) the
 * operator approves one by one. A pilot school pays nothing for the rest of
 * the term it joins in plus the next full term; each school has an explicit
 * pilotEndsAt (editable in the console). After that the normal self-serve
 * flow applies: reminders, the next term's invoice, grace, read-only. Data is
 * never deleted.
 */

export const PILOT_SETTINGS_KEY = 'pilot';

export const pilotSettingsSchema = z.object({
  /** Applications accepted (the offer also hides itself when every place is used). */
  open: z.boolean().default(true),
  /** Pilot places. ACTIVE, ENDED and CONVERTED schools use a place; removing a school frees it. */
  places: z.number().int().min(0).max(1000).default(25),
});
export type PilotSettings = z.infer<typeof pilotSettingsSchema>;

export const PILOT_STATUSES = ['ACTIVE', 'ENDED', 'CONVERTED', 'REMOVED'] as const;
export type PilotStatus = (typeof PILOT_STATUSES)[number];
/** Statuses that use one of the places. */
export const PILOT_PLACE_STATUSES: PilotStatus[] = ['ACTIVE', 'ENDED', 'CONVERTED'];
export const PILOT_STATUS_LABELS: Record<PilotStatus, string> = {
  ACTIVE: 'In pilot',
  ENDED: 'Pilot ended',
  CONVERTED: 'Converted to paid',
  REMOVED: 'Removed',
};

/** Reminders before the pilot ends, in days, on top of the self-serve trial reminders (7, 3, 1 by default). */
export const PILOT_REMINDER_DAYS = [14, 3];

/** What the public site shows (GET /api/signup/pilot, also inside /api/signup/config). */
export interface PilotPublic {
  /** Applications are accepted: switched on, places left and sign-up email available. */
  open: boolean;
  places: number;
  placesLeft: number;
  /** One line for the brochure, deck and boards page, e.g. "Free pilot for 25 schools — one term free — 12 places left". */
  termsText: string;
  /** A longer sentence on what is free. */
  detail: string;
  applyPath: string;
}

export function pilotTermsText(places: number, placesLeft: number) {
  return `Free pilot for ${places} schools — one term free — ${placesLeft} ${placesLeft === 1 ? 'place' : 'places'} left`;
}
export const PILOT_DETAIL =
  'Pilot schools pay nothing for the rest of the term they join in and the whole of the next term. After that, normal per-student pricing applies; you get reminders well before, and nothing is ever deleted.';

// ------------------------------------------------------------------ the pilot end date

/**
 * A typical Nigerian school calendar, used only when a school has not set up
 * its own terms. Dates vary by state and by school, so this is an
 * approximation; the operator can change any school's pilot end date.
 */
export const TYPICAL_TERM_DATES = [
  { name: 'Second term', start: '01-06', end: '04-09' },
  { name: 'Third term', start: '04-27', end: '07-24' },
  { name: 'First term', start: '09-08', end: '12-18' },
] as const;

interface TermSpan {
  startsOn: string;
  endsOn: string;
}

function typicalTerms(fromYear: number, toYear: number): TermSpan[] {
  const out: TermSpan[] = [];
  for (let y = fromYear; y <= toYear; y++) for (const t of TYPICAL_TERM_DATES) out.push({ startsOn: `${y}-${t.start}`, endsOn: `${y}-${t.end}` });
  return out;
}

/** The end of the next full term after the one containing `day` (or, in a holiday, the end of the next term to start). */
function nextTermEnd(day: string, terms: TermSpan[]): string | null {
  const sorted = [...terms].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const current = sorted.find((t) => t.startsOn <= day && day <= t.endsOn);
  if (current) return sorted.find((t) => t.startsOn > current.endsOn)?.endsOn ?? null;
  return sorted.find((t) => t.startsOn > day)?.endsOn ?? null;
}

/**
 * When a pilot that starts on `joinedOn` (YYYY-MM-DD) ends: the rest of the
 * current term plus the next full term. Uses the school's own terms when they
 * cover it; otherwise the typical calendar (for the gap, or entirely).
 */
export function pilotEndDate(joinedOn: string, schoolTerms: TermSpan[] = []): { endsOn: string; basis: 'SCHOOL_CALENDAR' | 'TYPICAL_CALENDAR' } {
  const y = Number(joinedOn.slice(0, 4));
  const typical = typicalTerms(y - 1, y + 2);
  const own = schoolTerms.filter((t) => t.startsOn && t.endsOn && t.startsOn <= t.endsOn);
  if (own.length) {
    const sorted = [...own].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    const current = sorted.find((t) => t.startsOn <= joinedOn && joinedOn <= t.endsOn);
    const fromOwn = nextTermEnd(joinedOn, own);
    if (fromOwn) return { endsOn: fromOwn, basis: 'SCHOOL_CALENDAR' };
    // The school's current term is set up but not the next one: the typical next term after it.
    if (current) {
      const after = typical.find((t) => t.startsOn > current.endsOn);
      if (after) return { endsOn: after.endsOn, basis: 'TYPICAL_CALENDAR' };
    }
  }
  return { endsOn: nextTermEnd(joinedOn, typical)!, basis: 'TYPICAL_CALENDAR' };
}

/** The moment a pilot ends: the end of that day in Lagos (23:59:59 WAT). */
export const pilotEndsAtFromDate = (endsOn: string) => new Date(`${endsOn}T22:59:59.000Z`);
/** The Lagos calendar date of a moment. */
export const lagosDate = (d: Date) => new Date(d.getTime() + 3_600_000).toISOString().slice(0, 10);

// ------------------------------------------------------------------ console

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const pilotApproveSchema = z.object({ as: z.enum(['PILOT', 'TRIAL']).default('TRIAL') });
export type PilotApproveInput = z.infer<typeof pilotApproveSchema>;

export const pilotAddSchema = z.object({
  tenantId: z.string().min(1).max(40),
  /** Leave out to use the calculated date. */
  endsOn: dateOnly.optional(),
});
export type PilotAddInput = z.infer<typeof pilotAddSchema>;

export const pilotActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SET_END'), endsOn: dateOnly }),
  z.object({ action: z.literal('END_NOW') }),
  z.object({ action: z.literal('CONVERT') }),
  z.object({ action: z.literal('REMOVE'), reason: z.string().trim().max(300).optional() }),
]);
export type PilotActionInput = z.infer<typeof pilotActionSchema>;

export interface PilotSchoolRow {
  tenantId: string;
  name: string;
  slug: string;
  tenantStatus: string;
  state: string | null;
  schoolType: SchoolTypeKey | null;
  activeStudents: number;
  /** From the application, if the school applied. */
  approxStudents: number | null;
  joinedAt: string;
  pilotStatus: PilotStatus;
  pilotStartedAt: string | null;
  pilotEndsAt: string | null;
  daysLeft: number | null;
  billing: BillingStatus;
  plan: string | null;
  /** What one term will cost after the pilot at today's student count (or the estimate), on the school's plan. */
  termPriceKobo: number | null;
  health: number | null;
  healthBand: string | null;
  lastActivityAt: string | null;
}

export interface PilotCandidate {
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  /** The pilot end date if added today. */
  proposedEndsOn: string;
  basis: 'SCHOOL_CALENDAR' | 'TYPICAL_CALENDAR';
}

export interface PilotOverview {
  settings: PilotSettings;
  used: number;
  placesLeft: number;
  public: PilotPublic;
  pendingApplications: number;
  schools: PilotSchoolRow[];
}
