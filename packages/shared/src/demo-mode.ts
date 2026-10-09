import { z } from 'zod';

/** The built-in demo schools (seeded with well-known logins for sales demos). */
export const DEMO_SCHOOL_SLUGS = ['greenfield', 'sunrise'] as const;

export const isDemoSchoolSlug = (slug: string | null | undefined): boolean =>
  !!slug && (DEMO_SCHOOL_SLUGS as readonly string[]).includes(slug);

/**
 * Platform switch for the demo schools (platform_settings key `demo-mode`).
 *  - publicHints: advertise the demo logins on the sign-in page and keep the
 *    demo schools' public websites reachable.
 *  - loginsEnabled: anyone other than platform staff may sign in to a demo school.
 * The data is kept either way. DEMO_LOGINS=off in the API environment forces
 * logins (and hints) off whatever the console says.
 */
export interface DemoModeSettings {
  publicHints: boolean;
  loginsEnabled: boolean;
}

export const demoModeSchema = z.object({ publicHints: z.boolean(), loginsEnabled: z.boolean() });
export type DemoModeInput = z.infer<typeof demoModeSchema>;

export interface DemoModeStatus {
  /** What the console has saved (or the default when nothing is saved yet). */
  saved: DemoModeSettings;
  /** What is in force after the environment override. */
  effective: DemoModeSettings;
  /** DEMO_LOGINS=off is set on the server: logins stay off until it is removed. */
  envLocked: boolean;
  schools: { slug: string; name: string; status: string }[];
  updatedAt: string | null;
  updatedBy: string | null;
}

/** One demo login advertised on the sign-in page (only while the hints are on). */
export interface DemoLoginHint {
  label: string;
  email: string;
  password: string;
  /** School ID to type, or '' to let the account pick (e.g. the parent with two schools). */
  school: string;
}

/** GET /public/config — what the sign-in page needs before anyone signs in. */
export interface PublicConfig {
  demoAccounts: boolean;
  /** Empty unless demoAccounts is on, so the credentials are not in the web bundle. */
  demoLogins: DemoLoginHint[];
}
