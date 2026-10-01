import type { AgentInfo, AiAgent, MeResponse, Permission } from '@aischool/shared';
import {
  AlertTriangle,
  BookOpenCheck,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Contact,
  Crown,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  type LucideIcon,
  MessageSquareText,
  MessagesSquare,
  Package,
  PencilLine,
  Presentation,
  Receipt,
  Search,
  Send,
  Trophy,
  UserPlus,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { hasPermission } from '@/lib/auth-store';

/** Icons and fallback copy. Which assistants a user may open comes from GET /ai/agents. */
export const AGENT_META: Record<AiAgent, { label: string; icon: LucideIcon; blurb: string; suggestions: string[]; gate: Permission[] }> = {
  principal: {
    label: 'Principal AI',
    icon: Crown,
    blurb: 'The whole school at a glance — learning, attendance, fees, staff and operations.',
    suggestions: ['How is the school doing this week?', 'Which students need attention?', 'What should I raise at the staff meeting?'],
    gate: ['school.read', 'results.read', 'finance.read'],
  },
  school: {
    label: 'School AI',
    icon: Building2,
    blurb: 'Your school-wide analyst for leaders and admins.',
    suggestions: ['Which classes are nearly full?', 'Summarise enrolment this term', 'Which students have no guardian on record?'],
    gate: ['school.read'],
  },
  academic: {
    label: 'Academic AI',
    icon: BookOpenCheck,
    blurb: 'Curriculum coverage, results and how each class is learning.',
    suggestions: ['Which subjects are weakest this term?', 'Compare JSS 2 results across arms', 'Where are we behind on the scheme of work?'],
    gate: ['curriculum.read', 'results.read'],
  },
  teacher: {
    label: 'Teacher AI',
    icon: Presentation,
    blurb: 'Lesson plans, questions and feedback in seconds.',
    suggestions: [
      'Draft a 40-minute lesson plan on photosynthesis for JSS 2',
      'Write 10 multiple-choice questions on fractions',
      'Suggest ways to support a struggling reader',
    ],
    gate: ['academics.read'],
  },
  parent: {
    label: 'Parent AI',
    icon: HeartHandshake,
    blurb: 'Friendly answers about your children’s school life.',
    suggestions: ['How is my child doing this term?', 'What homework is due this week?', 'When does the term end?'],
    gate: [],
  },
  student: {
    label: 'Student AI',
    icon: GraduationCap,
    blurb: 'A patient study buddy that explains step by step.',
    suggestions: ['Explain quadratic equations with an example', 'Quiz me on the water cycle', 'Help me plan a revision timetable'],
    gate: [],
  },
  finance: {
    label: 'Finance AI',
    icon: Wallet,
    blurb: 'Collections, debtors and financial summaries.',
    suggestions: ['How are fee collections this term?', 'Draft a fee reminder message', 'Which classes owe the most?'],
    gate: ['finance.read'],
  },
  hr: {
    label: 'HR AI',
    icon: Contact,
    blurb: 'Leave, punctuality, appraisals and staff letters.',
    suggestions: ['Who is on leave this month?', 'Draft a staff appraisal template', 'Summarise punctuality this month'],
    gate: ['hr.read'],
  },
  admissions: {
    label: 'Admissions AI',
    icon: UserPlus,
    blurb: 'Enquiries, offer letters and follow-ups.',
    suggestions: ['Draft an admission offer letter', 'Write a reply to an enquiry about fees', 'Create an entrance test checklist'],
    gate: ['students.read'],
  },
  communication: {
    label: 'Communication AI',
    icon: Send,
    blurb: 'Messages and announcements that sound like your school.',
    suggestions: ['Draft a reminder about the PTA meeting', 'Write a message to JSS 1 parents about mid-term', 'Summarise this week’s messages'],
    gate: ['comms.send'],
  },
};

/** Used only if GET /ai/agents fails: an approximation from the user's own permissions. */
export function fallbackAgents(me: MeResponse | null): AgentInfo[] {
  return (Object.keys(AGENT_META) as AiAgent[])
    .filter((a) => AGENT_META[a].gate.every((p) => hasPermission(me, p)))
    .map((a) => ({ agent: a, label: AGENT_META[a].label, description: AGENT_META[a].blurb, capabilities: [], suggestions: AGENT_META[a].suggestions }));
}

export const TOOL_ICON: Record<string, LucideIcon> = {
  school_overview: Building2,
  find_students: Search,
  student_profile: UserRound,
  class_overview: Users,
  attendance_report: CalendarCheck,
  results_overview: Trophy,
  fees_overview: Receipt,
  staff_directory: Contact,
  hr_overview: HeartPulse,
  timetable: CalendarClock,
  calendar: CalendarDays,
  operations_overview: Package,
  at_risk_students: AlertTriangle,
  recent_messages: MessagesSquare,
  my_children: HeartHandshake,
  my_learning: BookOpenCheck,
  draft_message: MessageSquareText,
  draft_homework: PencilLine,
};

/** "Draft messages" and friends are things it prepares; everything else it looks up. */
export function splitCapabilities(capabilities: string[]) {
  const prepares = capabilities.filter((c) => /^draft\b/i.test(c));
  return { looksUp: capabilities.filter((c) => !prepares.includes(c)), prepares };
}

/** The steps shown while a reply is on its way; tool calls only arrive with the reply. */
export function pendingSteps(capabilities: string[]): string[] {
  const { looksUp } = splitCapabilities(capabilities);
  const lower = (s: string) => (s.startsWith('Your') ? s.charAt(0).toLowerCase() + s.slice(1) : s.toLowerCase());
  return [
    'Reading your question…',
    ...looksUp.slice(0, 5).map((c) => `Looking up ${lower(c)}…`),
    'Putting it together…',
    'Writing a reply…',
  ];
}
