import { z } from 'zod';

const name = z.string().trim().min(1, 'Required').max(80);
const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));
const optionalEmail = z
  .union([z.email('Enter a valid email'), z.literal('')])
  .optional()
  .transform((v) => (v ? v.toLowerCase() : undefined));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, numbers and dashes only');

// ---------------------------------------------------------------- auth
export const loginSchema = z.object({
  email: z.email('Enter a valid email').trim().toLowerCase(),
  password: z.string().min(1, 'Enter your password'),
  school: slug.optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const switchTenantSchema = z.object({ tenantId: z.string().min(1) });

// ---------------------------------------------------------------- platform
export const createTenantSchema = z.object({
  name: z.string().trim().min(3).max(120),
  slug,
  country: z.string().length(2).default('NG'),
  currency: z.string().length(3).default('NGN'),
  timezone: z.string().default('Africa/Lagos'),
  admin: z.object({
    firstName: name,
    lastName: name,
    email: z.email().trim().toLowerCase(),
    password: z.string().min(10, 'At least 10 characters'),
  }),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

// ---------------------------------------------------------------- school
export const updateSchoolSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  shortName: optionalText(40),
  motto: optionalText(160),
  email: optionalEmail,
  phone: optionalText(40),
  address: optionalText(300),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>;

export const branchSchema = z.object({
  name,
  code: z.string().trim().toUpperCase().min(1).max(12),
  address: optionalText(300),
  isMain: z.boolean().default(false),
});
export type BranchInput = z.infer<typeof branchSchema>;

// ---------------------------------------------------------------- academics
export const academicSessionSchema = z
  .object({
    name: z.string().trim().regex(/^\d{4}\/\d{4}$/, 'Use the form 2026/2027'),
    startsOn: isoDate,
    endsOn: isoDate,
    isCurrent: z.boolean().default(false),
  })
  .refine((v) => v.endsOn > v.startsOn, { message: 'End must be after start', path: ['endsOn'] });
export type AcademicSessionInput = z.infer<typeof academicSessionSchema>;

export const termSchema = z
  .object({
    sessionId: z.string().min(1),
    name,
    order: z.number().int().min(1).max(6),
    startsOn: isoDate,
    endsOn: isoDate,
    isCurrent: z.boolean().default(false),
  })
  .refine((v) => v.endsOn > v.startsOn, { message: 'End must be after start', path: ['endsOn'] });
export type TermInput = z.infer<typeof termSchema>;

export const classLevelSchema = z.object({
  name,
  code: z.string().trim().toUpperCase().min(1).max(12),
  stage: optionalText(40),
  order: z.number().int().min(0).max(100),
});
export type ClassLevelInput = z.infer<typeof classLevelSchema>;

export const classArmSchema = z.object({
  classLevelId: z.string().min(1),
  name: z.string().trim().min(1).max(20),
  capacity: z.number().int().min(1).max(500).optional(),
  classTeacherId: z.string().optional(),
  branchId: z.string().optional(),
});
export type ClassArmInput = z.infer<typeof classArmSchema>;

export const subjectSchema = z.object({
  name,
  code: z.string().trim().toUpperCase().min(1).max(12),
  category: optionalText(40),
  isCore: z.boolean().default(false),
});
export type SubjectInput = z.infer<typeof subjectSchema>;

// ---------------------------------------------------------------- people
export const GENDERS = ['MALE', 'FEMALE'] as const;
export const STUDENT_STATUSES = ['ACTIVE', 'SUSPENDED', 'WITHDRAWN', 'GRADUATED'] as const;

export const studentSchema = z.object({
  firstName: name,
  middleName: optionalText(80),
  lastName: name,
  gender: z.enum(GENDERS),
  dateOfBirth: isoDate.optional(),
  admissionNumber: optionalText(30),
  classArmId: z.string().optional(),
  branchId: z.string().optional(),
  admittedOn: isoDate.optional(),
  address: optionalText(300),
  medicalNotes: optionalText(1000),
  status: z.enum(STUDENT_STATUSES).default('ACTIVE'),
});
export type StudentInput = z.infer<typeof studentSchema>;

export const guardianSchema = z.object({
  firstName: name,
  lastName: name,
  relationship: z.string().trim().min(1).max(30),
  phone: z.string().trim().min(7).max(20),
  email: optionalEmail,
  occupation: optionalText(80),
  address: optionalText(300),
  studentIds: z.array(z.string()).default([]),
});
export type GuardianInput = z.infer<typeof guardianSchema>;

export const STAFF_TYPES = ['TEACHING', 'NON_TEACHING'] as const;
export const staffSchema = z.object({
  firstName: name,
  lastName: name,
  gender: z.enum(GENDERS),
  email: optionalEmail,
  phone: optionalText(20),
  jobTitle: z.string().trim().min(1).max(80),
  type: z.enum(STAFF_TYPES).default('TEACHING'),
  employedOn: isoDate.optional(),
  staffNumber: optionalText(30),
});
export type StaffInput = z.infer<typeof staffSchema>;

// ---------------------------------------------------------------- rbac
export const roleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: optionalText(200),
  permissions: z.array(z.string()).min(1, 'Pick at least one permission'),
});
export type RoleInput = z.infer<typeof roleSchema>;

export const inviteUserSchema = z.object({
  firstName: name,
  lastName: name,
  email: z.email().trim().toLowerCase(),
  roleIds: z.array(z.string()).min(1, 'Pick at least one role'),
  password: z.string().min(10, 'At least 10 characters'),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

// ---------------------------------------------------------------- ai
export const AI_AGENTS = ['school', 'teacher', 'parent', 'student', 'finance', 'admissions'] as const;
export type AiAgent = (typeof AI_AGENTS)[number];
export const aiChatSchema = z.object({
  agent: z.enum(AI_AGENTS).default('school'),
  conversationId: z.string().optional(),
  message: z.string().trim().min(1).max(4000),
});
export type AiChatInput = z.infer<typeof aiChatSchema>;

// ---------------------------------------------------------------- lists
export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
