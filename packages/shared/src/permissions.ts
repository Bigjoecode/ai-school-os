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
    module: 'assessment',
    label: 'Question Bank & Exams',
    permissions: {
      'assessment.read': 'View the question bank and exam papers',
      'assessment.manage': 'Write, generate and approve questions; build exam papers',
    },
  },
  {
    module: 'results',
    label: 'Results & Report Cards',
    permissions: {
      'results.read': 'View results, broadsheets and report cards',
      'results.enter': 'Enter scores for the subjects you teach',
      'results.publish': 'Enter any score, write principal remarks and publish report cards',
    },
  },
  {
    module: 'timetable',
    label: 'Timetable',
    permissions: {
      'timetable.read': 'View timetables',
      'timetable.manage': 'Set up, generate, edit and publish timetables',
    },
  },
  {
    module: 'attendance',
    label: 'Attendance',
    permissions: {
      'attendance.read': 'View attendance registers and reports',
      'attendance.take': "Take the daily register for the classes you lead",
      'attendance.manage': "Take or correct any register, manage staff attendance and the check-in kiosk",
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
    module: 'hr',
    label: 'HR & Leave',
    permissions: {
      'hr.read': 'View employee records, departments, leave and awards',
      'hr.manage': 'Edit employee records and departments, manage leave types and give awards',
      'hr.self': 'Request your own leave and view your own payslips',
      'leave.approve': 'Approve or decline leave requests',
    },
  },
  {
    module: 'payroll',
    label: 'Payroll',
    permissions: {
      'payroll.read': 'View salaries, pay details, payroll runs and payslips',
      'payroll.manage': 'Set salaries and pay details, prepare payroll and mark it paid',
      'payroll.approve': 'Approve a prepared payroll for payment',
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
    module: 'library',
    label: 'Library',
    permissions: {
      'library.read': 'Browse the library catalogue and loans',
      'library.manage': 'Manage books, issue and return loans, and fines',
    },
  },
  {
    module: 'inventory',
    label: 'Inventory & Assets',
    permissions: {
      'inventory.read': 'View stock, assets and movements',
      'inventory.manage': 'Add items, receive and issue stock, and count stock',
    },
  },
  {
    module: 'transport',
    label: 'Transport',
    permissions: {
      'transport.read': 'View vehicles, routes and riders',
      'transport.manage': 'Manage vehicles and routes, and assign riders',
    },
  },
  {
    module: 'hostel',
    label: 'Hostel',
    permissions: {
      'hostel.read': 'View hostels, rooms, boarders and exeats',
      'hostel.manage': 'Manage hostels and rooms, allocate beds and sign exeats',
    },
  },
  {
    module: 'reception',
    label: 'Reception',
    permissions: {
      'reception.read': 'View the visitor book, enquiries and pick-ups',
      'reception.manage': 'Sign visitors in and out, log enquiries and early pick-ups',
    },
  },
  {
    module: 'documents',
    label: 'Certificates & ID Cards',
    permissions: {
      'documents.issue': 'Issue certificates and testimonials, and print ID cards',
    },
  },
  {
    module: 'live',
    label: 'Live Classes & Homework',
    permissions: {
      'live.read': 'View the live class schedule, attendance, recordings and class summaries',
      'live.host': 'Schedule and host live classes for the classes you teach',
      'live.manage': "Schedule any live class and connect Google Meet, Zoom or BigBlueButton",
      'homework.manage': 'Set and publish homework',
    },
  },
  {
    module: 'comms',
    label: 'Communication',
    permissions: {
      'comms.read': 'View sent messages and delivery reports',
      'comms.send': 'Send messages to parents and staff by email, SMS, WhatsApp and app',
      'comms.manage': 'Set up email, SMS and WhatsApp, and automations like birthday messages',
      'announcements.manage': 'Post and edit announcements',
      'events.manage': 'Add and edit events on the school calendar',
    },
  },
  {
    module: 'website',
    label: 'School Website',
    permissions: {
      'website.manage': 'Edit the school website, publish news, photos and downloads, read website messages and issue result codes',
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
    module: 'billing',
    label: 'Subscription & Support',
    permissions: {
      'billing.manage': "View and pay the school's AI School OS subscription",
      'support.use': 'Contact AI School OS support and follow tickets',
    },
  },
  {
    module: 'learning',
    label: 'Student AI & Exam Academy',
    permissions: {
      'learning.use': 'Use the AI learning companion and Exam Academy as a student',
      'family.manage': 'Manage AI and exam subscriptions for your own children',
      'sponsorship.manage': 'Sponsor AI or exam preparation for classes (billed to the school)',
      'knowledge.manage': "Upload and manage the school's knowledge base documents",
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
