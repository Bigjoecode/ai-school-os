import {
  Banknote,
  BookOpenCheck,
  Bot,
  Building2,
  GraduationCap,
  HeartHandshake,
  MonitorCheck,
  ShieldCheck,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * Landing page copy. Every line describes something that exists in the product today; the comment
 * on each block says where. No statistics about customers, no testimonials (see testimonials.ts),
 * no logos, no ratings, no certifications.
 */

/** Section 3: the three key features. */
export const KEY_FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    // apps/api/src/ai/agents.ts (10 assistants; "nothing is sent or published by the AI — a person reviews every draft"),
    // packages/shared/src/learning.ts (tutor voice + memory), packages/shared/src/languages.ts (5 languages).
    icon: Bot,
    title: 'AI that works for every role',
    body: 'Assistants for principals, teachers, bursars, HR and parents that answer from your school’s live records, and an AI tutor for students that remembers how each one learns.',
  },
  {
    // router.tsx /online-exams, /offline-exams (encrypted device downloads), /utme/:id; features/exams, features/cbt.
    icon: MonitorCheck,
    title: 'Exams that still run when the internet doesn’t',
    body: 'Set and mark CBT online, or download encrypted exam packs to the exam devices, sit them offline in the hall and sync the scores afterwards.',
  },
  {
    // nav: Results, Report Cards, Fees, Payments; DEFAULT_FEATURE_LISTS.standard (Paystack online payment).
    icon: Banknote,
    title: 'Results and fees, settled',
    body: 'Scores become broadsheets and report cards in your own layout, and parents pay fees online into the school’s own Paystack account with an instant receipt.',
  },
];

/** Section 4: product facts, each counted from the code. */
export const FACTS: { value: string; label: string; source: string }[] = [
  { value: '3', label: 'portals in one app: staff, parents and students', source: 'navigation.ts audience staff / family; portal feature' },
  { value: '10', label: 'AI assistants, each limited to what its user may see', source: 'packages/shared/src/schemas.ts AI_AGENTS' },
  { value: '5', label: 'languages for the AI tutor: English, Pidgin, Yoruba, Igbo and Hausa', source: 'packages/shared/src/languages.ts LANGUAGES' },
  { value: '34', label: '3D virtual science labs: 14 Physics, 10 Chemistry, 10 Biology', source: 'features/practicals/simulators/registry.ts phy-* / chem-* / bio-*' },
];

/** Section 5: how it works, from the in-app guided first week (apps/api/src/onboarding/first-week.service.ts; sales/content.ts ROLLOUT). */
export const STEPS: { title: string; body: string }[] = [
  { title: 'Set up your school', body: 'Session and terms, classes and arms, subjects. A setup checklist walks you through it, and each item ticks itself when it is done.' },
  { title: 'Bring your people in', body: 'Import students, parents and staff from a spreadsheet. Teachers get their logins and parents get portal invitations.' },
  { title: 'Teach, test and track', body: 'Registers, homework on syllabus topics, online tests and lesson check-ins feed each student’s mastery of every topic.' },
  { title: 'Report and get paid', body: 'Release results and report cards, send weekly learning updates to parents, and collect fees online.' },
];

/** Section 6: report sheets. features/report-cards (/report-cards/layout), features/results, features/result-pins, commit 611b59e. */
export const REPORT_POINTS = [
  'Lay out the report card the way your school likes it, with your logo, motto, grading scale and sections',
  'Affective and psychomotor trait ratings next to the scores',
  'AI drafts each student’s remark; the class teacher edits and approves it',
  'Broadsheets, positions and class averages worked out for you',
  'Release results to the parent portal when you are ready, or sell result checker PINs (Premium)',
];

/** Section 7: the four product areas (navigation.ts groups). */
export const AREAS: { icon: LucideIcon; title: string; body: string; items: string[] }[] = [
  {
    icon: BookOpenCheck,
    title: 'Teaching and learning',
    body: 'From the scheme of work to the classroom.',
    items: ['Curriculum and schemes of work', 'Lesson plans with vetting', 'Lesson modules and classroom mode', 'Homework and live classes', 'Class insights by topic'],
  },
  {
    icon: Target,
    title: 'Exams and assessment',
    body: 'Practice, test and grade in one place.',
    items: ['Question bank and exam papers', 'Online CBT and offline exams', 'Exam Academy: WAEC, NECO, BECE, JAMB', 'Practical Academy and practical tests', 'Results and report cards'],
  },
  {
    icon: Banknote,
    title: 'Money and people',
    body: 'The bursary and the staff room.',
    items: ['Fees, invoices and discounts', 'Online payment with Paystack', 'Expenses and accounting', 'HR, leave and awards (Premium)', 'Payroll and payslips (Premium)'],
  },
  {
    icon: Building2,
    title: 'Running the school',
    body: 'Everything around the classroom.',
    items: ['Admissions and reception', 'Attendance, gate check-in and secure pick-up', 'Timetable generator (Premium)', 'Library, inventory, transport and hostel', 'Messages, noticeboard and calendar'],
  },
];

/** Section 8: the AI section. apps/api/src/ai/agents.ts, features/ai (insights = at-risk students), learning.ts. */
export const AI_POINTS = [
  'Principal, School, Academic, Teacher, Finance, HR, Admissions and Communication assistants answer from live records, within each person’s permissions',
  'They prepare drafts (a message to parents, homework, a letter); nothing is sent or published until a person reviews it',
  'Early warnings list the students who need attention, with the reasons: attendance, results or overdue fees',
  'The student tutor explains step by step, by text or voice, and remembers strengths, struggles and goals',
  'Each school sets a monthly AI budget and can see its usage',
];

/** Section 9: the portals. navigation.ts (staff groups, School / Learning / Family groups, PLATFORM_GROUP). */
export const PORTALS: { key: string; icon: LucideIcon; who: string; title: string; points: string[] }[] = [
  {
    key: 'staff',
    icon: Users,
    who: 'Staff portal',
    title: 'Every teacher and administrator, one login',
    points: [
      'Roles and permissions decide what each person sees',
      'Registers on a phone, at a kiosk or at the gate',
      'Lesson plans, homework and marking with AI drafts to check',
      'My HR: leave requests and payslips (Premium)',
    ],
  },
  {
    key: 'parent',
    icon: HeartHandshake,
    who: 'Parent portal',
    title: 'Parents see what is happening, every week',
    points: [
      'A weekly learning update for each child: strong topics, what needs attention, one thing to try at home',
      'Attendance, results, report cards and the timetable',
      'Pay fees online and get the receipt at once',
      'Parent AI answers questions about their own children only',
    ],
  },
  {
    key: 'student',
    icon: GraduationCap,
    who: 'Student portal',
    title: 'A study companion for every student',
    points: [
      'AI tutor in five languages, with voice',
      'Exam Academy mocks for WAEC, NECO, BECE and JAMB UTME',
      'Practical Academy virtual labs, study plans and flashcards',
      'Educational games from nursery to SS 3',
    ],
  },
  {
    key: 'platform',
    icon: ShieldCheck,
    who: 'Platform console',
    title: 'Run by a team that watches the whole platform',
    points: [
      'Each school has its own private space, its own address and optionally its own website domain',
      'Plans, modules and billing managed for every school',
      'Support tickets, system health and an audit log',
      'Branches and school groups on one account',
    ],
  },
];

/** Practical Academy block (part of section 8/9 visuals). commits 8c79813…4c46d39, 1b9a9c4; registry.ts. */
export const LAB_POINTS = [
  'Walk-in 3D labs for Physics, Chemistry and Biology: titration, qualitative analysis, optics, circuits, microscopy, dissection and more',
  'Learn first, watch a demonstration, then try it yourself with guided steps and a safety briefing',
  'Teachers assign a lab as homework, or schedule it as a timed practical test that is marked and sent to the score sheet',
  'Also: a programming lab with a real BASIC interpreter, and a geography map-reading lab',
];

/** Section 13: FAQ. Each answer is backed by the code noted. */
export const FAQ: { q: string; a: string }[] = [
  {
    // features/cbt offline, pwa/session.ts (saved sign-in), router /offline-exams.
    q: 'Our internet is unreliable. Will it still work?',
    a: 'Exams can be downloaded to devices ahead of time, sat offline and synced later. The app also opens with the last saved data when the connection drops, and shows when what you see was saved.',
  },
  {
    // first-week.service.ts; pricing: setup fee includes onboarding and training days.
    q: 'How long does it take to get started?',
    a: 'A guided first week takes you from school basics to your first weekly parent update. The one-off setup fee on Standard and Premium includes onboarding and staff training.',
  },
  {
    // data-protection.ts; /settings/backup; pricing page "We never delete your data because of billing".
    q: 'Who owns our data?',
    a: 'Your school does. Under the data processing agreement the school is the controller and we are the processor. You can export your data at any time, and we never delete it because of a billing problem.',
  },
  {
    // packages/shared/src/data-protection.ts (NDPA 2023: consent, DPA, data subject requests).
    q: 'How do you handle children’s data?',
    a: 'It is built around the Nigeria Data Protection Act: parents accept the privacy notice before using the portal, the school signs a data processing agreement, and requests to see, correct or delete data are logged and tracked.',
  },
  {
    // DEFAULT_PRICING_NOTES.
    q: 'Can parents pay school fees online?',
    a: 'Yes. Parents pay by card, bank transfer or USSD through Paystack, straight into the school’s own Paystack account, and the receipt is issued immediately.',
  },
  {
    // packages/shared/src/pricing.ts (per student per term; Ultimate on request).
    q: 'How is it priced?',
    a: 'Per student per term, with a minimum number of students per plan and a one-off setup fee. Groups and large schools can ask for a quote on the Ultimate plan.',
  },
  {
    // apps/api/src/ai/agents.ts; ai.ts aiBudgetSchema.
    q: 'Does the AI send messages or change records on its own?',
    a: 'No. The assistants look things up and prepare drafts. A person reviews every message, homework or letter before it goes anywhere, and each school sets its own monthly AI budget.',
  },
];
