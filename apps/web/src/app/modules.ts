/** Roadmap copy for modules that aren't live yet. Keyed by route path. */
export interface UpcomingModule {
  name: string;
  phase: number;
  summary: string;
  features: string[];
}

export const UPCOMING_MODULES: Record<string, UpcomingModule> = {
  '/admissions': {
    name: 'Admissions',
    phase: 2,
    summary: 'A modern admissions funnel from first enquiry to first day.',
    features: [
      'Online application forms with document uploads',
      'Pipeline board: enquiry → assessment → offer → enrolled',
      'Entrance test scheduling and scoring',
      'Admissions AI drafts offer letters and follow-ups for every applicant',
    ],
  },
  '/homework': {
    name: 'Homework',
    phase: 3,
    summary: 'Set, collect and grade homework without the paper chase.',
    features: [
      'Assign to classes or individual students with due dates',
      'Online submissions with attachments',
      'Parents notified automatically',
      'AI suggests questions and pre-grades short answers',
    ],
  },
  '/materials': {
    name: 'Study Materials',
    phase: 3,
    summary: 'A tidy library of notes, slides and videos per class.',
    features: [
      'Organised by class, subject and topic',
      'Share with students and parents securely',
      'Usage analytics per resource',
      'Student AI answers questions grounded in your materials',
    ],
  },
  '/online-exams': {
    name: 'Online Exams',
    phase: 4,
    summary: 'Secure computer-based tests with instant marking.',
    features: [
      'Timed CBT with randomised questions',
      'Auto-marking for objective questions',
      'Proctoring signals and attempt logs',
      'AI marks essay answers against a rubric for teacher review',
    ],
  },
  '/fees': {
    name: 'Fees',
    phase: 7,
    summary: 'Fee structures, invoices and reminders on autopilot.',
    features: [
      'Fee items per class, term and category',
      'Discounts, scholarships and sibling rules',
      'Automated invoices and reminders',
      'Finance AI forecasts collections and flags at-risk balances',
    ],
  },
  '/payments': {
    name: 'Payments',
    phase: 7,
    summary: 'Collect fees online and reconcile automatically.',
    features: [
      'Card, bank transfer and USSD payments',
      'Automatic receipts and reconciliation',
      'Part-payments and payment plans',
      'AI matches unidentified transfers to the right student',
    ],
  },
  '/accounting': {
    name: 'Accounting',
    phase: 7,
    summary: 'Double-entry books built for schools.',
    features: [
      'Chart of accounts and journals',
      'Income statement and balance sheet',
      'Budget vs actual per term',
      'AI answers “where did our money go this term?”',
    ],
  },
  '/expenses': {
    name: 'Expenses',
    phase: 7,
    summary: 'Track spending with approvals and receipts.',
    features: [
      'Expense requests with approval chains',
      'Receipt capture and categorisation',
      'Vendor records and payment tracking',
      'AI categorises receipts and spots unusual spend',
    ],
  },
  '/library': {
    name: 'Library',
    phase: 9,
    summary: 'Catalogue, circulation and reading insights.',
    features: [
      'Catalogue with ISBN lookup',
      'Issue, return and overdue tracking',
      'Reading history per student',
      'AI recommends books by reading level and interest',
    ],
  },
  '/inventory': {
    name: 'Inventory',
    phase: 9,
    summary: 'Know what you own and where it is.',
    features: [
      'Assets, consumables and stores',
      'Stock movements and reorder levels',
      'Asset assignment to staff and rooms',
      'AI predicts reorders before you run out',
    ],
  },
  '/transport': {
    name: 'Transport',
    phase: 9,
    summary: 'Routes, vehicles and safe pick-ups.',
    features: [
      'Routes, stops and vehicle assignment',
      'Driver and maintenance records',
      'Transport fees linked to billing',
      'AI optimises routes to cut travel time',
    ],
  },
  '/hostel': {
    name: 'Hostel',
    phase: 9,
    summary: 'Boarding made orderly.',
    features: [
      'Rooms, beds and allocations',
      'Exeat and visitor logs',
      'Boarding fees linked to billing',
      'AI suggests balanced room allocations',
    ],
  },
  '/reception': {
    name: 'Reception',
    phase: 9,
    summary: 'A calm, digital front desk.',
    features: [
      'Visitor sign-in and badges',
      'Enquiry capture into Admissions',
      'Call and complaint logs',
      'AI drafts replies to parent enquiries',
    ],
  },
  '/announcements': {
    name: 'Announcements',
    phase: 10,
    summary: 'Reach the right people with the right message.',
    features: [
      'Audience targeting by class, role or branch',
      'Scheduled posts and read receipts',
      'Portal and push delivery',
      'AI writes clear, friendly announcements from bullet points',
    ],
  },
  '/messaging': {
    name: 'WhatsApp, SMS & Email',
    phase: 10,
    summary: 'Every channel, one inbox.',
    features: [
      'Bulk WhatsApp, SMS and email with templates',
      'Delivery reports and cost tracking',
      'Two-way conversations with parents',
      'Parent AI answers routine questions 24/7',
    ],
  },
  '/live': {
    name: 'Live Classes',
    phase: 11,
    summary: 'Virtual classrooms built into the timetable.',
    features: [
      'One-click live sessions from the timetable',
      'Attendance captured automatically',
      'Recordings shared with the class',
      'AI summarises every lesson into notes',
    ],
  },
  '/ai/usage': {
    name: 'AI Usage',
    phase: 12,
    summary: 'Transparent AI spend and adoption.',
    features: [
      'Usage by agent, user and month',
      'Budgets and alerts',
      'Provider and model breakdown',
      'AI recommends where assistants save the most time',
    ],
  },
  '/website': {
    name: 'Website',
    phase: 13,
    summary: 'A stunning public website that runs itself.',
    features: [
      'Templates in your brand colours',
      'News, events and gallery synced from the OS',
      'Online admission forms built in',
      'AI writes pages and news posts in your school’s voice',
    ],
  },
};
