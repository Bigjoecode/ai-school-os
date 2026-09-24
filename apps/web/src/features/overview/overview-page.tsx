import type { Insight, OverviewResponse } from '@aischool/shared';
import { useQuery } from '@tanstack/react-query';
import { motion, type Variants } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  MonitorPlay,
  GraduationCap,
  Layers,
  Receipt,
  Send,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { ClassLevelBarChart, DonutChart, EnrolmentAreaChart, Sparkline } from '@/components/charts/charts';
import { Page } from '@/components/layout/page-header';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useCan, useMe } from '@/lib/auth-store';
import { formatDate, formatNumber, formatRelative, greeting } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { qk } from '@/lib/query-client';
import { cn } from '@/lib/utils';

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};

const SUGGESTIONS = [
  'Which classes are nearly full?',
  'Summarise enrolment this term',
  'Which students have no guardian on record?',
];

const toneDot: Record<Insight['tone'], string> = {
  good: 'bg-success shadow-[0_0_0_4px_var(--success-soft)]',
  warning: 'bg-warning shadow-[0_0_0_4px_var(--warning-soft)]',
  info: 'bg-info shadow-[0_0_0_4px_var(--info-soft)]',
};

export default function OverviewPage() {
  const me = useMe();
  if (!me?.tenant) return <PlatformWelcome />;
  return <SchoolOverview />;
}

function PlatformWelcome() {
  useDocumentTitle('Overview');
  const me = useMe();
  return (
    <Page>
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 shadow-soft sm:p-12">
        <div aria-hidden className="absolute -right-20 -top-20 size-72 rounded-full bg-ai-1/15 blur-3xl" />
        <p className="text-[13px] font-medium text-muted-foreground">{greeting()}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
          {me?.user.firstName}, welcome to the <span className="text-ai-gradient">platform console</span>
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          You're signed in without a school selected. Manage schools on the platform, or switch into a school from the sidebar.
        </p>
        {me?.user.platformRole === 'SUPER_ADMIN' && (
          <Button asChild className="mt-6">
            <Link to="/platform/tenants">
              <Building2 /> Manage schools
            </Link>
          </Button>
        )}
      </div>
    </Page>
  );
}

function SchoolOverview() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: qk.overview,
    queryFn: ({ signal }) => api.get<OverviewResponse>('/dashboard/overview', undefined, signal),
  });
  useDocumentTitle('Overview');

  if (error && !data) {
    return (
      <Page>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Page>
    );
  }

  return (
    <Page>
      <Greeting data={data} loading={isLoading} />
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
        <Kpis data={data} />
        <div className="grid gap-5 xl:grid-cols-3">
          <motion.div variants={item} className="xl:col-span-2">
            <AiIntelligenceCard data={data} />
          </motion.div>
          <motion.div variants={item}>
            <AiAssistantCard />
          </motion.div>
        </div>
        <div className="grid gap-5 xl:grid-cols-3">
          <motion.div variants={item} className="xl:col-span-2">
            <ChartCard
              title="Enrolment trend"
              description="Total students and new admissions by month"
              legend={[
                { label: 'Total', color: 'var(--chart-1)' },
                { label: 'Admitted', color: 'var(--chart-2)' },
              ]}
            >
              {!data ? (
                <Skeleton className="h-full w-full rounded-xl" />
              ) : data.enrolmentTrend.length === 0 ? (
                <EmptyChart text="Enrolment history will appear once students are admitted." />
              ) : (
                <EnrolmentAreaChart data={data.enrolmentTrend} />
              )}
            </ChartCard>
          </motion.div>
          <motion.div variants={item}>
            <GenderCard data={data} />
          </motion.div>
        </div>
        <div className="grid gap-5 xl:grid-cols-3">
          <motion.div variants={item} className="xl:col-span-2">
            <ChartCard
              title="Students by class level"
              description="Enrolled students against available capacity"
              legend={[
                { label: 'Students', color: 'var(--chart-1)' },
                { label: 'Capacity', color: 'var(--border-strong)' },
              ]}
            >
              {!data ? (
                <Skeleton className="h-full w-full rounded-xl" />
              ) : data.byClassLevel.length === 0 ? (
                <EmptyChart text="Add class levels in Academic Setup to see this breakdown." />
              ) : (
                <ClassLevelBarChart data={data.byClassLevel} />
              )}
            </ChartCard>
          </motion.div>
          <motion.div variants={item}>
            <ActivityCard data={data} />
          </motion.div>
        </div>
        <motion.div variants={item}>
          <ComingOnline />
        </motion.div>
      </motion.div>
    </Page>
  );
}

// ------------------------------------------------------------------ greeting
function Greeting({ data, loading }: { data?: OverviewResponse; loading: boolean }) {
  const me = useMe();
  const name = data?.greetingName ?? me?.user.firstName ?? '';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="mb-7 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-end md:justify-between"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-muted-foreground">{data?.school.name ?? me?.tenant?.name}</p>
        <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight tracking-[-0.025em] sm:text-[34px]">
          {greeting()}, {name}
        </h1>
        {data?.school.motto && <p className="mt-1 text-[14px] italic text-muted-foreground">“{data.school.motto}”</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {loading ? (
          <Skeleton className="h-9 w-56 rounded-full" />
        ) : data?.currentSession || data?.currentTerm ? (
          <div className="flex items-center gap-2.5 rounded-full border border-border bg-card py-1.5 pl-2 pr-4 shadow-soft">
            <span className="grid size-6 place-items-center rounded-full bg-brand-soft text-brand">
              <CalendarDays className="size-3.5" />
            </span>
            <span className="text-[13px] font-medium">
              {[data.currentSession?.name, data.currentTerm?.name].filter(Boolean).join(' · ')}
            </span>
            {data.currentTerm && (
              <span className="text-[12.5px] text-muted-foreground">
                {data.currentTerm.daysLeft > 0
                  ? `${data.currentTerm.daysLeft} day${data.currentTerm.daysLeft === 1 ? '' : 's'} left`
                  : `ended ${formatDate(data.currentTerm.endsOn)}`}
              </span>
            )}
          </div>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link to="/academics">
              <CalendarDays /> Set the current session
            </Link>
          </Button>
        )}
      </div>
    </motion.div>
  );
}

// ------------------------------------------------------------------ KPIs
function KpiCard({
  label,
  icon,
  value,
  href,
  footer,
  children,
}: {
  label: string;
  icon: ReactNode;
  value: number | undefined;
  href?: string;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const body = (
    <Card className="group relative h-full overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg border border-border bg-muted/50 text-muted-foreground transition-colors group-hover:text-brand [&_svg]:size-4">
          {icon}
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        {value === undefined ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <AnimatedNumber value={value} className="font-display text-[34px] font-semibold leading-none tracking-[-0.03em] tabular" />
        )}
        {children}
      </div>
      <div className="mt-3 min-h-5 text-[12.5px] text-muted-foreground">{value === undefined ? <Skeleton className="h-3.5 w-32" /> : footer}</div>
    </Card>
  );
  return href ? (
    <Link to={href} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

function Change({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11.5px] font-semibold tabular',
        up ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
      )}
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  );
}

function Kpis({ data }: { data?: OverviewResponse }) {
  const k = data?.kpis;
  const canStudents = useCan('students.read');
  const canStaff = useCan('staff.read');
  const canGuardians = useCan('guardians.read');
  const canAcademics = useCan('academics.read');
  const trend = data?.enrolmentTrend.map((t) => t.total) ?? [];
  return (
    <motion.div variants={container} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <motion.div variants={item}>
        <KpiCard
          label="Students"
          icon={<GraduationCap />}
          value={k?.students.total}
          href={canStudents ? '/students' : undefined}
          footer={
            <span className="flex items-center gap-2">
              <Change pct={k?.students.changePct ?? null} />
              {k && `${formatNumber(k.students.addedThisMonth)} added this month`}
            </span>
          }
        >
          {trend.length > 1 && (
            <div className="h-10 w-24">
              <Sparkline data={trend} />
            </div>
          )}
        </KpiCard>
      </motion.div>
      <motion.div variants={item}>
        <KpiCard
          label="Teachers & staff"
          icon={<Briefcase />}
          value={k?.staff.total}
          href={canStaff ? '/staff' : undefined}
          footer={k && `${formatNumber(k.staff.teaching)} teaching · ${formatNumber(k.staff.total - k.staff.teaching)} support`}
        />
      </motion.div>
      <motion.div variants={item}>
        <KpiCard
          label="Parents"
          icon={<Users />}
          value={k?.guardians.total}
          href={canGuardians ? '/parents' : undefined}
          footer={
            k && (
              <span className="flex items-center gap-3">
                <Progress value={k.guardians.coveragePct} className="max-w-24" barClassName="bg-chart-4" label="Guardian coverage" />
                <span>{Math.round(k.guardians.coveragePct)}% of students covered</span>
              </span>
            )
          }
        />
      </motion.div>
      <motion.div variants={item}>
        <KpiCard
          label="Classes"
          icon={<Layers />}
          value={k?.classes.arms}
          href={canAcademics ? '/academics?tab=classes' : undefined}
          footer={
            k && (
              <span className="flex items-center gap-3">
                {k.classes.utilisationPct != null && (
                  <Progress value={k.classes.utilisationPct} className="max-w-24" barClassName="bg-chart-3" label="Capacity utilisation" />
                )}
                <span>
                  {k.classes.levels} levels · avg {formatNumber(k.classes.avgClassSize, { maximumFractionDigits: 1 })}/class
                  {k.classes.utilisationPct != null && ` · ${Math.round(k.classes.utilisationPct)}% full`}
                </span>
              </span>
            )
          }
        />
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------------ AI cards
function AiIntelligenceCard({ data }: { data?: OverviewResponse }) {
  const navigate = useNavigate();
  const canAi = useCan('ai.use');
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    navigate(text ? `/ai?agent=school&q=${encodeURIComponent(text)}` : '/ai?agent=school');
  };
  return (
    <Card className="ai-border ai-glow relative h-full overflow-hidden border-transparent">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-ai-2/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 left-10 size-56 rounded-full bg-ai-3/10 blur-3xl" />
      <CardHeader className="relative">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-ai-gradient shadow-[0_6px_20px_-6px_var(--ai-2)]">
            <AiSparkle className="size-[18px] [&_path]:fill-white" />
          </span>
          <div>
            <CardTitle>AI School Intelligence</CardTitle>
            <CardDescription className="mt-0.5">What needs your attention today</CardDescription>
          </div>
        </div>
        <Badge variant="ai" className="hidden sm:inline-flex">
          Live
        </Badge>
      </CardHeader>
      <CardContent className="relative">
        {!data ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="mt-1 size-2.5 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-5/6" />
                </div>
              </div>
            ))}
          </div>
        ) : data.insights.length === 0 ? (
          <p className="py-6 text-[13.5px] text-muted-foreground">
            All clear — no insights right now. They'll appear here as your school data grows.
          </p>
        ) : (
          <ul className="-mx-2 space-y-1">
            {data.insights.map((ins, i) => {
              const inner = (
                <>
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', toneDot[ins.tone])} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-foreground">{ins.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">{ins.detail}</span>
                  </span>
                  {ins.href && (
                    <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                </>
              );
              return (
                <motion.li
                  key={`${ins.title}-${i}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.07 }}
                >
                  {ins.href ? (
                    <Link to={ins.href} className="group flex gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60">
                      {inner}
                    </Link>
                  ) : (
                    <div className="group flex gap-3 rounded-xl px-2 py-2.5">{inner}</div>
                  )}
                </motion.li>
              );
            })}
          </ul>
        )}
        {canAi && (
          <form onSubmit={submit} className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-background/60 p-1.5 pl-3.5 focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15">
            <AiSparkle className="size-4" animated={false} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ask a follow-up…"
              aria-label="Ask School AI a follow-up question"
              className="h-8 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/70"
            />
            <Button type="submit" size="icon-sm" variant="ai" aria-label="Ask School AI">
              <Send />
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function AiAssistantCard() {
  const canAi = useCan('ai.use');
  return (
    <Card className="relative h-full overflow-hidden bg-[#070c1d] text-white dark:bg-[#0a1024]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="animate-orb absolute -right-10 -top-16 size-56 rounded-full bg-[#6366f1]/40 blur-3xl" />
        <div className="animate-orb absolute -bottom-16 -left-10 size-48 rounded-full bg-[#06b6d4]/25 blur-3xl" style={{ animationDelay: '-8s' }} />
      </div>
      <div className="relative flex h-full flex-col p-6">
        <div className="flex items-center gap-2 text-[12px] font-medium text-white/60">
          <AiSparkle className="size-4" /> AI Assistant
        </div>
        <p className="mt-3 font-display text-xl font-semibold leading-snug tracking-tight">Ask anything about your school.</p>
        <p className="mt-1.5 text-[13px] text-white/55">Answers grounded in your live school data.</p>
        <div className="mt-5 flex flex-1 flex-col gap-2">
          {SUGGESTIONS.map((s) =>
            canAi ? (
              <Link
                key={s}
                to={`/ai?agent=school&q=${encodeURIComponent(s)}`}
                className="group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white/85 backdrop-blur transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              >
                {s}
                <ArrowRight className="size-3.5 shrink-0 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
              </Link>
            ) : (
              <span key={s} className="rounded-xl border border-white/10 px-3.5 py-2.5 text-[13px] text-white/50">
                {s}
              </span>
            ),
          )}
        </div>
        {canAi && (
          <Button asChild variant="ai" className="mt-5 w-full">
            <Link to="/ai">
              Open AI Command Center <ArrowRight />
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ charts
function ChartCard({
  title,
  description,
  legend,
  children,
}: {
  title: string;
  description: string;
  legend?: { label: string; color: string }[];
  children: ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {legend && (
          <div className="hidden items-center gap-3 sm:flex">
            {legend.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="h-[260px] w-full">{children}</div>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="grid h-full place-items-center rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center text-[13px] text-muted-foreground">
      {text}
    </div>
  );
}

function GenderCard({ data }: { data?: OverviewResponse }) {
  const male = data?.gender.male ?? 0;
  const female = data?.gender.female ?? 0;
  const total = male + female;
  const rows = [
    { name: 'Female', value: female, color: 'var(--chart-3)' },
    { name: 'Male', value: male, color: 'var(--chart-2)' },
  ];
  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>Gender balance</CardTitle>
          <CardDescription>Active student body</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {!data ? (
          <Skeleton className="mx-auto size-44 rounded-full" />
        ) : total === 0 ? (
          <div className="h-[200px]">
            <EmptyChart text="No students yet." />
          </div>
        ) : (
          <>
            <div className="relative mx-auto h-[180px] w-[180px]">
              <DonutChart data={rows} />
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="font-display text-2xl font-semibold tabular">{formatNumber(total)}</p>
                  <p className="text-[11.5px] text-muted-foreground">students</p>
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {rows.map((r) => (
                <div key={r.name} className="rounded-xl border border-border bg-muted/30 p-3">
                  <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ background: r.color }} />
                    {r.name}
                  </p>
                  <p className="mt-1 font-display text-lg font-semibold tabular">
                    {formatNumber(r.value)}{' '}
                    <span className="text-[12px] font-normal text-muted-foreground">{Math.round((r.value / total) * 100)}%</span>
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityCard({ data }: { data?: OverviewResponse }) {
  const canAudit = useCan('audit.read');
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Latest changes across the school</CardDescription>
        </div>
        {canAudit && (
          <Button asChild variant="ghost" size="sm">
            <Link to="/settings/audit">View all</Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {!data ? (
          <div className="space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-7 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : data.recentActivity.length === 0 ? (
          <EmptyState compact icon={Activity} title="No activity yet" description="Actions like admissions and edits appear here." />
        ) : (
          <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border">
            {data.recentActivity.slice(0, 7).map((a) => (
              <li key={a.id} className="relative flex gap-3">
                <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full border border-border bg-card">
                  <span className="size-1.5 rounded-full bg-brand" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-[13px] leading-snug text-foreground">{a.summary}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {a.actor ? `${a.actor} · ` : ''}
                    <time dateTime={a.at} title={new Date(a.at).toLocaleString()}>
                      {formatRelative(a.at)}
                    </time>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ roadmap strip
const NEXT_MODULES = [
  { label: 'Attendance', icon: CalendarCheck, to: '/attendance', note: 'Daily registers & absence alerts' },
  { label: 'Fees', icon: Receipt, to: '/fees', note: 'Invoices, payments & collections' },
  { label: 'Live classes', icon: MonitorPlay, to: '/live', note: 'Google Meet lessons & AI summaries' },
  { label: 'Timetable', icon: CalendarClock, to: '/timetable', note: 'AI-built, clash-free schedules' },
];

function ComingOnline() {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-[15px] font-semibold tracking-tight">Coming online</h2>
        <span className="text-[12px] text-muted-foreground">Not yet tracked — no data shown until these modules launch</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {NEXT_MODULES.map((m) => (
          <Link
            key={m.label}
            to={m.to}
            className="group flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-4 transition-all hover:border-border-strong hover:bg-card"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:text-brand">
              <m.icon className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[13.5px] font-medium">
                {m.label}
                <span className="rounded-full border border-border px-1.5 text-[10px] leading-4 text-muted-foreground">Soon</span>
              </span>
              <span className="block truncate text-[12px] text-muted-foreground">{m.note}</span>
            </span>
            <span className="text-[12px] font-medium text-muted-foreground/70">—</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
