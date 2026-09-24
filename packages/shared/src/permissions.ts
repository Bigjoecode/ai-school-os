/**
 * The permission catalog. Every guarded API route names one of these, and
 * roles are just named sets of them — so custom roles need no code changes.
 * Keys are `<module>.<action>`.
 */
export const PERMISSION_GROUPS = [
  {
    module: 'school',
    label: 'School & Settings',
    permissions: {
      'school.read': 'View school profile and settings',
      'school.manage': 'Edit school profile, branches and settings',
    },
  },
  {
    module: 'users',
    label: 'Users & Roles',
    permissions: {
      'users.read': 'View users',
      'users.manage': 'Invite, edit and disable users',
      'roles.manage': 'Create and edit roles and permissions',
    },
  },
  {
    module: 'academics',
    label: 'Academic Setup',
    permissions: {
      'academics.read': 'View sessions, terms, classes and subjects',
      'academics.manage': 'Manage sessions, terms, classes and subjects',
    },
  },
  {
    module: 'curriculum',
    label: 'Curriculum & Schemes',
    permissions: {
      'curriculum.read': 'View curricula and schemes of work',
      'curriculum.manage': 'Create, generate, edit and publish curricula and schemes',
    },
  },
  {
    module: 'lessons',
    label: 'Lesson Plans',
    permissions: {
      'lessons.read': 'View lesson plans',
      'lessons.manage': 'Create, generate and edit lesson plans',
    },
  },
  {
    module: 'students',
    label: 'Students',
    permissions: {
      'students.read': 'View student records',
      'students.manage': 'Admit, edit and withdraw students',
    },
  },
  {
    module: 'guardians',
    label: 'Parents & Guardians',
    permissions: {
      'guardians.read': 'View parent and guardian records',
      'guardians.manage': 'Add and edit parents and guardians',
    },
  },
  {
    module: 'staff',
    label: 'Teachers & Staff',
    permissions: {
      'staff.read': 'View staff records',
      'staff.manage': 'Add and edit staff',
    },
  },
  {
    module: 'finance',
    label: 'Finance',
    permissions: {
      'finance.read': 'View fees, payments and expenses',
      'finance.manage': 'Manage fees, invoices, payments and expenses',
    },
  },
  {
    module: 'ai',
    label: 'AI',
    permissions: {
      'ai.use': 'Use the school AI assistants',
      'ai.admin': 'View AI usage and manage AI settings',
    },
  },
  {
    module: 'audit',
    label: 'Audit',
    permissions: {
      'audit.read': 'View the audit log',
    },
  },
] as const;

type Group = (typeof PERMISSION_GROUPS)[number];
export type Permission = Group extends infer G
  ? G extends { permissions: infer P }
    ? keyof P & string
    : never
  : never;

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(
  (g) => Object.keys(g.permissions) as Permission[],
);

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}
