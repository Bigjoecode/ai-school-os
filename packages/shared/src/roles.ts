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
      'hr.read', 'hr.self', 'leave.approve', 'payroll.read', 'payroll.approve',
      'curriculum.read', 'curriculum.manage', 'lessons.read', 'lessons.manage',
      'assessment.read', 'assessment.manage', 'results.read', 'results.enter', 'results.publish',
      'timetable.read', 'timetable.manage',
      'attendance.read', 'attendance.take', 'attendance.manage',
      'ai.use',
      'ai.admin',
      'audit.read',
      'library.read', 'inventory.read', 'transport.read', 'hostel.read', 'reception.read', 'documents.issue', 'comms.read', 'comms.send', 'comms.manage', 'announcements.manage', 'events.manage', 'live.read', 'live.manage', 'homework.manage', 'website.manage', 'support.use', 'sponsorship.manage', 'knowledge.manage', 'admissions.read', 'admissions.manage', 'lessons.approve', 'welfare.read', 'behaviour.manage', 'health.manage',
    ],
  },
  {
    key: 'vice_principal',
    name: 'Vice Principal',
    description: 'Supports the principal across academics and discipline.',
    permissions: [...readCore, 'academics.manage', 'students.manage', 'curriculum.read', 'curriculum.manage', 'lessons.read', 'lessons.manage', 'assessment.read', 'assessment.manage', 'results.read', 'results.enter', 'results.publish', 'timetable.read', 'timetable.manage', 'attendance.read', 'attendance.take', 'attendance.manage', 'hr.read', 'hr.self', 'ai.use', 'library.read', 'transport.read', 'hostel.read', 'reception.read', 'documents.issue', 'comms.read', 'comms.send', 'announcements.manage', 'events.manage', 'live.read', 'live.manage', 'homework.manage', 'lessons.approve', 'welfare.read', 'behaviour.manage', 'health.manage'],
  },
  {
    key: 'academic_coordinator',
    name: 'Academic Coordinator',
    description: 'Owns curriculum, schemes, timetable and assessment.',
    permissions: [...readCore, 'academics.manage', 'curriculum.read', 'curriculum.manage', 'lessons.read', 'lessons.manage', 'assessment.read', 'assessment.manage', 'results.read', 'results.enter', 'results.publish', 'timetable.read', 'timetable.manage', 'attendance.read', 'attendance.take', 'hr.self', 'ai.use', 'library.read', 'documents.issue', 'comms.read', 'events.manage', 'live.read', 'live.manage', 'homework.manage', 'lessons.approve', 'welfare.read'],
  },
  {
    key: 'teacher',
    name: 'Teacher',
    description: 'Teaches classes, records attendance and results.',
    permissions: ['school.read', 'academics.read', 'students.read', 'guardians.read', 'curriculum.read', 'lessons.read', 'lessons.manage', 'assessment.read', 'assessment.manage', 'results.read', 'results.enter', 'timetable.read', 'attendance.read', 'attendance.take', 'hr.self', 'ai.use', 'library.read', 'comms.read', 'live.read', 'live.host', 'homework.manage', 'welfare.read', 'behaviour.manage'],
  },
  {
    key: 'accountant',
    name: 'Accountant',
    description: 'Manages fees, payments and expenses.',
    permissions: ['school.read', 'academics.read', 'students.read', 'guardians.read', 'finance.read', 'finance.manage', 'timetable.read', 'hr.self', 'payroll.read', 'payroll.manage', 'ai.use', 'inventory.read', 'inventory.manage', 'transport.read', 'hostel.read', 'comms.read', 'comms.send', 'billing.manage', 'support.use', 'sponsorship.manage'],
  },
  {
    key: 'hr_manager',
    name: 'HR Manager',
    description: 'Manages staff records, leave and payroll.',
    permissions: ['school.read', 'staff.read', 'staff.manage', 'timetable.read', 'attendance.read', 'attendance.manage', 'hr.read', 'hr.manage', 'hr.self', 'leave.approve', 'payroll.read', 'payroll.manage', 'ai.use', 'documents.issue', 'comms.read', 'comms.send'],
  },
  {
    key: 'receptionist',
    name: 'Receptionist',
    description: 'Front desk: visitors, enquiries and admissions.',
    permissions: ['school.read', 'students.read', 'guardians.read', 'timetable.read', 'attendance.read', 'hr.self', 'reception.read', 'reception.manage', 'transport.read', 'hostel.read', 'staff.read', 'comms.read', 'comms.send', 'admissions.read', 'admissions.manage'],
  },
  {
    key: 'librarian',
    name: 'Librarian',
    description: 'Runs the library.',
    permissions: ['school.read', 'students.read', 'staff.read', 'timetable.read', 'hr.self', 'library.read', 'library.manage', 'comms.read'],
  },
  {
    key: 'transport_manager',
    name: 'Transport Manager',
    description: 'Runs routes and vehicles.',
    permissions: ['school.read', 'students.read', 'timetable.read', 'hr.self', 'transport.read', 'transport.manage', 'guardians.read', 'comms.read', 'comms.send'],
  },
  {
    key: 'hostel_manager',
    name: 'Hostel Manager',
    description: 'Runs boarding and hostels.',
    permissions: ['school.read', 'students.read', 'timetable.read', 'hr.self', 'hostel.read', 'hostel.manage', 'guardians.read', 'staff.read', 'comms.read', 'comms.send'],
  },
  {
    key: 'school_nurse',
    name: 'School Nurse',
    description: "Runs the sick bay and keeps students' medical details.",
    permissions: ['school.read', 'academics.read', 'students.read', 'guardians.read', 'attendance.read', 'hr.self', 'welfare.read', 'health.manage', 'comms.read', 'comms.send'],
  },
  {
    key: 'parent',
    name: 'Parent',
    description: 'Portal access to their own children only.',
    permissions: ['ai.use', 'family.manage'],
  },
  {
    key: 'student',
    name: 'Student',
    description: 'Portal access to their own learning.',
    permissions: ['ai.use', 'learning.use'],
  },
];
