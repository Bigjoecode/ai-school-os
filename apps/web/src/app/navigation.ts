import type { MeResponse, Permission } from '@aischool/shared';
import {
  Award,
  Banknote,
  BedDouble,
  BookOpen,
  Bot,
  Briefcase,
  Building2,
  Bus,
  Calculator,
  CalendarCheck,
  CalendarClock,
  ConciergeBell,
  Contact,
  CreditCard,
  FileQuestionMark,
  FileText,
  FolderOpen,
  Gauge,
  Globe,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  IdCard,
  Layers,
  LayoutDashboard,
  Library,
  type LucideIcon,
  Medal,
  Megaphone,
  MessagesSquare,
  MonitorCheck,
  NotebookPen,
  Package,
  Plane,
  PencilLine,
  Presentation,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCog,
  UserPlus,
  Users,
  Video,
  Wallet,
} from 'lucide-react';
import { hasPermission } from '@/lib/auth-store';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Module not built yet — renders the Coming Soon page. */
  soon?: boolean;
  keywords?: string;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Overview', to: '/', icon: LayoutDashboard, keywords: 'dashboard home' },
      { label: 'AI Command Center', to: '/ai', icon: Sparkles, permission: 'ai.use', keywords: 'assistant chat' },
      { label: 'My HR', to: '/me/hr', icon: IdCard, permission: 'hr.self', keywords: 'my leave request payslips awards self service holiday' },
    ],
  },
  {
    label: 'Academics',
    items: [
      { label: 'Students', to: '/students', icon: GraduationCap, permission: 'students.read', keywords: 'pupils learners' },
      { label: 'Admissions', to: '/admissions', icon: UserPlus, soon: true, keywords: 'enquiries applicants' },
      { label: 'Academic Setup', to: '/academics', icon: Layers, permission: 'academics.read', keywords: 'sessions terms classes subjects branches' },
      { label: 'Curriculum', to: '/curriculum', icon: BookOpen, permission: 'curriculum.read', keywords: 'syllabus topics' },
      { label: 'Scheme of Work', to: '/schemes', icon: NotebookPen, permission: 'curriculum.read', keywords: 'schemes termly weekly plan' },
      { label: 'Lesson Plans', to: '/lessons', icon: Presentation, permission: 'lessons.read', keywords: 'lesson notes teaching' },
      { label: 'Timetable', to: '/timetable', icon: CalendarClock, permission: 'timetable.read', keywords: 'schedule periods rooms bell lessons' },
      { label: 'Homework', to: '/homework', icon: PencilLine, soon: true, keywords: 'assignments' },
      { label: 'Study Materials', to: '/materials', icon: FolderOpen, soon: true },
    ],
  },
  {
    label: 'Assessments',
    items: [
      { label: 'Question Bank', to: '/questions', icon: FileQuestionMark, permission: 'assessment.read', keywords: 'questions items objective theory' },
      { label: 'Exams', to: '/exams', icon: FileText, permission: 'assessment.read', keywords: 'exam papers tests' },
      { label: 'Online Exams', to: '/online-exams', icon: MonitorCheck, soon: true, keywords: 'cbt' },
      { label: 'Results', to: '/results', icon: Trophy, permission: 'results.read', keywords: 'grades scores marks broadsheet analysis' },
      { label: 'Report Cards', to: '/report-cards', icon: Award, permission: 'results.read', keywords: 'reports remarks terminal' },
    ],
  },
  {
    label: 'Attendance',
    items: [
      {
        label: 'Attendance',
        to: '/attendance',
        icon: CalendarCheck,
        permission: 'attendance.read',
        keywords: 'register roll call absent late present absence kiosk check in staff',
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Fees', to: '/fees', icon: Receipt, permission: 'finance.read', keywords: 'invoices billing fee schedule collections debtors paystack' },
      { label: 'Payments', to: '/payments', icon: CreditCard, permission: 'finance.read', keywords: 'receipts collections cash transfer pos' },
      { label: 'Accounting', to: '/accounting', icon: Calculator, permission: 'finance.read', keywords: 'income expenditure cash flow net' },
      { label: 'Expenses', to: '/expenses', icon: Wallet, permission: 'finance.read', keywords: 'spending costs diesel salaries' },
    ],
  },
  {
    label: 'HR',
    items: [
      { label: 'HR Overview', to: '/hr', icon: HeartPulse, permission: 'hr.read', keywords: 'human resources people staff headcount' },
      { label: 'Employees', to: '/hr/employees', icon: Contact, permission: 'hr.read', keywords: 'staff directory departments records hr' },
      { label: 'Leave', to: '/hr/leave', icon: Plane, permission: 'hr.read', keywords: 'leave requests holiday sick maternity approve away' },
      { label: 'Awards', to: '/hr/awards', icon: Medal, permission: 'hr.read', keywords: 'recognition award citation teacher of the term' },
      { label: 'Payroll', to: '/payroll', icon: Banknote, permission: 'payroll.read', keywords: 'salaries payslips paye pension nhf wages' },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Parents', to: '/parents', icon: Users, permission: 'guardians.read', keywords: 'guardians' },
      { label: 'Teachers & Staff', to: '/staff', icon: Briefcase, permission: 'staff.read', keywords: 'employees hr' },
      { label: 'Users & Roles', to: '/settings/users', icon: UserCog, permission: 'users.read', keywords: 'accounts invite' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Library', to: '/library', icon: Library, soon: true, keywords: 'books' },
      { label: 'Inventory', to: '/inventory', icon: Package, soon: true, keywords: 'stock assets' },
      { label: 'Transport', to: '/transport', icon: Bus, soon: true, keywords: 'routes buses' },
      { label: 'Hostel', to: '/hostel', icon: BedDouble, soon: true, keywords: 'boarding' },
      { label: 'Reception', to: '/reception', icon: ConciergeBell, soon: true, keywords: 'visitors front desk' },
    ],
  },
  {
    label: 'Live Learning',
    items: [{ label: 'Live Classes', to: '/live', icon: Video, soon: true, keywords: 'video virtual' }],
  },
  {
    label: 'Communication',
    items: [
      { label: 'Announcements', to: '/announcements', icon: Megaphone, soon: true },
      { label: 'WhatsApp / SMS / Email', to: '/messaging', icon: MessagesSquare, soon: true, keywords: 'messaging bulk' },
    ],
  },
  {
    label: 'AI',
    items: [
      { label: 'School AI', to: '/ai?agent=school', icon: Bot, permission: 'ai.use' },
      { label: 'Teacher AI', to: '/ai?agent=teacher', icon: Presentation, permission: 'ai.use' },
      { label: 'Parent AI', to: '/ai?agent=parent', icon: HeartHandshake, permission: 'ai.use' },
      { label: 'Student AI', to: '/ai?agent=student', icon: GraduationCap, permission: 'ai.use' },
      { label: 'HR AI', to: '/ai?agent=hr', icon: Contact, permission: 'ai.use' },
      { label: 'AI Usage', to: '/ai/usage', icon: Gauge, permission: 'ai.use', soon: true, keywords: 'tokens spend budget' },
    ],
  },
  {
    label: 'Website',
    items: [{ label: 'Website', to: '/website', icon: Globe, soon: true, keywords: 'cms public site' }],
  },
  {
    label: 'Settings',
    items: [
      { label: 'School Profile', to: '/settings', icon: Settings, permission: 'school.read', keywords: 'branding' },
      { label: 'Roles & Permissions', to: '/settings/roles', icon: ShieldCheck, permission: 'roles.manage' },
      { label: 'Audit Log', to: '/settings/audit', icon: ScrollText, permission: 'audit.read', keywords: 'history activity' },
    ],
  },
];

export const PLATFORM_GROUP: NavGroup = {
  label: 'Platform',
  items: [{ label: 'Schools', to: '/platform/tenants', icon: Building2, keywords: 'tenants' }],
};

/** Nav groups filtered to what this user may see. */
export function visibleNav(me: MeResponse | null): NavGroup[] {
  const hasTenant = !!me?.tenant;
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (!hasTenant && i.to !== '/') return false;
      return !i.permission || hasPermission(me, i.permission);
    }),
  })).filter((g) => g.items.length > 0);
  if (me?.user.platformRole === 'SUPER_ADMIN') groups.push(PLATFORM_GROUP);
  return groups;
}

export function allNavItems(): (NavItem & { group?: string })[] {
  return [...NAV_GROUPS, PLATFORM_GROUP].flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
}

/** Find the nav entry that best matches a path (longest prefix wins). */
export function matchNav(pathname: string, search = ''): (NavItem & { group?: string }) | undefined {
  const items = allNavItems();
  if (pathname === '/ai') {
    const agent = new URLSearchParams(search).get('agent');
    const exact = items.find((i) => i.to === `/ai?agent=${agent}`);
    if (exact) return exact;
  }
  let best: (NavItem & { group?: string }) | undefined;
  for (const item of items) {
    const path = item.to.split('?')[0];
    if (item.to.includes('?')) continue;
    if (path === pathname || (path !== '/' && pathname.startsWith(`${path}/`))) {
      if (!best || path.length > best.to.length) best = item;
    }
  }
  return best;
}
