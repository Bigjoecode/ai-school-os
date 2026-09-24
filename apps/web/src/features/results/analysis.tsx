import type { AnalysisInsight, GradeBand } from '@aischool/shared';
import { BarChart3, LifeBuoy, RotateCw, Sparkles, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Markdown } from '@/components/ai/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { useAnalysis, useAnalysisInsight } from '../assessment/api';
import { fmtPct } from '../assessment/ui';

export function AnalysisView({ classArmId, termId, scale }: { classArmId: string; termId: string; scale: GradeBand[] }) {
  const q = useAnalysis({ classArmId, termId });
  const a = q.data;

  if (q.isLoading) {
    return (
      <div className="space-y-4" aria-busy>
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }
  if (!a) {
    return (
      <Card>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Card>
    );
  }
  const withData = a.subjects.filter((s) => s.entered > 0);
  if (withData.length === 0) {
    return (
      <Card>
        <EmptyState icon={BarChart3} title="No marks to analyse yet" description="Enter scores for at least one subject and the class picture appears here." />
      </Card>
    );
  }

  const chartData = withData.map((s) => ({ name: s.subject.code || s.subject.name, full: s.subject.name, mean: s.mean, passRate: s.passRate }));
  const grades = [...scale].sort((x, y) => y.min - x.min);
  const maxCell = Math.max(1, ...withData.flatMap((s) => Object.values(s.distribution)));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Class mean" value={fmtPct(a.overall.mean)} hint={`${a.students} learners`} bar={a.overall.mean} />
        <Kpi label="Pass rate" value={fmtPct(a.overall.passRate)} hint="Subject results at a pass grade" bar={a.overall.passRate} tone={a.overall.passRate != null && a.overall.passRate < 50 ? 'danger' : 'success'} />
        <Kpi label="Marks completeness" value={fmtPct(a.overall.completeness, 0)} hint="Of expected marks entered" bar={a.overall.completeness} tone={a.overall.completeness < 80 ? 'warning' : undefined} />
      </div>

      <InsightCard classArmId={classArmId} termId={termId} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Subject performance</CardTitle>
            <CardDescription>Mean score and pass rate per subject, as a percentage of what has been assessed.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="24%" barGap={4}>
                <CartesianGrid vertical={false} strokeDasharray="3 4" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={10} interval={0} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} tickMargin={6} width={48} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip
                  cursor={{ fill: 'var(--muted)', opacity: 0.6, radius: 8 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as (typeof chartData)[number] | undefined;
                    if (!row) return null;
                    return (
                      <div className="min-w-[160px] rounded-xl border border-border bg-popover/95 px-3 py-2.5 text-[12px] shadow-pop backdrop-blur">
                        <p className="mb-1.5 font-medium text-foreground">{row.full}</p>
                        {(
                          [
                            ['Mean', row.mean, 'var(--chart-1)'],
                            ['Pass rate', row.passRate, 'var(--chart-2)'],
                          ] as const
                        ).map(([k, v, c]) => (
                          <div key={k} className="flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ background: c }} aria-hidden />
                            <span className="text-muted-foreground">{k}</span>
                            <span className="ml-auto font-medium tabular text-foreground">{fmtPct(v)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={28}
                  iconType="circle"
                  iconSize={8}
                  formatter={(v: string) => <span className="text-[12px] text-muted-foreground">{v === 'mean' ? 'Mean' : 'Pass rate'}</span>}
                />
                <Bar dataKey="mean" fill="var(--chart-1)" radius={[6, 6, 2, 2]} maxBarSize={26} animationDuration={800} />
                <Bar dataKey="passRate" fill="var(--chart-2)" radius={[6, 6, 2, 2]} maxBarSize={26} animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Grade distribution</CardTitle>
            <CardDescription>How many learners got each grade, per subject.</CardDescription>
          </div>
        </CardHeader>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-y border-border bg-muted/50">
                <th scope="col" className="sticky left-0 z-10 min-w-[150px] bg-muted px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Subject
                </th>
                {grades.map((g) => (
                  <th key={g.grade} scope="col" className={cn('px-2 py-2 text-center text-[11px] font-semibold', g.pass ? 'text-muted-foreground' : 'text-danger')}>
                    {g.grade}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Median
                </th>
                <th scope="col" className="px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  High / Low
                </th>
              </tr>
            </thead>
            <tbody>
              {withData.map((s) => (
                <tr key={s.subject.id} className="border-b border-border last:border-0">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-1.5 text-left font-medium">
                    <span className="block truncate">{s.subject.name}</span>
                    <span className="block text-[11px] font-normal text-muted-foreground">{s.entered} entered</span>
                  </th>
                  {grades.map((g) => {
                    const n = s.distribution[g.grade] ?? 0;
                    const pct = Math.round((n / maxCell) * 70);
                    const color = g.pass ? 'var(--brand)' : 'var(--danger)';
                    return (
                      <td key={g.grade} className="p-1 text-center">
                        <span
                          className={cn('grid h-8 min-w-9 place-items-center rounded-md tabular', n === 0 ? 'text-muted-foreground/40' : 'font-medium')}
                          style={n ? { background: `color-mix(in oklab, ${color} ${Math.max(10, pct)}%, transparent)`, color: pct > 45 ? 'white' : undefined } : undefined}
                          title={`${n} learner${n === 1 ? '' : 's'} got ${g.grade} in ${s.subject.name}`}
                        >
                          {n || '·'}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-center tabular">{fmtPct(s.median)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-center tabular text-muted-foreground">
                    {fmtPct(s.highest, 0)} / {fmtPct(s.lowest, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-success-soft text-success">
                <Trophy className="size-4" />
              </span>
              <CardTitle>Top learners</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {a.topStudents.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No averages yet.</p>
            ) : (
              <ol className="space-y-2">
                {a.topStudents.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                    <span
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular',
                        i === 0 ? 'bg-ai-gradient text-white' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{s.name}</span>
                    <span className="text-[13px] font-semibold tabular">{fmtPct(s.average)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-warning-soft text-warning">
                <LifeBuoy className="size-4" />
              </span>
              <div>
                <CardTitle>Learners needing support</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {a.atRisk.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No learner is failing a subject right now.</p>
            ) : (
              <ul className="space-y-2">
                {a.atRisk.map((s) => (
                  <li key={s.id} className="rounded-xl border border-border px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{s.name}</span>
                      <span className={cn('text-[13px] font-semibold tabular', s.average != null && s.average < 40 && 'text-danger')}>{fmtPct(s.average)}</span>
                    </div>
                    {s.failedSubjects.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {s.failedSubjects.map((f) => (
                          <Badge key={f} variant="danger">
                            {f}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, bar, tone }: { label: string; value: string; hint: string; bar: number | null; tone?: 'success' | 'warning' | 'danger' }) {
  return (
    <Card className="p-5">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-[28px] font-semibold leading-none tracking-tight tabular">{value}</p>
      <Progress
        value={bar ?? 0}
        className="mt-3"
        label={label}
        barClassName={cn(tone === 'success' && 'bg-success', tone === 'warning' && 'bg-warning', tone === 'danger' && 'bg-danger')}
      />
      <p className="mt-2 text-[12px] text-muted-foreground">{hint}</p>
    </Card>
  );
}

function InsightCard({ classArmId, termId }: { classArmId: string; termId: string }) {
  const canAi = useCan('ai.use');
  const insight = useAnalysisInsight();
  const [result, setResult] = useState<AnalysisInsight | null>(null);

  useEffect(() => {
    setResult(null);
    insight.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classArmId, termId]);

  if (!canAi) return null;
  const run = () => insight.mutate({ classArmId, termId }, { onSuccess: setResult });

  return (
    <Card className="ai-border relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-ai-2/10 blur-3xl" />
      <div className="relative p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card">
              <AiSparkle className="size-5" animated={insight.isPending} />
            </div>
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold tracking-tight">
                <span className="text-ai-gradient">AI briefing</span> for this class
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                A plain-English read of the numbers on this page — strengths, concerns and next steps. Generated only from these results.
              </p>
            </div>
          </div>
          <Button variant={result ? 'outline' : 'ai'} size="sm" onClick={run} loading={insight.isPending} className="shrink-0">
            {!insight.isPending && (result ? <RotateCw /> : <Sparkles />)} {result ? 'Refresh' : insight.isPending ? 'Reading the results…' : 'Write briefing'}
          </Button>
        </div>
        {insight.isPending && !result && (
          <div className="mt-5 space-y-2.5" aria-live="polite" aria-busy>
            <p className="text-[12.5px] text-muted-foreground">This takes 10–30 seconds…</p>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        )}
        {result && (
          <div className={cn('mt-5 border-t border-border pt-5 transition-opacity', insight.isPending && 'opacity-50')}>
            <Markdown text={result.text} className="text-[13.5px]" />
            <p className="mt-4 text-[11.5px] text-muted-foreground">
              Generated by {result.provider} · {result.model} from the figures shown here. Check it against your own knowledge of the class.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
