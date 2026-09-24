import type { MeResponse, Permission } from '@aischool/shared';
import {
  Award,
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
  CreditCard,
  FileQuestionMark,
  FileText,
  FolderOpen,
  Gauge,
  Globe,
  GraduationCap,
  HeartHandshake,
  Layers,
  LayoutDashboard,
  Library,
  type LucideIcon,
  Megaphone,
  MessagesSquare,
  MonitorCheck,
  NotebookPen,
  Package,
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
      { label: 'Timetable', to: '/timetable', icon: CalendarClock, soon: true },
      { label: 'Homework', to: '/homework', icon: PencilLine, soon: true, keywords: 'assignments' },
      { label: 'Study Materials', to: '/materials', icon: FolderOpen, soon: true },
    ],
  },
  {
    label: 'Assessments',
    items: [
      { label: 'Question Bank', to: '/questions', icon: FileQuestionMark, soon: true },
      { label: 'Exams', to: '/exams', icon: FileText, soon: true },
      { label: 'Online Exams', to: '/online-exams', icon: MonitorCheck, soon: true, keywords: 'cbt' },
      { label: 'Results', to: '/results', icon: Trophy, soon: true, keywords: 'grades scores' },
      { label: 'Report Cards', to: '/report-cards', icon: Award, soon: true },
    ],
  },
  {
    label: 'Attendance',
    items: [{ label: 'Attendance', to: '/attendance', icon: CalendarCheck, soon: true, keywords: 'register roll call' }],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Fees', to: '/fees', icon: Receipt, soon: true, keywords: 'invoices billing' },
      { label: 'Payments', to: '/payments', icon: CreditCard, soon: true },
      { label: 'Accounting', to: '/accounting', icon: Calculator, soon: true, keywords: 'ledger' },
      { label: 'Expenses', to: '/expenses', icon: Wallet, soon: true },
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
