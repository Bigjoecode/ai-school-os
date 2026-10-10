import {
  BookOpenCheck,
  Briefcase,
  CalendarCheck,
  ClipboardList,
  FileBarChart,
  Gamepad2,
  GraduationCap,
  HeartHandshake,
  Languages,
  LayoutDashboard,
  MessageCircle,
  School,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * Everything here describes features that exist in the product today (see the git history and
 * apps/web/src/features). No statistics, testimonials, logos or awards: we have none to quote yet.
 */

export const PROBLEMS: { icon: LucideIcon; title: string; body: string; answer: string }[] = [
  {
    icon: ClipboardList,
    title: 'Teachers buried in paperwork',
    body: 'Lesson notes, marking, report-card remarks and registers take evenings and weekends that should go to teaching.',
    answer: 'AI drafts lesson notes, homework and remarks for the teacher to check; online tests mark themselves; registers take a tap.',
  },
  {
    icon: Users,
    title: 'Parents in the dark until results day',
    body: 'Most parents hear how their child is doing once a term, when it is too late to help.',
    answer: 'A short weekly update for each child: strong topics, improving topics, what needs attention and one thing to do at home.',
  },
  {
    icon: GraduationCap,
    title: 'Students unready for WAEC, BECE and JAMB',
    body: 'Few schools have enough computers, steady internet or practice material for computer-based exams.',
    answer: 'Practice on the official syllabi, offline CBT exam packs for the hall, and an AI tutor that explains in five languages.',
  },
];

export const AUDIENCES: { key: string; icon: LucideIcon; who: string; points: string[] }[] = [
  {
    key: 'proprietor',
    icon: Briefcase,
    who: 'Proprietors',
    points: [
      'Fees, invoices and receipts, with parents paying online through Paystack',
      'Sibling, staff-child and scholarship discounts applied automatically',
      'HR and payroll, admissions and a school website you can edit yourself',
      'School success dashboard and a printable term impact report',
    ],
  },
  {
    key: 'principal',
    icon: School,
    who: 'Principals',
    points: [
      'Attendance, timetable, results and report cards in one place',
      'Class insights: the hardest topics in each class and who needs support',
      'Lesson-note vetting and a weekly workbook from the scheme of work',
      'A guided first week so the whole school is running within days',
    ],
  },
  {
    key: 'teacher',
    icon: BookOpenCheck,
    who: 'Teachers',
    points: [
      'AI drafts of lesson notes, homework and report remarks to review and edit',
      'Lesson modules with classroom check-ins: re-teach or move on with evidence',
      'Online tests that mark themselves; AI marking suggestions for homework',
      'Registers taken on a phone or at a check-in kiosk',
    ],
  },
  {
    key: 'parent',
    icon: HeartHandshake,
    who: 'Parents',
    points: [
      'A weekly learning update for each child, in app, by push or email',
      'Attendance, results, report cards and fees on the phone',
      'Pay fees online and get the receipt immediately',
      'Ask the school on WhatsApp: the assistant answers about their own children only',
    ],
  },
  {
    key: 'student',
    icon: GraduationCap,
    who: 'Students',
    points: [
      'Exam Academy practice on WAEC, NECO BECE and JAMB UTME syllabi',
      'AI tutor in English, Pidgin, Yoruba, Igbo and Hausa, with voice',
      'EduGames from nursery to SS 3, with a gentle young mode for little ones',
      'Careers guidance with the JAMB brochure (IBASS) course requirements',
    ],
  },
];

export const HIGHLIGHTS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Languages, title: 'Nigerian languages', body: 'Tutor, careers counsellor, parent assistant and weekly updates in English, Pidgin, Yoruba, Igbo and Hausa.' },
  { icon: Gamepad2, title: 'EduGames', body: 'Curriculum games for every stage, nursery to SS 3, tagged by school year.' },
  { icon: MessageCircle, title: 'WhatsApp parent assistant', body: "Parents ask on WhatsApp; answers use only their own children's records, after consent." },
  { icon: Wallet, title: 'Fees with Paystack', body: 'Invoices, discounts, online payment and receipts.' },
  { icon: FileBarChart, title: 'Report cards', body: 'Your own layouts, trait ratings and AI-drafted remarks for teachers to approve.' },
  { icon: CalendarCheck, title: 'Attendance and timetable', body: 'Registers, kiosk check-in and a timetable builder.' },
  { icon: LayoutDashboard, title: 'Success dashboard', body: 'Adoption, learning and parent engagement each week, plus a term impact report to print.' },
  { icon: ShieldCheck, title: 'NDPA data protection', body: 'Parental consent, privacy notice, data processing agreement and data export tools.' },
];

/** The in-app guided first week (apps/api/src/onboarding/first-week.service.ts): each goal ticks itself when the work is done. */
export const ROLLOUT = [
  { when: 'Day 1', title: 'School basics', what: 'Session and terms, classes and arms, subjects linked to classes.' },
  { when: 'Day 2', title: 'Bring in your people', what: 'Students imported, parents on record, teacher logins, parent portal invitations.' },
  { when: 'Day 3', title: 'Teachers in', what: 'Teachers sign in and take the first attendance registers.' },
  { when: 'Day 4', title: 'First learning activity', what: 'Homework on a syllabus topic and an online test for one class.' },
  { when: 'Day 5', title: 'Parents in', what: 'Parents sign in; weekly update on; term fees set up; Paystack connected.' },
  { when: 'Day 6', title: 'The learning loop', what: 'Work marked into mastery, class insights opened, first weekly update sent.' },
  { when: 'Day 7', title: 'Review your week', what: 'The week reviewed on the success dashboard.' },
];
