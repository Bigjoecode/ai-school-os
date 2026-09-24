import { ALL_PERMISSIONS, type Permission } from './permissions';

/** Platform-level roles for the SaaS operator, separate from school roles. */
export const PLATFORM_ROLES = ['SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export interface SystemRoleDefinition {
  key: string;
  name: string;
  description: string;
  permissions: readonly Permission[];
}

const readCore: Permission[] = [
  'school.read',
  'academics.read',
  'students.read',
  'guardians.read',
  'staff.read',
];

/**
 * Roles every new school starts with. They are copied into the tenant so a
 * school can adjust them; schools can also add their own.
 */
export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    key: 'school_admin',
    name: 'School Admin',
    description: 'Full control of the school account.',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: 'principal',
    name: 'Principal',
    description: 'Oversees academics, people and school performance.',
    permissions: [
      ...readCore,
      'users.read',
      'academics.manage',
      'students.manage',
      'guardians.manage',
      'staff.manage',
      'finance.read',
      'ai.use',
      'ai.admin',
      'audit.read',
    ],
  },
  {
    key: 'vice_principal',
    name: 'Vice Principal',
    description: 'Supports the principal across academics and discipline.',
    permissions: [...readCore, 'academics.manage', 'students.manage', 'ai.use'],
  },
  {
    key: 'academic_coordinator',
    name: 'Academic Coordinator',
    description: 'Owns curriculum, schemes, timetable and assessment.',
    permissions: [...readCore, 'academics.manage', 'ai.use'],
  },
  {
    key: 'teacher',
    name: 'Teacher',
    description: 'Teaches classes, records attendance and results.',
    permissions: ['school.read', 'academics.read', 'students.read', 'guardians.read', 'ai.use'],
  },
  {
    key: 'accountant',
    name: 'Accountant',
    description: 'Manages fees, payments and expenses.',
    permissions: ['school.read', 'students.read', 'guardians.read', 'finance.read', 'finance.manage', 'ai.use'],
  },
  {
    key: 'hr_manager',
    name: 'HR Manager',
    description: 'Manages staff records, leave and payroll.',
    permissions: ['school.read', 'staff.read', 'staff.manage', 'ai.use'],
  },
  {
    key: 'receptionist',
    name: 'Receptionist',
    description: 'Front desk: visitors, enquiries and admissions.',
    permissions: ['school.read', 'students.read', 'guardians.read'],
  },
  {
    key: 'librarian',
    name: 'Librarian',
    description: 'Runs the library.',
    permissions: ['school.read', 'students.read', 'staff.read'],
  },
  {
    key: 'transport_manager',
    name: 'Transport Manager',
    description: 'Runs routes and vehicles.',
    permissions: ['school.read', 'students.read'],
  },
  {
    key: 'hostel_manager',
    name: 'Hostel Manager',
    description: 'Runs boarding and hostels.',
    permissions: ['school.read', 'students.read'],
  },
  {
    key: 'parent',
    name: 'Parent',
    description: 'Portal access to their own children only.',
    permissions: ['ai.use'],
  },
  {
    key: 'student',
    name: 'Student',
    description: 'Portal access to their own learning.',
    permissions: ['ai.use'],
  },
];
