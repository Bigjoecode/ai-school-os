import {
  AlertTriangle,
  Bell,
  BookOpen,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  Crown,
  FlaskConical,
  LayoutDashboard,
  Mic,
  Receipt,
  Send,
  Sparkles,
  Trophy,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/layout/brand';
import { cn } from '@/lib/utils';

/**
 * Product illustrations built from the app's own design tokens. All names and figures are sample
 * data made up for the illustration (no real school, student or parent), and each figure says so.
 */

/** A labelled illustration: screen readers get one description instead of the mock-up's pieces. */
export function Illustration({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <figure role="img" aria-label={label} className={cn('relative', className)}>
      <div aria-hidden>{children}</div>
    </figure>
  );
}

export function SampleTag({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border border-border bg-card/90 px-2 py-0.5 text-[10px] font-medium text-muted-foreground', className)}>Sample data</span>
  );
}

export function BrowserFrame({ children, url = 'ai-schoolportal.mejortechworld.com', className }: { children: ReactNode; url?: string; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-border-strong bg-card shadow-pop', className)}>
      <div className="flex items-center gap-2 border-b border-border bg-muted/70 px-3 py-2">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-danger/70" />
          <span className="size-2.5 rounded-full bg-warning/70" />
          <span className="size-2.5 rounded-full bg-success/70" />
        </span>
        <span className="mx-auto max-w-[70%] truncate rounded-md bg-background px-3 py-0.5 text-[10.5px] text-muted-foreground">{url}</span>
      </div>
      {children}
    </div>
  );
}

export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('w-[230px] rounded-[2.2rem] border-[7px] border-[#0b1330] bg-[#0b1330] shadow-pop dark:border-[#1e2a5e] dark:bg-[#1e2a5e]', className)}>
      <div className="relative overflow-hidden rounded-[1.7rem] bg-background">
        <div className="absolute left-1/2 top-1.5 z-10 h-4 w-16 -translate-x-1/2 rounded-full bg-[#0b1330] dark:bg-[#1e2a5e]" />
        <div className="pt-7">{children}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ dashboard

const ATTENDANCE = [
  { c: 'JSS 1', v: 96 },
  { c: 'JSS 2', v: 91 },
  { c: 'JSS 3', v: 94 },
  { c: 'SS 1', v: 88 },
  { c: 'SS 2', v: 93 },
  { c: 'SS 3', v: 97 },
];

function Kpi({ icon: Icon, label, value, note, tone = 'brand' }: { icon: typeof Users; label: string; value: string; note: string; tone?: 'brand' | 'success' | 'warning' | 'info' }) {
  const tones = { brand: 'bg-brand-soft text-brand', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning', info: 'bg-info-soft text-info' };
  return (
    <div className="rounded-xl border border-border bg-card p-2.5 sm:p-3">
      <div className="flex items-center gap-1.5">
        <span className={cn('grid size-5 place-items-center rounded-md sm:size-6', tones[tone])}>
          <Icon className="size-3 sm:size-3.5" />
        </span>
        <span className="truncate text-[9.5px] text-muted-foreground sm:text-[11px]">{label}</span>
      </div>
      <p className="mt-1.5 font-display text-[15px] font-semibold tabular tracking-tight sm:text-[19px]">{value}</p>
      <p className="truncate text-[9px] text-muted-foreground sm:text-[10.5px]">{note}</p>
    </div>
  );
}

/** Attendance by class: one series, thin rounded bars on a recessive grid. */
function AttendanceBars({ tall }: { tall?: boolean }) {
  const h = tall ? 132 : 92;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-semibold sm:text-[12px]">Attendance this week, by class</p>
        <p className="text-[9.5px] text-muted-foreground">%</p>
      </div>
      <div className="relative mt-2" style={{ height: h }}>
        {[100, 90, 80].map((g) => (
          <div key={g} className="absolute inset-x-0 border-t border-dashed border-[var(--chart-grid)]" style={{ bottom: `${((g - 75) / 25) * 100}%` }}>
            <span className="absolute -top-2 right-0 bg-card pl-1 text-[8.5px] text-muted-foreground">{g}</span>
          </div>
        ))}
        <div className="absolute inset-0 right-5 flex items-end justify-around gap-1.5">
          {ATTENDANCE.map((a) => (
            <div key={a.c} title={`${a.c}: ${a.v}%`} className="flex h-full w-full max-w-7 flex-col justify-end">
              <div className="rounded-t-[4px] bg-[var(--chart-1)]" style={{ height: `${((a.v - 75) / 25) * 100}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="mr-5 mt-1 flex justify-around text-[8.5px] text-muted-foreground sm:text-[9.5px]">
        {ATTENDANCE.map((a) => (
          <span key={a.c} className="w-full max-w-7 text-center">
            {a.c}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DashboardMock({ compact }: { compact?: boolean }) {
  return (
    <div className="flex bg-background text-left">
      <aside className="hidden w-36 shrink-0 border-r border-sidebar-border bg-sidebar p-2.5 md:block">
        <div className="mb-3 flex items-center gap-1.5">
          <BrandMark className="size-5" />
          <span className="font-display text-[11px] font-semibold">AI School OS</span>
        </div>
        {[
          [LayoutDashboard, 'Overview', true],
          [Users, 'Students'],
          [CalendarCheck, 'Attendance'],
          [Trophy, 'Results'],
          [Receipt, 'Fees'],
          [Sparkles, 'AI Command Center'],
        ].map(([Icon, label, active]) => {
          const I = Icon as typeof Users;
          return (
            <div key={label as string} className={cn('mb-0.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px]', active ? 'bg-brand-soft font-medium text-brand' : 'text-muted-foreground')}>
              <I className="size-3" /> {label as string}
            </div>
          );
        })}
      </aside>
      <div className="min-w-0 flex-1 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[10px] text-muted-foreground">Good morning, Principal</p>
            <p className="truncate font-display text-[13px] font-semibold sm:text-[15px]">Greenfield College · First term</p>
          </div>
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted">
            <Bell className="size-3 text-muted-foreground" />
          </span>
        </div>
        <div className={cn('mt-3 grid grid-cols-2 gap-2', !compact && 'lg:grid-cols-4')}>
          <Kpi icon={CalendarCheck} label="Present today" value="93%" note="612 of 658 students" tone="success" />
          <Kpi icon={Wallet} label="Fees collected" value="₦18.4m" note="71% of this term" tone="brand" />
          {!compact && <Kpi icon={AlertTriangle} label="Need attention" value="9" note="students this week" tone="warning" />}
          {!compact && <Kpi icon={TrendingUp} label="Weekly updates" value="540" note="sent to parents" tone="info" />}
        </div>
        <div className={cn('mt-2 grid gap-2', !compact && 'lg:grid-cols-[1.4fr_1fr]')}>
          <AttendanceBars />
          <div className={cn('hidden rounded-xl border border-border bg-card p-3', !compact && 'lg:block')}>
            <p className="flex items-center gap-1 text-[12px] font-semibold">
              <Sparkles className="size-3 text-ai-2" /> Principal AI
            </p>
            <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">SS 1 attendance dipped on Friday. 6 of the 9 students who need attention are in SS 1 B; a note to their parents is drafted for you.</p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-brand-soft px-1.5 py-0.5 text-[9.5px] font-medium text-brand">
              Review draft <ChevronRight className="size-2.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ parent phone

export function ParentPhoneMock() {
  return (
    <div className="space-y-2 px-3 pb-4 text-left">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9.5px] text-muted-foreground">Parent portal</p>
          <p className="font-display text-[13px] font-semibold">How Ada is learning</p>
        </div>
        <span className="grid size-7 place-items-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand">AO</span>
      </div>
      <div className="rounded-xl border border-border bg-card p-2.5">
        <p className="text-[9.5px] font-semibold uppercase tracking-wide text-success">Strong this week</p>
        <p className="text-[11px]">Fractions · Parts of speech</p>
        <p className="mt-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-warning">Needs attention</p>
        <p className="text-[11px]">Reading comprehension</p>
        <p className="mt-1.5 rounded-lg bg-muted px-2 py-1.5 text-[10px] leading-snug">At home: read one short story together and ask Ada to retell it.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border bg-card p-2">
          <p className="text-[9px] text-muted-foreground">Attendance</p>
          <p className="font-display text-[14px] font-semibold tabular">98%</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-2">
          <p className="text-[9px] text-muted-foreground">Last result</p>
          <p className="font-display text-[14px] font-semibold tabular">B+</p>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-primary p-2.5 text-primary-foreground">
        <div>
          <p className="text-[9px] opacity-70">Second term fees</p>
          <p className="font-display text-[13px] font-semibold tabular">₦85,000</p>
        </div>
        <span className="rounded-lg bg-brand px-2.5 py-1 text-[10px] font-semibold text-white">Pay now</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ AI tutor

export function TutorChatMock({ className }: { className?: string }) {
  return (
    <div className={cn('ai-border rounded-2xl bg-card p-3 text-left shadow-lift sm:p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold">
          <span className="grid size-6 place-items-center rounded-lg bg-ai-gradient text-white">
            <Sparkles className="size-3.5" />
          </span>
          AI tutor
        </p>
        <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">5 languages · voice</span>
      </div>
      <div className="mt-3 space-y-2 text-[11.5px] leading-snug">
        <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3 py-2 text-white">Why do we flip the second fraction when dividing?</p>
        <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-muted px-3 py-2">
          Good question. Dividing by ½ asks “how many halves fit in?”. Two halves fit in every whole, so ÷ ½ is the same as × 2. Try this one: 3 ÷ ¼ = ?
        </div>
        <p className="flex w-fit items-center gap-1.5 rounded-full border border-dashed border-ai-2/50 px-2 py-0.5 text-[10px] text-muted-foreground">
          <BookOpen className="size-3" /> Remembered: finds fractions tricky, prefers worked examples
        </p>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-background px-2.5 py-1.5">
        <span className="flex-1 text-[11px] text-muted-foreground">Answer or ask by voice…</span>
        <span className="grid size-6 place-items-center rounded-full bg-ai-gradient text-white">
          <Mic className="size-3" />
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ staff AI assistant

export function AgentChatMock() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-left shadow-lift">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <span className="grid size-8 place-items-center rounded-xl bg-ai-gradient text-white">
          <Crown className="size-4" />
        </span>
        <div>
          <p className="text-[13px] font-semibold">Principal AI</p>
          <p className="text-[10.5px] text-muted-foreground">Answers from your school’s live records</p>
        </div>
        <SampleTag className="ml-auto" />
      </div>
      <div className="mt-3 space-y-2.5 text-[12px] leading-snug">
        <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-primary-foreground">What needs my attention this week?</p>
        <div className="space-y-2 rounded-2xl rounded-bl-md bg-muted px-3 py-2.5">
          <p>Three things:</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>SS 1 B attendance fell to 84% (school average 93%).</li>
            <li>12 JSS 3 students scored under 40% on quadratic equations.</li>
            <li>₦2.1m in fees is more than 30 days overdue across 41 families.</li>
          </ol>
          <div className="flex flex-wrap gap-1.5 pt-1 text-[10.5px]">
            <span className="rounded-md bg-card px-2 py-1">Looked up: attendance</span>
            <span className="rounded-md bg-card px-2 py-1">results</span>
            <span className="rounded-md bg-card px-2 py-1">fees</span>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-ai-2/40 bg-brand-soft/60 px-3 py-2 text-[11.5px]">
          <Send className="size-3.5 shrink-0 text-brand" />
          <span className="flex-1">Draft: a reminder to the 41 families, ready for you to review</span>
          <span className="shrink-0 rounded-md bg-brand px-2 py-0.5 text-[10.5px] font-medium text-white">Review</span>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ report sheet

const REPORT_ROWS: [string, number, number, string][] = [
  ['Mathematics', 34, 52, 'A1'],
  ['English Language', 31, 47, 'B2'],
  ['Basic Science', 28, 50, 'B2'],
  ['Social Studies', 33, 55, 'A1'],
  ['Basic Technology', 26, 44, 'B3'],
];

export function ReportSheetMock() {
  return (
    <div className="rounded-2xl border border-border-strong bg-white p-4 text-left text-[#0a1024] shadow-pop sm:p-5">
      <div className="flex items-center gap-3 border-b-2 border-[#0b1633] pb-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-[#5b5bf6] font-serif text-[15px] font-bold text-[#5b5bf6]">GC</span>
        <div className="min-w-0 flex-1 text-center">
          <p className="font-serif text-[16px] font-bold uppercase tracking-wide sm:text-[18px]">Greenfield College</p>
          <p className="text-[10px] italic text-[#5d677e]">Knowledge and character</p>
          <p className="mt-0.5 text-[10.5px] font-semibold">Report sheet · First term</p>
        </div>
        <span className="hidden w-11 sm:block" />
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10.5px]">
        <p>
          <span className="text-[#5d677e]">Name:</span> <b>Chidinma Okafor</b>
        </p>
        <p>
          <span className="text-[#5d677e]">Class:</span> <b>JSS 2 A</b>
        </p>
        <p>
          <span className="text-[#5d677e]">Average:</span> <b>79.8%</b>
        </p>
        <p>
          <span className="text-[#5d677e]">Position:</span> <b>4th of 38</b>
        </p>
      </div>
      <table className="mt-2.5 w-full border-collapse text-[10.5px]">
        <thead>
          <tr className="bg-[#eef0f6] text-left">
            <th className="border border-[#d4d9e5] px-1.5 py-1 font-semibold">Subject</th>
            <th className="border border-[#d4d9e5] px-1.5 py-1 text-center font-semibold">CA</th>
            <th className="border border-[#d4d9e5] px-1.5 py-1 text-center font-semibold">Exam</th>
            <th className="border border-[#d4d9e5] px-1.5 py-1 text-center font-semibold">Total</th>
            <th className="border border-[#d4d9e5] px-1.5 py-1 text-center font-semibold">Grade</th>
          </tr>
        </thead>
        <tbody>
          {REPORT_ROWS.map(([s, ca, ex, g]) => (
            <tr key={s}>
              <td className="border border-[#d4d9e5] px-1.5 py-1">{s}</td>
              <td className="border border-[#d4d9e5] px-1.5 py-1 text-center tabular">{ca}</td>
              <td className="border border-[#d4d9e5] px-1.5 py-1 text-center tabular">{ex}</td>
              <td className="border border-[#d4d9e5] px-1.5 py-1 text-center font-semibold tabular">{ca + ex}</td>
              <td className="border border-[#d4d9e5] px-1.5 py-1 text-center">{g}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-[#d4d9e5] p-2 text-[10px]">
          <p className="font-semibold">Affective traits</p>
          {[
            ['Punctuality', 5],
            ['Neatness', 4],
            ['Teamwork', 5],
          ].map(([t, n]) => (
            <p key={t as string} className="mt-0.5 flex justify-between">
              <span>{t}</span>
              <span className="tracking-[2px] text-[#5b5bf6]">{'●'.repeat(n as number)}<span className="text-[#d4d9e5]">{'●'.repeat(5 - (n as number))}</span></span>
            </p>
          ))}
        </div>
        <div className="rounded-lg border border-[#d4d9e5] p-2 text-[10px]">
          <p className="flex items-center gap-1 font-semibold">
            Class teacher’s remark
            <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-[#ecebff] px-1 text-[8.5px] font-medium text-[#5b5bf6]">
              <Sparkles className="size-2.5" /> AI draft, approved
            </span>
          </p>
          <p className="mt-1 leading-snug text-[#3b4560]">A focused term. Chidinma leads in Mathematics; more reading practice will lift her comprehension further.</p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Practical Academy lab card

export function LabCardMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card text-left shadow-lift">
      <div className="relative h-40 overflow-hidden bg-[linear-gradient(160deg,#0b1330,#1e2a5e)]">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(to_right,rgb(255_255_255/0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
        {/* bench */}
        <div className="absolute inset-x-0 bottom-0 h-9 bg-[#3a2c22]" />
        <div className="absolute inset-x-0 bottom-9 h-1.5 bg-[#5a4434]" />
        {/* retort stand + burette */}
        <div className="absolute bottom-9 left-[38%] h-28 w-1 rounded bg-[#9aa3b8]" />
        <div className="absolute bottom-9 left-[33%] h-1.5 w-12 rounded bg-[#9aa3b8]" />
        <div className="absolute bottom-[4.6rem] left-[calc(38%-2px)] h-1 w-9 rounded bg-[#9aa3b8]" />
        <div className="absolute bottom-[3.4rem] left-[calc(38%+28px)] h-20 w-2.5 rounded-b-sm border border-white/50 bg-white/10">
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[#7c7bff]/60" />
        </div>
        {/* conical flask */}
        <div className="absolute bottom-9 left-[calc(38%+16px)] h-0 w-0 border-x-[18px] border-b-[30px] border-x-transparent border-b-white/30" />
        <div className="absolute bottom-9 left-[calc(38%+22px)] h-2.5 w-6 rounded-sm bg-[#f472b6]/70" />
        <span className="absolute left-3 top-3 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">3D chemistry lab</span>
        <span className="absolute right-3 top-3 rounded-full bg-success px-2 py-0.5 text-[10px] font-semibold text-white">Practical test</span>
      </div>
      <div className="p-3.5">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold">
          <FlaskConical className="size-4 text-brand" /> Acid–base titration
        </p>
        <p className="text-[11px] text-muted-foreground">WAEC Chemistry practical · SS 2</p>
        <ul className="mt-2.5 space-y-1 text-[11px]">
          {['Rinse and fill the burette', 'Pipette 25 cm³ of the base', 'Titrate to the end point'].map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              {i < 2 ? <CheckCircle2 className="size-3.5 text-success" /> : <span className="size-3.5 rounded-full border-2 border-brand" />}
              {s}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-muted px-2.5 py-1.5 text-[11px]">
          <span className="text-muted-foreground">Average titre</span>
          <span className="font-semibold tabular">24.10 cm³</span>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ analytics

const MASTERY: { topic: string; v: number[] }[] = [
  { topic: 'Fractions', v: [82, 76, 64, 88] },
  { topic: 'Algebra', v: [58, 44, 61, 70] },
  { topic: 'Geometry', v: [71, 69, 52, 66] },
  { topic: 'Statistics', v: [90, 84, 79, 86] },
];
const ARMS = ['JSS 2 A', 'JSS 2 B', 'JSS 2 C', 'JSS 2 D'];

/** Topic mastery: one hue, light to dark (sequential). */
function Heatmap() {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[12px] font-semibold">Topic mastery, Mathematics</p>
      <p className="text-[10px] text-muted-foreground">Darker means more students have mastered it</p>
      <div className="mt-2 grid grid-cols-[auto_repeat(4,minmax(0,1fr))] gap-[2px] text-[9.5px]">
        <span />
        {ARMS.map((a) => (
          <span key={a} className="truncate pb-0.5 text-center text-muted-foreground">
            {a.replace('JSS 2 ', '')}
          </span>
        ))}
        {MASTERY.map((row) => (
          <div key={row.topic} className="contents">
            <span className="self-center pr-2 text-muted-foreground">{row.topic}</span>
            {row.v.map((v, i) => (
              <span
                key={i}
                title={`${row.topic}, ${ARMS[i]}: ${v}%`}
                className={cn('grid h-6 place-items-center rounded-[4px] tabular', v >= 75 ? 'text-white' : 'text-foreground')}
                style={{ background: `color-mix(in oklab, var(--chart-1) ${Math.round(((v - 40) / 50) * 85 + 12)}%, var(--card))` }}
              >
                {v}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Fee collection across the term: a single line with an area wash and a hover note per point. */
function FeesLine() {
  const pts = [8, 21, 34, 46, 55, 63, 71];
  const w = 440;
  const h = 128;
  const x = (i: number) => (i / (pts.length - 1)) * (w - 16) + 8;
  const y = (v: number) => h - 8 - (v / 100) * (h - 20);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[12px] font-semibold">Fees collected this term</p>
        <p className="text-[10px] text-muted-foreground">% of fees due, by week</p>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-auto w-full">
        {[25, 50, 75].map((g) => (
          <line key={g} x1="0" x2={w} y1={y(g)} y2={y(g)} stroke="var(--chart-grid)" strokeDasharray="3 3" />
        ))}
        <path d={`${d} L${x(pts.length - 1)},${h - 8} L${x(0)},${h - 8} Z`} fill="var(--chart-1)" opacity="0.12" />
        <path d={d} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="4" fill="var(--chart-1)" stroke="var(--card)" strokeWidth="2">
            <title>{`Week ${i + 1}: ${v}%`}</title>
          </circle>
        ))}
        <text x={x(pts.length - 1) - 4} y={y(71) - 9} textAnchor="end" fontSize="10" fill="var(--foreground)" fontWeight="600">
          71%
        </text>
      </svg>
    </div>
  );
}

export function AnalyticsMock() {
  return (
    <div className="bg-background p-3 text-left sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-[14px] font-semibold sm:text-[16px]">School success</p>
        <div className="flex gap-1 text-[10px]">
          {['This week', 'This term', 'Session'].map((t, i) => (
            <span key={t} className={cn('rounded-md px-2 py-1', i === 1 ? 'bg-brand-soft font-medium text-brand' : 'text-muted-foreground')}>
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi icon={CalendarCheck} label="Attendance" value="93%" note="this term" tone="success" />
        <Kpi icon={Wallet} label="Fees collected" value="71%" note="₦18.4m of ₦25.9m" tone="brand" />
        <Kpi icon={Users} label="Parents active" value="82%" note="opened an update" tone="info" />
        <Kpi icon={AlertTriangle} label="Need attention" value="9" note="students" tone="warning" />
      </div>
      <div className="mt-2 grid gap-2 lg:grid-cols-2">
        <FeesLine />
        <Heatmap />
      </div>
      <div className="mt-2 rounded-xl border border-border bg-card p-3">
        <p className="text-[12px] font-semibold">Students who need attention</p>
        <ul className="mt-1.5 divide-y divide-border text-[11px]">
          {[
            ['Tunde A.', 'SS 1 B', 'Attendance 78% this term', 'High'],
            ['Grace E.', 'JSS 3 A', 'Average 41% in 1st CA', 'Medium'],
            ['Musa I.', 'SS 2 C', 'Absent 4 of the last 5 days', 'High'],
          ].map(([n, c, r, l]) => (
            <li key={n} className="flex items-center gap-2 py-1.5">
              <span className="w-16 shrink-0 font-medium">{n}</span>
              <span className="w-12 shrink-0 text-muted-foreground">{c}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{r}</span>
              <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-medium', l === 'High' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
                <AlertTriangle className="size-2.5" />
                {l}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Small check list used in several sections. */
export function CheckList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn('space-y-2.5', className)}>
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed">
          <span className="mt-1 grid size-4.5 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
            <Check className="size-3" strokeWidth={3} />
          </span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
