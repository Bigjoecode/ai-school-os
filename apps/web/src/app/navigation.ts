import type { MeResponse, Permission, PlatformArea } from '@aischool/shared';
import {
  Activity,
  Award,
  Banknote,
  BedDouble,
  BookOpen,
  BookOpenCheck,
  Bot,
  Boxes,
  Briefcase,
  Building2,
  Bus,
  Calculator,
  ChartColumnStacked,
  CircleDollarSign,
  Cpu,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ConciergeBell,
  Contact,
  Crown,
  CreditCard,
  DatabaseBackup,
  FileBadge,
  FileQuestionMark,
  FileText,
  Flag,
  FolderOpen,
  Gauge,
  GitBranch,
  Globe,
  Globe2,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  HandCoins,
  Home,
  IdCard,
  IdCardLanyard,
  Landmark,
  Layers,
  LayoutGrid,
  LayoutDashboard,
  Library,
  LibraryBig,
  LifeBuoy,
  type LucideIcon,
  Medal,
  Megaphone,
  MessagesSquare,
  MonitorCheck,
  NotebookPen,
  Package,
  PackageOpen,
  Plane,
  PencilLine,
  Presentation,
  Radar,
  Receipt,
  ScrollText,
  ScanSearch,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCog,
  UserPlus,
  Users,
  Users2,
  Video,
  ClipboardList,
  NotebookText,
  Wallet,
} from 'lucide-react';
import { Backpack, ClipboardCheck, CalendarCheck2, FileUp, FolderDown, GalleryVerticalEnd, Rocket, House, MessageCircleQuestion, School, Target, TrendingUp } from 'lucide-react';
import { Stethoscope } from 'lucide-react';
import { WifiOff } from 'lucide-react';
import { BookMarked, NotebookTabs } from 'lucide-react';
import { BookUser, Compass, Shield } from 'lucide-react';
import { Gamepad2 } from 'lucide-react';
import { canOpenArea, hasFeature, hasPermission } from '@/lib/auth-store';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Every one of these is also needed (mirrors API gates that check several permissions). */
  requires?: Permission[];
  /** Shown when the user holds every permission of at least one of these sets. */
  anyOf?: Permission[][];
  /** A live indicator rendered beside the label (e.g. setup progress). */
  badge?: 'setup';
  /** Module not built yet — renders the Coming Soon page. */
  soon?: boolean;
  /** 'family': only for parents and students (members without school.read), keeping staff navs tidy. */
  audience?: 'family';
  /** Module or beta flag the school's plan must include (me.features). */
  feature?: string;
  /** Platform console area (PLATFORM_AREAS) the operator's role must allow. */
  area?: PlatformArea;
  /** Platform console page only the super admin may open. */
  superAdmin?: boolean;
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
      { label: 'School success', to: '/success', icon: TrendingUp, permission: 'results.publish', requires: ['school.read'], keywords: 'impact health score adoption outcomes renewal pta proprietor report value time saved' },
      { label: 'Setup', to: '/setup', icon: Rocket, permission: 'academics.manage', badge: 'setup', keywords: 'onboarding getting started checklist new school year terms classes subjects' },
      {
        label: 'Import data',
        to: '/import',
        icon: FileUp,
        anyOf: [['students.manage', 'guardians.manage'], ['staff.manage'], ['results.enter', 'results.publish']],
        keywords: 'csv excel spreadsheet upload bulk students parents staff results migrate',
      },
      // Students have the AI tutor instead; parents and staff use the agents here.
      { label: 'AI Command Center', to: '/ai', icon: Sparkles, feature: 'ai', permission: 'ai.use', anyOf: [['school.read'], ['family.manage']], keywords: 'assistant chat' },
      { label: 'Homework', to: '/learning/homework', icon: ClipboardList, feature: 'live_classes', audience: 'family', keywords: 'assignments projects hand in submit marks feedback' },
      { label: 'Live classes', to: '/learning/live', icon: Video, feature: 'live_classes', audience: 'family', keywords: 'online class join zoom meet lesson' },
      { label: 'Class notes', to: '/learning/notes', icon: NotebookText, feature: 'live_classes', audience: 'family', keywords: 'summaries revision notes lessons' },
      { label: 'Study materials', to: '/learning/materials', icon: FolderOpen, anyOf: [['family.manage'], ['learning.use']], audience: 'family', keywords: 'notes slides videos documents library revision textbook' },
      { label: 'Ask the school', to: '/ask', icon: School, permission: 'ai.use', audience: 'family', keywords: 'questions policies term dates fees knowledge' },
      { label: 'My HR', to: '/me/hr', icon: IdCard, permission: 'hr.self', keywords: 'my leave request payslips awards self service holiday' },
    ],
  },
  // The family portal: a child's attendance, results, fees (parents), exams and the school's documents (parents and students only).
  {
    label: 'School',
    items: [
      { label: 'My school', to: '/school', icon: Backpack, anyOf: [['family.manage'], ['learning.use']], audience: 'family', keywords: 'portal child children overview summary fees owed' },
      { label: 'Learning updates', to: '/school/learning', icon: Sparkles, anyOf: [['family.manage'], ['learning.use']], audience: 'family', keywords: 'weekly update how my child is learning progress topics strong improving attention' },
      { label: 'Attendance', to: '/school/attendance', icon: CalendarCheck, anyOf: [['family.manage'], ['learning.use']], audience: 'family', keywords: 'present absent late register days' },
      { label: 'Results', to: '/school/results', icon: Trophy, anyOf: [['family.manage'], ['learning.use']], audience: 'family', keywords: 'report card grades position average term result' },
      { label: 'Fees', to: '/school/fees', icon: Banknote, permission: 'family.manage', audience: 'family', keywords: 'school fees pay online paystack balance owed invoice receipt bank transfer' },
      { label: 'Exams & calendar', to: '/school/calendar', icon: CalendarDays, anyOf: [['family.manage'], ['learning.use']], audience: 'family', keywords: 'exam timetable test holidays events term dates' },
      { label: 'Downloads', to: '/school/downloads', icon: FolderDown, anyOf: [['family.manage'], ['learning.use']], audience: 'family', keywords: 'documents forms newsletter booklist timetable pdf' },
      { label: 'Behaviour & health', to: '/school/welfare', icon: HeartPulse, anyOf: [['family.manage'], ['learning.use']], audience: 'family', keywords: 'merits demerits conduct discipline sick bay clinic nurse medical allergies genotype' },
      { label: 'Careers', to: '/school/careers', icon: Compass, permission: 'family.manage', audience: 'family', keywords: 'child career plan interests track university course jamb' },
    ],
  },
  // Phase 15: the student's learning companion and the parent's family page (permissions keep staff navs clean).
  {
    label: 'Learning',
    items: [
      { label: 'Learn', to: '/learn', icon: House, permission: 'learning.use', audience: 'family', keywords: 'study home today ai learning' },
      { label: 'Games', to: '/games', icon: Gamepad2, permission: 'learning.use', audience: 'family', keywords: 'play fun quiz rush maths sprint spelling bee word scramble match up true false daily challenge streak xp badges leaderboard' },
      { label: 'My lessons', to: '/my-lessons', icon: BookMarked, permission: 'learning.use', audience: 'family', keywords: 'lesson modules check-in class code join video quiz notes offline' },
      { label: 'Exams', to: '/my-exams', icon: MonitorCheck, permission: 'learning.use', audience: 'family', keywords: 'cbt online exam test computer based school exam' },
      { label: 'Offline exams', to: '/offline-exams', icon: WifiOff, permission: 'learning.use', audience: 'family', keywords: 'cbt offline exam download no internet sync' },
      { label: 'AI tutor', to: '/learn/tutor', icon: MessageCircleQuestion, permission: 'learning.use', audience: 'family', keywords: 'tutor homework help ask explain' },
      { label: 'Exam Academy', to: '/learn/exams', icon: Target, permission: 'learning.use', audience: 'family', keywords: 'bece waec neco jamb past questions mock practice' },
      { label: 'Progress', to: '/learn/progress', icon: TrendingUp, permission: 'learning.use', audience: 'family', keywords: 'mastery topics memories strengths' },
      { label: 'Study plans', to: '/learn/plans', icon: CalendarCheck2, permission: 'learning.use', audience: 'family', keywords: 'revision timetable plan goals' },
      { label: 'Flashcards', to: '/learn/flashcards', icon: GalleryVerticalEnd, permission: 'learning.use', audience: 'family', keywords: 'cards review memorise' },
      { label: 'Careers', to: '/careers', icon: Compass, permission: 'learning.use', audience: 'family', keywords: 'career job future university course jamb track science arts commercial technical interest quiz counsellor' },
    ],
  },
  {
    label: 'Family',
    items: [
      { label: 'My family', to: '/family', icon: Users2, permission: 'family.manage', audience: 'family', keywords: 'children subscriptions ai plus exam prep buy payments progress' },
    ],
  },
  {
    label: 'Academics',
    items: [
      { label: 'Students', to: '/students', icon: GraduationCap, permission: 'students.read', keywords: 'pupils learners' },
      { label: 'Admissions', to: '/admissions', icon: UserPlus, permission: 'admissions.read', keywords: 'applications applicants entrance exam interview offer enrol new intake' },
      { label: 'Academic Setup', to: '/academics', icon: Layers, permission: 'academics.read', keywords: 'sessions terms classes subjects branches' },
      { label: 'End of session', to: '/academics/promotion', icon: TrendingUp, permission: 'academics.manage', keywords: 'promotion promote repeat graduate new session rollover next class year end' },
      { label: 'Curriculum', to: '/curriculum', icon: BookOpen, permission: 'curriculum.read', keywords: 'syllabus topics' },
      { label: 'Scheme of Work', to: '/schemes', icon: NotebookPen, permission: 'curriculum.read', keywords: 'schemes termly weekly plan' },
      { label: 'Lesson Plans', to: '/lessons', icon: Presentation, permission: 'lessons.read', keywords: 'lesson notes teaching' },
      { label: 'Weekly workbook', to: '/workbook', icon: NotebookTabs, anyOf: [['lessons.manage'], ['homework.manage'], ['academics.manage'], ['curriculum.manage']], keywords: 'teacher workbook week topic lesson classroom projector teach check-in' },
      { label: 'Lesson modules', to: '/modules', icon: BookMarked, anyOf: [['lessons.manage'], ['homework.manage'], ['academics.manage'], ['curriculum.manage'], ['results.publish'], ['lessons.approve']], keywords: 'modules check-ins video quiz classroom mode content library shared multimedia' },
      { label: 'Lesson vetting', to: '/lessons/vetting', icon: ClipboardCheck, permission: 'lessons.approve', keywords: 'vet approve lesson notes hod principal submissions compliance' },
      { label: 'Class insights', to: '/class-insights', icon: LayoutGrid, anyOf: [['academics.read'], ['homework.manage']], keywords: 'mastery heatmap topics struggling weak students remedial re-teach practice support group learning loop' },
      { label: 'Timetable', to: '/timetable', icon: CalendarClock, feature: 'timetable', permission: 'timetable.read', keywords: 'schedule periods rooms bell lessons' },
      { label: 'Study Materials', to: '/materials', icon: FolderOpen, anyOf: [['homework.manage'], ['curriculum.manage'], ['academics.manage']], keywords: 'notes slides videos documents resources library youtube revision' },
    ],
  },
  {
    label: 'Assessments',
    items: [
      { label: 'Question Bank', to: '/questions', icon: FileQuestionMark, permission: 'assessment.read', keywords: 'questions items objective theory' },
      { label: 'Exams', to: '/exams', icon: FileText, permission: 'assessment.read', keywords: 'exam papers tests' },
      { label: 'Online Exams', to: '/online-exams', icon: MonitorCheck, permission: 'assessment.read', keywords: 'cbt computer based test online exam lab timed live monitor marking' },
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
    label: 'Welfare',
    items: [
      { label: 'Behaviour', to: '/behaviour', icon: Medal, permission: 'welfare.read', keywords: 'merits demerits incidents discipline conduct detention points' },
      { label: 'Sick bay', to: '/sick-bay', icon: Stethoscope, anyOf: [['welfare.read'], ['health.manage']], keywords: 'clinic nurse sick medical allergies genotype blood group first aid' },
      { label: 'Houses', to: '/houses', icon: Shield, permission: 'school.read', keywords: 'house points inter-house sports red blue green yellow leaderboard assembly' },
      { label: 'Careers guidance', to: '/careers-guidance', icon: Compass, permission: 'students.read', keywords: 'careers counsellor guidance track science arts commercial technical jamb university interests' },
      { label: 'JAMB & universities', to: '/careers/jamb', icon: Landmark, permission: 'school.read', keywords: 'jamb ibass brochure university polytechnic college of education admission requirements utme subjects olevel syllabus cbt faq' },
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
      { label: 'Payroll', to: '/payroll', icon: Banknote, feature: 'payroll', permission: 'payroll.read', keywords: 'salaries payslips paye pension nhf wages' },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Parents', to: '/parents', icon: Users, permission: 'guardians.read', keywords: 'guardians' },
      { label: 'Alumni', to: '/alumni', icon: BookUser, permission: 'alumni.read', keywords: 'old students graduates old boys old girls association reunion' },
      { label: 'Teachers & Staff', to: '/staff', icon: Briefcase, permission: 'staff.read', keywords: 'employees hr' },
      { label: 'Users & Roles', to: '/settings/users', icon: UserCog, permission: 'users.read', keywords: 'accounts invite' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Library', to: '/library', icon: Library, feature: 'library', permission: 'library.read', keywords: 'books loans borrow return overdue fines catalogue reading list' },
      { label: 'Inventory', to: '/inventory', icon: Package, feature: 'inventory', permission: 'inventory.read', keywords: 'stock stores assets supplies reorder low stock equipment' },
      { label: 'Transport', to: '/transport', icon: Bus, feature: 'transport', permission: 'transport.read', keywords: 'routes buses vehicles riders stops drivers school bus' },
      { label: 'Hostel', to: '/hostel', icon: BedDouble, feature: 'hostel', permission: 'hostel.read', keywords: 'boarding boarders rooms beds exeat houses' },
      { label: 'Reception', to: '/reception', icon: ConciergeBell, permission: 'reception.read', keywords: 'visitors front desk enquiries admissions pick-up early collection' },
      { label: 'Certificates', to: '/certificates', icon: FileBadge, permission: 'documents.issue', keywords: 'testimonial transfer merit award certificate documents' },
      { label: 'ID Cards', to: '/id-cards', icon: IdCardLanyard, permission: 'documents.issue', keywords: 'identity cards badges print students staff qr' },
    ],
  },
  {
    label: 'Live Learning',
    items: [
      { label: 'Live Classes', to: '/live', icon: Video, feature: 'live_classes', permission: 'live.read', keywords: 'video virtual online meet zoom bigbluebutton recordings transcript ai summary' },
      { label: 'Homework', to: '/homework', icon: PencilLine, feature: 'live_classes', permission: 'homework.manage', keywords: 'assignments set homework due' },
    ],
  },
  {
    label: 'Communication',
    items: [
      { label: 'Messages', to: '/messages', icon: MessagesSquare, feature: 'messaging', permission: 'comms.read', keywords: 'messaging bulk sms whatsapp email broadcast send parents staff delivery' },
      { label: 'Noticeboard', to: '/noticeboard', icon: Megaphone, keywords: 'announcements news notices bulletin' },
      { label: 'Calendar', to: '/calendar', icon: CalendarDays, keywords: 'events term dates holidays exams pta school calendar' },
    ],
  },
  {
    label: 'AI',
    items: [
      {
        label: 'Principal AI',
        to: '/ai?agent=principal',
        feature: 'ai',
        icon: Crown,
        permission: 'ai.use',
        requires: ['school.read', 'results.read', 'finance.read'],
        keywords: 'head teacher leadership briefing school-wide assistant',
      },
      { label: 'School AI', to: '/ai?agent=school', icon: Bot, feature: 'ai', permission: 'ai.use', requires: ['school.read'] },
      {
        label: 'Academic AI',
        to: '/ai?agent=academic',
        feature: 'ai',
        icon: BookOpenCheck,
        permission: 'ai.use',
        requires: ['curriculum.read', 'results.read'],
        keywords: 'curriculum results learning outcomes academic',
      },
      { label: 'Teacher AI', to: '/ai?agent=teacher', icon: Presentation, feature: 'ai', permission: 'ai.use', requires: ['academics.read'] },
      { label: 'Parent AI', to: '/ai?agent=parent', icon: HeartHandshake, feature: 'ai', permission: 'ai.use', requires: ['family.manage'] },
      { label: 'HR AI', to: '/ai?agent=hr', icon: Contact, feature: 'ai', permission: 'ai.use', requires: ['hr.read'] },
      {
        label: 'Communication AI',
        to: '/ai?agent=communication',
        feature: 'ai',
        icon: Send,
        permission: 'ai.use',
        requires: ['comms.send'],
        keywords: 'messages draft announcement parents broadcast',
      },
      {
        label: 'Insights',
        to: '/ai/insights',
        feature: 'ai',
        icon: Radar,
        permission: 'attendance.read',
        requires: ['students.read'],
        keywords: 'students at risk need attention early warning briefing intelligence',
      },
      { label: 'AI Usage', to: '/ai/usage', icon: Gauge, feature: 'ai', permission: 'ai.admin', keywords: 'tokens spend budget cost calls' },
    ],
  },
  {
    label: 'Website',
    items: [
      {
        label: 'Website',
        to: '/website',
        feature: 'website',
        icon: Globe,
        permission: 'website.manage',
        keywords: 'cms public site school website news gallery photos downloads teachers inbox contact online applications result checker codes publish',
      },
      { label: 'Knowledge base', to: '/knowledge', icon: LibraryBig, permission: 'knowledge.manage', keywords: 'documents handbook policies faq answers parents staff website assistant' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'School Profile', to: '/settings', icon: Settings, permission: 'school.read', keywords: 'branding' },
      { label: 'Roles & Permissions', to: '/settings/roles', icon: ShieldCheck, permission: 'roles.manage' },
      { label: 'Audit Log', to: '/settings/audit', icon: ScrollText, permission: 'audit.read', keywords: 'history activity' },
      { label: 'Billing', to: '/settings/billing', icon: CreditCard, permission: 'billing.manage', keywords: 'subscription plan invoices pay ai school os account upgrade' },
      { label: 'Backup & export', to: '/settings/backup', icon: DatabaseBackup, permission: 'school.manage', keywords: 'backup export download data csv zip' },
      { label: 'Sponsorships', to: '/sponsorships', icon: HandCoins, permission: 'sponsorship.manage', keywords: 'sponsor ai plus exam prep waec jamb classes students pay for' },
      { label: 'Help & support', to: '/support', icon: LifeBuoy, permission: 'support.use', keywords: 'help ticket contact support problem issue' },
    ],
  },
];

export const PLATFORM_GROUP: NavGroup = {
  label: 'Platform',
  items: [
    { label: 'Console', to: '/platform', icon: LayoutGrid, area: 'overview', keywords: 'platform overview mrr arr kpis briefing' },
    { label: 'Pilot schools', to: '/platform/success', icon: HeartPulse, area: 'overview', keywords: 'success health score adoption risk churn renewal pilots at risk' },
    { label: 'Schools', to: '/platform/schools', icon: Building2, area: 'schools', keywords: 'tenants customers accounts' },
    { label: 'Branches', to: '/platform/branches', icon: GitBranch, area: 'schools', keywords: 'campuses sites' },
    { label: 'Billing', to: '/platform/billing', icon: Landmark, area: 'billing', keywords: 'subscriptions invoices payments revenue billing cycle' },
    { label: 'Revenue', to: '/platform/revenue', icon: ChartColumnStacked, area: 'commerce', keywords: 'ledger revenue domains balances accounts refunds' },
    { label: 'Unit economics', to: '/platform/unit-economics', icon: CircleDollarSign, area: 'commerce', keywords: 'contribution margin ai cost per student conversion' },
    { label: 'Parent products', to: '/platform/products', icon: PackageOpen, area: 'commerce', keywords: 'ai plus pro exam prep pricing coupons discounts' },
    { label: 'Parent subscriptions', to: '/platform/family', icon: Home, area: 'commerce', keywords: 'family orders refunds renewals grant access sponsorships' },
    { label: 'Exam content', to: '/platform/content', icon: ScanSearch, area: 'content', keywords: 'question bank waec jamb neco bece syllabus topics ai draft' },
    { label: 'Careers & courses', to: '/platform/careers', icon: Compass, area: 'content', keywords: 'career library university courses jamb brochure utme subjects olevel requirements' },
    { label: 'Plans', to: '/platform/plans', icon: Boxes, area: 'plans', keywords: 'pricing tiers modules packages' },
    { label: 'Usage', to: '/platform/usage', icon: Activity, area: 'usage', keywords: 'students seats ai spend api requests' },
    { label: 'Domains', to: '/platform/domains', icon: Globe2, area: 'domains', keywords: 'custom domain dns hostname cname' },
    { label: 'Support', to: '/platform/support', icon: LifeBuoy, area: 'support', keywords: 'tickets help desk queue' },
    { label: 'System health', to: '/platform/health', icon: HeartPulse, area: 'health', keywords: 'status uptime database queues errors' },
    { label: 'AI models', to: '/platform/ai', icon: Cpu, superAdmin: true, keywords: 'openai anthropic claude gemini gpt provider fallback prices tokens reasoning caching' },
    { label: 'Feature flags', to: '/platform/flags', icon: Flag, area: 'flags', keywords: 'beta rollout modules toggles' },
    { label: 'Audit log', to: '/platform/audit', icon: ScrollText, area: 'audit', keywords: 'history activity platform' },
    { label: 'Team', to: '/platform/team', icon: Users2, keywords: 'platform staff operators' },
  ],
};

/** Nav groups filtered to what this user may see. */
export function visibleNav(me: MeResponse | null, hidden?: ReadonlySet<string>): NavGroup[] {
  const hasTenant = !!me?.tenant;
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (!hasTenant && i.to !== '/') return false;
      if (hidden?.has(i.to)) return false;
      // The roadmap's coming-soon items mean nothing to parents and students.
      if (i.soon && !hasPermission(me, 'school.read')) return false;
      if (i.audience === 'family' && hasPermission(me, 'school.read')) return false;
      if (i.requires && !i.requires.every((p) => hasPermission(me, p))) return false;
      if (i.anyOf && !i.anyOf.some((set) => set.every((p) => hasPermission(me, p)))) return false;
      // Modules outside the school's plan disappear from the menu.
      if (i.feature && !hasFeature(me, i.feature)) return false;
      return !i.permission || hasPermission(me, i.permission);
    }),
  })).filter((g) => g.items.length > 0);
  if (me?.user.platformRole) {
    const items = PLATFORM_GROUP.items.filter((i) => (!i.area || canOpenArea(me, i.area)) && (!i.superAdmin || me.user.platformRole === 'SUPER_ADMIN'));
    // Without a school selected the console is the whole app, so it leads.
    if (hasTenant) groups.push({ ...PLATFORM_GROUP, items });
    else return [{ ...PLATFORM_GROUP, items }];
  }
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
