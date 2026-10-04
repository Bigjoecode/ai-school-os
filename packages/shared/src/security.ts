import { z } from 'zod';

// ============================================================ two-step sign-in

/** Roles that can move money, change access or run the school: two-step sign-in can be required for them. */
export const TWO_FACTOR_POWERFUL_ROLE_KEYS = ['school_admin', 'principal', 'accountant'] as const;
/** Holding any of these permissions also counts as a powerful role. */
export const TWO_FACTOR_POWERFUL_PERMISSIONS = ['school.manage', 'users.manage', 'roles.manage', 'finance.manage'] as const;

/** Whether a school member's roles or permissions make them "powerful staff" for the two-step policy. */
export function isPowerfulStaff(roleKeys: readonly string[], permissions: Iterable<string>): boolean {
  if (roleKeys.some((k) => (TWO_FACTOR_POWERFUL_ROLE_KEYS as readonly string[]).includes(k))) return true;
  for (const p of permissions) if ((TWO_FACTOR_POWERFUL_PERMISSIONS as readonly string[]).includes(p)) return true;
  return false;
}

export const RECOVERY_CODE_COUNT = 10;

/** The API answers 403 with this code when a route is blocked until two-step sign-in is set up. */
export const TWO_FACTOR_SETUP_REQUIRED = 'TWO_FACTOR_SETUP_REQUIRED';

/** Password login when two-step sign-in is on: no tokens yet, just a 5-minute challenge for POST /auth/2fa. */
export interface TwoFactorChallengeResponse {
  twoFactorRequired: true;
  challenge: string;
  /** Seconds the challenge stays valid. */
  expiresIn: number;
}

const totpCode = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app'));

const recoveryCode = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]+/g, '').toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9]{10}$/, 'Recovery codes are 10 letters and numbers'));

export const twoFactorLoginSchema = z
  .object({
    challenge: z.string().min(20).max(2000),
    code: totpCode.optional(),
    recoveryCode: recoveryCode.optional(),
  })
  .refine((v) => !!v.code !== !!v.recoveryCode, { message: 'Enter a code from your app or one recovery code', path: ['code'] });
export type TwoFactorLoginInput = z.infer<typeof twoFactorLoginSchema>;

export const twoFactorCodeSchema = z.object({ code: totpCode });
export type TwoFactorCodeInput = z.infer<typeof twoFactorCodeSchema>;

export const twoFactorDisableSchema = z.object({
  password: z.string().min(1, 'Enter your password'),
  /** A code from the app, or one recovery code. */
  code: z.string().trim().min(6, 'Enter a code from your app or a recovery code').max(20),
});
export type TwoFactorDisableInput = z.infer<typeof twoFactorDisableSchema>;

export const securityPolicySchema = z.object({
  /** Require two-step sign-in for school admins, principals, accountants and anyone who can manage users or money. */
  requireTwoFactorForPowerfulStaff: z.boolean(),
});
export type SecurityPolicy = z.infer<typeof securityPolicySchema>;
export const DEFAULT_SECURITY_POLICY: SecurityPolicy = { requireTwoFactorForPowerfulStaff: false };

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
  /** The school (or, for platform staff, the platform) requires it for this account. */
  required: boolean;
  /** Strongly recommended (platform staff, powerful school roles). */
  recommended: boolean;
  /** Why it is required or recommended, for the banner. */
  reason: string | null;
}

export interface TwoFactorSetupResponse {
  /** Base32 secret for typing into an app by hand. */
  secret: string;
  /** otpauth:// URI for the QR code. */
  otpauthUrl: string;
}

export interface RecoveryCodesResponse {
  /** Shown once; only hashes are kept. */
  recoveryCodes: string[];
}

export interface SecurityMemberRow {
  userId: string;
  name: string;
  email: string;
  roles: string[];
  powerful: boolean;
  twoFactorEnabled: boolean;
  enabledAt: string | null;
  isPlatformStaff: boolean;
}

export interface SecurityPolicyResponse {
  policy: SecurityPolicy;
  members: SecurityMemberRow[];
}

// ============================================================ data export

export interface BackupExportRow {
  id: string;
  createdAt: string;
  actorName: string | null;
  summary: string;
  status: 'completed' | 'failed' | 'aborted';
  rows: number | null;
  bytes: number | null;
  files: number | null;
}

/** What the backup contains, shown on the settings page (and mirrored in README.txt). */
export const BACKUP_SECTIONS: { title: string; items: string[] }[] = [
  { title: 'School set-up', items: ['School profile', 'Branches', 'Sessions and terms', 'Class levels and arms', 'Subjects and class subjects', 'Departments'] },
  { title: 'People', items: ['Students (including health notes)', 'Parents and guardians, and who they are linked to', 'Staff records', 'User accounts and their roles (no passwords)'] },
  { title: 'Learning and results', items: ['Scores', 'Report cards and trait ratings', 'Homework and submissions', 'Promotions', 'Timetables'] },
  { title: 'Attendance and welfare', items: ['Student and staff attendance', 'Behaviour records', 'Sick bay visits'] },
  { title: 'Money', items: ['Fee items', 'Invoices and invoice lines', 'Payments', 'Expenses', 'Payroll runs and payslips'] },
  { title: 'Admissions and front office', items: ['Admission applications', 'Enquiries', 'Visitors'] },
  { title: 'Records', items: ['Announcements and events', 'Library books and loans', 'Inventory', 'Audit log (last 12 months)'] },
];
