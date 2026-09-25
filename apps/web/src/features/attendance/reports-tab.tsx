import { CHRONIC_ABSENCE_THRESHOLD, type SchoolAttendanceReport } from '@aischool/shared';
import { AlertTriangle, ArrowUpDown, BarChart3, Briefcase, CalendarRange, ChevronRight, RotateCw, School, Sparkles, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Markdown } from '@/components/ai/markdown';
import { Sparkline } from '@/components/charts/charts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { currentTerm, termDates, TermSelect } from '../planning/pickers';
import { type AiText, useAttendanceInsight, useClassReport, useSchoolReport } from './api';
import { DailyTrendChart, WeekdayBars } from './charts';
import { useClassOptions } from './classes';
import { CountLegend, fmtRate, plural, RateChip, RateRing, StackedBar, totalMarked } from './ui';

type View = 'school' | 'class';

interface Props {
  termId: string | undefined;
  onTermChange: (termId: string | undefined) => void;
  view: View;
  classArmId: string | undefined;
  onViewChange: (next: { view: View; classArmId?: string }) => void;
}

export function ReportsTab({ termId, onTermChange, view, classArmId, onViewChange }: Props) {
  const structure = useStructure();
  const { options, mine } = useClassOptions();
  const cls = classArmId && options.some((o) => o.id === classArmId) ? classArmId : (mine ?? options[0]?.id);

  return (
    <div className="space-y-5">
      <Card className="grid gap-3 p-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
        <div role="radiogroup" aria-label="Report" className="inline-flex h-10 items-center gap-1 rounded-xl border border-border bg-muted/60 p-1">
          {(
            [
              ['school', 'Whole school', School],
              ['class', 'By class', Users],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => onViewChange({ view: v, classArmId: v === 'class' ? cls : undefined })}
              className={cn(
                'inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                view === v ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" aria-hidden /> {label}
            </button>
          ))}
        </div>
        {structure.data ? (
          <TermSelect structure={structure.data} value={termId ?? currentTerm(structure.data)?.id} onChange={onTermChange} aria-label="Term" />
        ) : (
          <div className="flex h-10 items-center rounded-lg border border-dashed border-border px-3 text-[13px] text-muted-foreground">Current term</div>
        )}
        {view === 'class' ? (
          <Select value={cls ?? ''} onValueChange={(v) => onViewChange({ view: 'class', classArmId: v })} disabled={!options.length}>
            <SelectTrigger aria-label="Class">
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="hidden sm:block" />
        )}
      </Card>

      {view === 'school' ? <SchoolReport termId={termId} /> : <ClassReport classArmId={cls} termId={termId} />}
    </div>
  );
}

// ------------------------------------------------------------------ school

function SchoolReport({ termId }: { termId: string | undefined }) {
  const q = useSchoolReport(termId);
  const r = q.data;
  if (q.error && !r) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!r) return <ReportSkeleton />;

  const marked = totalMarked(r.counts);
  const chartDays = r.daily;

  return (
    <div className={cn('space-y-5 transition-opacity', q.isPlaceholderData && 'opacity-60')}>
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-brand/10 blur-3xl" />
          <div className="relative flex h-full flex-col gap-5 p-5 sm:p-6">
            <div>
              <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">{r.term.name}</p>
              <p className="text-[12.5px] text-muted-foreground">{termDates(r.term)}</p>
            </div>
            <div className="flex items-center gap-5">
              <RateRing rate={r.rate} size={128} label="this term" />
              <div className="min-w-0 space-y-2">
                <p className="text-[13px] text-muted-foreground">
                  <span className="font-display text-[20px] font-semibold text-foreground tabular">{marked.toLocaleString()}</span> marks recorded
                </p>
                <CountLegend counts={r.counts} className="flex-col items-start gap-1" />
              </div>
            </div>
            <StackedBar counts={r.counts} />
            <div className="mt-auto grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <Briefcase className="size-3.5" aria-hidden /> Staff attendance
                </p>
                <p className="mt-1 font-display text-lg font-semibold tabular">{fmtRate(r.staffRate)}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-[12px] text-muted-foreground">Staff late days</p>
                <p className={cn('mt-1 font-display text-lg font-semibold tabular', r.staffLateDays > 0 && 'text-warning')}>{r.staffLateDays}</p>
              </div>
            </div>
          </div>
        </Card>
        <div className="xl:col-span-2">
          <AiBriefingCard termId={termId} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Daily attendance</CardTitle>
              <CardDescription>Rate across registers taken each school day</CardDescription>
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className="size-2 rounded-full bg-chart-1" /> Rate
              </span>
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className="size-2 rounded-sm border border-border-strong bg-muted" /> Registers
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              {chartDays.length === 0 ? <EmptyChart text="The trend appears once registers are taken this term." /> : <DailyTrendChart data={chartDays} />}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>By weekday</CardTitle>
              <CardDescription>Spot the days attendance dips</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              {r.byWeekday.every((d) => d.rate == null) ? <EmptyChart text="No registers yet." /> : <WeekdayBars data={r.byWeekday.filter((d) => d.day <= 5 || d.rate != null)} />}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <ClassesRanked r={r} />
        <Chronic r={r} />
      </div>
    </div>
  );
}

function ClassesRanked({ r }: { r: SchoolAttendanceReport }) {
  const [asc, setAsc] = useState(false);
  const rows = useMemo(
    () =>
      [...r.classes].sort((a, b) => {
        const av = a.rate ?? -1;
        const bv = b.rate ?? -1;
        return asc ? av - bv : bv - av;
      }),
    [r.classes, asc],
  );
  return (
    <Card className="overflow-hidden xl:col-span-3">
      <CardHeader>
        <div>
          <CardTitle>Classes ranked</CardTitle>
          <CardDescription>Attendance rate this term</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAsc(!asc)} aria-label={asc ? 'Sort highest first' : 'Sort lowest first'}>
          <ArrowUpDown /> {asc ? 'Lowest first' : 'Highest first'}
        </Button>
      </CardHeader>
      {rows.length === 0 ? (
        <EmptyState compact icon={Users} title="No classes yet" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Class</TableHead>
              <TableHead className="hidden sm:table-cell">Registers</TableHead>
              <TableHead className="w-[40%]">Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c, i) => (
              <TableRow key={c.classArm.id}>
                <TableCell className="tabular text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  <Link
                    to={`/attendance?tab=reports&view=class&class=${c.classArm.id}&termId=${r.term.id}`}
                    className="font-medium hover:underline"
                  >
                    {c.classArm.levelName} {c.classArm.name}
                  </Link>
                </TableCell>
                <TableCell className="hidden tabular text-muted-foreground sm:table-cell">{c.registersTaken}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full', c.rate == null ? '' : c.rate >= 95 ? 'bg-success' : c.rate >= CHRONIC_ABSENCE_THRESHOLD ? 'bg-warning' : 'bg-danger')}
                        style={{ width: `${c.rate ?? 0}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-[13px] font-semibold tabular">{fmtRate(c.rate)}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function Chronic({ r }: { r: SchoolAttendanceReport }) {
  return (
    <Card className="flex flex-col xl:col-span-2">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            Persistently absent
            {r.chronic.length > 0 && <Badge variant="danger">{r.chronic.length}</Badge>}
          </CardTitle>
          <CardDescription>Learners below {CHRONIC_ABSENCE_THRESHOLD}% this term</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {r.chronic.length === 0 ? (
          <EmptyState compact icon={Sparkles} title="No one below the line" description={`Every learner is at or above ${CHRONIC_ABSENCE_THRESHOLD}% so far.`} />
        ) : (
          <ul className="-mx-2 max-h-[420px] space-y-0.5 overflow-y-auto scrollbar-thin">
            {[...r.chronic]
              .sort((a, b) => a.rate - b.rate)
              .map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/attendance/students/${s.id}?termId=${r.term.id}`}
                    className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{s.name}</span>
                      <span className="block text-[12px] text-muted-foreground">
                        {s.classArm} · {plural(s.absent, 'day')} absent
                      </span>
                    </span>
                    <RateChip rate={s.rate} />
                    <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ AI briefing

function AiBriefingCard({ termId }: { termId: string | undefined }) {
  const canAi = useCan('ai.use');
  const insight = useAttendanceInsight();
  const [result, setResult] = useState<AiText | null>(null);

  useEffect(() => {
    setResult(null);
    insight.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId]);

  if (!canAi) {
    return (
      <Card className="grid h-full place-items-center border-dashed p-6 text-center text-[13px] text-muted-foreground">
        AI briefings are available to staff with AI access.
      </Card>
    );
  }
  const run = () => insight.mutate(termId, { onSuccess: setResult });

  return (
    <Card className="ai-border relative h-full overflow-hidden border-transparent">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-ai-2/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 left-10 size-56 rounded-full bg-ai-3/10 blur-3xl" />
      <div className="relative p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-ai-gradient shadow-[0_6px_20px_-6px_var(--ai-2)]">
              <AiSparkle className="size-5 [&_path]:fill-white" animated={insight.isPending} />
            </div>
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold tracking-tight">
                <span className="text-ai-gradient">AI briefing</span> on attendance
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                Patterns, classes and learners to watch, and what to do next — written from this term’s registers.
              </p>
            </div>
          </div>
          <Button variant={result ? 'outline' : 'ai'} size="sm" onClick={run} loading={insight.isPending} className="shrink-0">
            {!insight.isPending && (result ? <RotateCw /> : <Sparkles />)} {result ? 'Refresh' : insight.isPending ? 'Reading the registers…' : 'Write briefing'}
          </Button>
        </div>
        {insight.isPending && !result && (
          <div className="mt-5 space-y-2.5" aria-live="polite" aria-busy>
            <p className="text-[12.5px] text-muted-foreground">This takes 10–30 seconds…</p>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}
        {!insight.isPending && !result && (
          <ul className="mt-5 grid gap-2 text-[12.5px] text-muted-foreground sm:grid-cols-3">
            {[
              [BarChart3, 'Trends and weekday dips'],
              [AlertTriangle, 'Learners at risk'],
              [CalendarRange, 'Concrete next steps'],
            ].map(([Icon, text]) => {
              const I = Icon as typeof BarChart3;
              return (
                <li key={text as string} className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2.5">
                  <I className="size-3.5 shrink-0 text-ai-2" aria-hidden /> {text as string}
                </li>
              );
            })}
          </ul>
        )}
        {result && (
          <div className={cn('mt-5 border-t border-border pt-5 transition-opacity', insight.isPending && 'opacity-50')}>
            <Markdown text={result.text} className="text-[13.5px]" />
            <p className="mt-4 text-[11.5px] text-muted-foreground">
              Generated by {result.provider} · {result.model} from this term’s attendance. Check it against what you know of your learners.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ class

function ClassReport({ classArmId, termId }: { classArmId: string | undefined; termId: string | undefined }) {
  const q = useClassReport(classArmId, termId);
  const r = q.data;
  const navigate = useNavigate();
  const [asc, setAsc] = useState(true);
  const students = useMemo(
    () => [...(r?.students ?? [])].sort((a, b) => ((a.rate ?? 101) - (b.rate ?? 101)) * (asc ? 1 : -1) || a.name.localeCompare(b.name)),
    [r, asc],
  );

  if (!classArmId) return <EmptyState icon={Users} title="Pick a class" description="Choose a class to see its attendance this term." />;
  if (q.error && !r) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!r) return <ReportSkeleton />;

  const trend = r.daily.map((d) => d.rate).filter((v): v is number => v != null);
  const chronic = r.students.filter((s) => s.chronic).length;

  return (
    <div className={cn('space-y-5 transition-opacity', q.isPlaceholderData && 'opacity-60')}>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <div className="flex items-center gap-5">
            <RateRing rate={r.rate} size={96} stroke={8} />
            <div>
              <p className="font-display text-[18px] font-semibold tracking-tight">
                {r.classArm.levelName} {r.classArm.name}
              </p>
              <p className="text-[12.5px] text-muted-foreground">{r.term.name}</p>
              <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                <span className="font-medium text-foreground tabular">{r.registersTaken}</span> of {r.schoolDaysSoFar} registers taken
                {chronic > 0 && <span className="text-danger"> · {chronic} persistently absent</span>}
              </p>
            </div>
          </div>
          <div className="min-w-0 flex-1 md:pl-6">
            <p className="mb-1 text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">Daily rate</p>
            <div className="h-16 w-full">
              {trend.length > 1 ? <Sparkline data={trend} /> : <p className="text-[12.5px] text-muted-foreground">Not enough registers yet.</p>}
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Learners</CardTitle>
            <CardDescription>Click a learner for their term calendar</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setAsc(!asc)}>
            <ArrowUpDown /> {asc ? 'Lowest first' : 'Highest first'}
          </Button>
        </CardHeader>
        {students.length === 0 ? (
          <EmptyState compact icon={Users} title="No learners" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Learner</TableHead>
                <TableHead className="text-center">Present</TableHead>
                <TableHead className="text-center">Late</TableHead>
                <TableHead className="text-center">Absent</TableHead>
                <TableHead className="hidden text-center sm:table-cell">Excused</TableHead>
                <TableHead className="text-right">Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => (
                <TableRow
                  key={s.id}
                  data-clickable
                  tabIndex={0}
                  onClick={() => navigate(`/attendance/students/${s.id}?termId=${r.term.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/attendance/students/${s.id}?termId=${r.term.id}`)}
                  className={cn('cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none', s.chronic && 'bg-danger-soft/20')}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      {s.chronic && (
                        <Badge variant="danger" className="hidden sm:inline-flex">
                          Persistent absence
                        </Badge>
                      )}
                    </div>
                    <span className="font-mono text-[11.5px] text-muted-foreground">{s.admissionNumber}</span>
                  </TableCell>
                  <TableCell className="text-center tabular">{s.counts.present}</TableCell>
                  <TableCell className={cn('text-center tabular', s.counts.late > 0 && 'text-warning')}>{s.counts.late}</TableCell>
                  <TableCell className={cn('text-center tabular', s.counts.absent > 0 && 'font-medium text-danger')}>{s.counts.absent}</TableCell>
                  <TableCell className="hidden text-center tabular text-muted-foreground sm:table-cell">{s.counts.excused}</TableCell>
                  <TableCell className="text-right">
                    <RateChip rate={s.rate} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ bits

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="grid h-full place-items-center rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center text-[13px] text-muted-foreground">
      {text}
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-5" aria-busy>
      <div className="grid gap-5 xl:grid-cols-3">
        <Skeleton className="h-[300px] rounded-2xl" />
        <Skeleton className="h-[300px] rounded-2xl xl:col-span-2" />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Skeleton className="h-[330px] rounded-2xl xl:col-span-2" />
        <Skeleton className="h-[330px] rounded-2xl" />
      </div>
    </div>
  );
}
