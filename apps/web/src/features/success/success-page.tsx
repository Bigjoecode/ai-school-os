import { INSIGHT_SOURCE_LABELS, type SuccessSummary, type SuccessWeek } from '@aischool/shared';
import { Banknote, Clock, FileText, GraduationCap, HeartPulse, Info, Sprout, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatNumber, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Facts, Kpi, Section } from '../platform/ui';
import { money, pct, useSuccessSummary, useSuccessTrends } from './api';
import { ChartLegend, type LineSeries, WeekBars, WeekLines } from './charts';
import { HealthBadge, HealthBreakdown, HealthFormula, HealthRing, ofText, TimeSavedTable, TrendArrow } from './ui';

const ACTIVE_SERIES: LineSeries[] = [
  { key: 'staff', label: 'Staff', color: 'var(--chart-1)' },
  { key: 'parents', label: 'Parents', color: 'var(--chart-2)' },
  { key: 'students', label: 'Students', color: 'var(--chart-3)' },
];

/** Weekly measures shown as small multiples, one chart each (different scales never share an axis). */
const WEEKLY: { key: keyof SuccessWeek; label: string }[] = [
  { key: 'registers', label: 'Attendance registers taken' },
  { key: 'homeworkSet', label: 'Homework set' },
  { key: 'homeworkHandedIn', label: 'Homework handed in' },
  { key: 'testsSat', label: 'Online tests sat' },
  { key: 'lessonPlans', label: 'Lesson plans written' },
  { key: 'evidence', label: 'Mastery evidence recorded' },
  { key: 'tutorConversations', label: 'AI tutor conversations' },
  { key: 'messagesSent', label: 'Messages sent' },
];

/**
 * The school's success dashboard for leaders: is the platform being used
 * (adoption), is learning improving (outcomes), are parents engaged, how much
 * teacher time it saves (estimate) and fees collected online, with a health
 * score and a printable term impact report.
 */
export default function SuccessPage() {
  const [params, setParams] = useSearchParams();
  const termId = params.get('termId') ?? undefined;
  const q = useSuccessSummary(termId);
  const trends = useSuccessTrends(termId);
  const s = q.data;

  return (
    <Page>
      <PageHeader
        eyebrow="Overview"
        title="School success"
        description="Evidence of what the platform is doing for your school: who is using it, how learning is moving, how parents are engaged and the teacher time it saves."
        actions={
          s && (
            <>
              {s.terms.length > 0 && (
                <Select value={s.term?.id ?? ''} onValueChange={(v) => setParams((p) => { const n = new URLSearchParams(p); n.set('termId', v); return n; }, { replace: true })}>
                  <SelectTrigger aria-label="Term" className="h-9 w-full sm:w-[220px]">
                    <SelectValue placeholder="Term" />
                  </SelectTrigger>
                  <SelectContent>
                    {s.terms.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                        {t.isCurrent ? ' (current)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button asChild>
                <Link to={`/success/report${s.term ? `?termId=${s.term.id}` : ''}`}>
                  <FileText /> Term impact report
                </Link>
              </Button>
            </>
          )
        }
      />

      {q.error && !s ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !s ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <div className={cn('space-y-4 transition-opacity', q.isPlaceholderData && 'opacity-60')}>
          <Tiles s={s} />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <Section
              title={
                <>
                  <HeartPulse className="size-4 text-muted-foreground" aria-hidden /> School health
                </>
              }
              description={`Last ${s.health.windowDays} days. Hover a part to see what it measures.`}
            >
              <div className="mb-4 flex items-center gap-4">
                <HealthRing score={s.health.score} band={s.health.band} />
                <div className="min-w-0">
                  <p className="font-display text-2xl font-semibold tabular">
                    {s.health.score}
                    <span className="text-[14px] font-normal text-muted-foreground"> / 100</span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <HealthBadge band={s.health.band} />
                    <TrendArrow now={s.health.score} before={s.health.previous} />
                  </div>
                </div>
              </div>
              <HealthBreakdown parts={s.health.parts} />
              <details className="mt-4 rounded-xl bg-muted/50 px-3 py-2.5">
                <summary className="cursor-pointer text-[13px] font-medium">How the score is worked out</summary>
                <div className="mt-2">
                  <HealthFormula />
                </div>
              </details>
            </Section>

            <Section title="People active each week" description="Share of each group who signed in or (students) learned on the platform that week.">
              {trends.data ? <ActiveChart weeks={trends.data.weeks} s={s} /> : <Skeleton className="h-64 rounded-xl" />}
            </Section>
          </div>

          <Section title="Teaching and learning activity, week by week" description="Last 8 weeks of the selected term. Each chart has its own scale.">
            {trends.error && !trends.data ? (
              <ErrorState error={trends.error} onRetry={() => void trends.refetch()} />
            ) : (
              <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
                {WEEKLY.map((m) => (
                  <div key={m.key} className="min-w-0">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <p className="truncate text-[12.5px] font-medium">{m.label}</p>
                      <p className="shrink-0 text-[11.5px] tabular text-muted-foreground">
                        {trends.data ? `${formatNumber(trends.data.weeks.reduce((t, w) => t + Number(w[m.key] ?? 0), 0))} in 8 wks` : ''}
                      </p>
                    </div>
                    <div className="h-28">
                      {trends.data ? <WeekBars label={m.label} data={trends.data.weeks.map((w) => ({ week: w.week, value: Number(w[m.key] ?? 0) }))} /> : <Skeleton className="h-full rounded-lg" />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Outcomes s={s} weeks={trends.data?.weeks} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Parent engagement" description="This term.">
              <Facts
                rows={[
                  ['Weekly learning updates sent', formatNumber(s.parents.updatesSent)],
                  ['Opened in the app', s.parents.inAppDelivered ? ofText(s.parents.opened, s.parents.inAppDelivered) : 'None delivered in the app yet'],
                  ['Parents who turned updates off', ofText(s.parents.optedOut, s.parents.guardians)],
                  ['Parents with portal accounts', ofText(s.population.guardianAccounts, s.population.guardians)],
                  ['Parents active this term', ofText(s.adoption.parentsActive, s.population.guardians)],
                  ['Parent portal sign-ins', formatNumber(s.parents.signIns)],
                  [
                    'Online payments made this term',
                    s.parents.onlinePaymentsKobo == null
                      ? `${formatNumber(s.parents.onlinePayments)} payments`
                      : `${formatNumber(s.parents.onlinePayments)} payments · ${money(s.parents.onlinePaymentsKobo, s.currency)}`,
                  ],
                ]}
              />
            </Section>

            <Section
              title={
                <>
                  Teacher time saved <Badge variant="warning">Estimate</Badge>
                </>
              }
              description="AI-assisted work this term × an assumed saving per item. The assumptions are shown on each line."
            >
              <TimeSavedTable t={s.timeSaved} />
            </Section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Use this term" description={`${formatDate(s.range.from)} to ${formatDate(s.range.to)}.`}>
              <Facts
                rows={[
                  ['Staff who used the platform', ofText(s.adoption.staffActive, s.population.staffWithAccounts)],
                  ['Teachers', ofText(s.adoption.teachersActive, s.population.teachers)],
                  ['Students active', ofText(s.adoption.studentsActive, s.population.students)],
                  ['Attendance registers taken', formatNumber(s.adoption.registers)],
                  ['Homework set · handed in · marked', `${formatNumber(s.adoption.homeworkSet)} · ${formatNumber(s.adoption.homeworkHandedIn)} · ${formatNumber(s.adoption.homeworkGraded)}`],
                  ['Online tests run · sat', `${formatNumber(s.adoption.testsRun)} · ${formatNumber(s.adoption.testsSat)}`],
                  ['Lesson plans written · vetted', `${formatNumber(s.adoption.lessonPlans)} · ${formatNumber(s.adoption.lessonPlansVetted)}`],
                  ['AI tutor conversations', formatNumber(s.adoption.tutorConversations)],
                  ['Messages sent', formatNumber(s.adoption.messagesSent)],
                  ['Report cards published', formatNumber(s.adoption.reportCardsPublished)],
                ]}
              />
            </Section>
            {s.finance ? (
              <Section title="Fees" description="This term's invoices and the payments made against them.">
                <FeesPanel s={s} />
              </Section>
            ) : (
              <Card className="flex items-start gap-3 p-5 text-[13px] text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                Fee collection figures are shown to people who can view finance.
              </Card>
            )}
          </div>

          <p className="text-[12px] text-muted-foreground">
            Figures refresh every 10 minutes (last worked out {formatRelative(s.generatedAt)}). Staff and parents count as active when they sign in or keep using the app; students also
            when they practise, use the tutor, hand in homework or sit an online test.
          </p>
        </div>
      )}
    </Page>
  );
}

function Tiles({ s }: { s: SuccessSummary }) {
  const studentsShare = s.population.students ? s.lastWeek.studentsActive / s.population.students : null;
  const parentsPart = s.health.parts.find((p) => p.key === 'parentsActive');
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Kpi
        label="Health score"
        icon={HeartPulse}
        value={
          <span className="flex items-center gap-2">
            {s.health.score}
            <TrendArrow now={s.health.score} before={s.health.previous} />
          </span>
        }
        sub={<HealthBadge band={s.health.band} />}
      />
      <Kpi label="Parents active" icon={Users} value={pct(parentsPart?.share ?? null)} sub={`signed in, last ${s.health.windowDays} days`} />
      <Kpi label="Students learning weekly" icon={GraduationCap} value={formatNumber(s.lastWeek.studentsActive)} sub={`${pct(studentsShare)} of students, last 7 days`} />
      <Kpi label="Teacher hours saved" icon={Clock} value={formatNumber(s.timeSaved.totalHours)} sub="estimate, this term" />
      <div className="col-span-2 lg:col-span-1">
      <Kpi
        label="Fees paid online"
        icon={Banknote}
        value={s.finance ? money(s.finance.onlineKobo, s.currency) : formatNumber(s.parents.onlinePayments)}
        sub={s.finance ? `${pct(s.finance.onlineShare)} of this term's fee payments` : 'payments made online this term'}
      />
      </div>
    </div>
  );
}

function ActiveChart({ weeks, s }: { weeks: SuccessWeek[]; s: SuccessSummary }) {
  const data = useMemo(
    () =>
      weeks.map((w) => ({
        week: w.week,
        staff: s.population.staffWithAccounts ? Math.round((w.staffActive / s.population.staffWithAccounts) * 100) : null,
        parents: s.population.guardians ? Math.round((w.parentsActive / s.population.guardians) * 100) : null,
        students: s.population.students ? Math.round((w.studentsActive / s.population.students) * 100) : null,
      })),
    [weeks, s.population],
  );
  return (
    <>
      <div className="h-60">
        <WeekLines data={data} series={ACTIVE_SERIES} format={(v) => `${v}%`} domain={[0, 100]} />
      </div>
      <div className="mt-3">
        <ChartLegend series={ACTIVE_SERIES} />
      </div>
    </>
  );
}

function Outcomes({ s, weeks }: { s: SuccessSummary; weeks?: SuccessWeek[] }) {
  const o = s.outcomes;
  const maxSource = Math.max(1, ...o.evidenceBySource.map((e) => e.count));
  return (
    <Section
      title={
        <>
          <Sprout className="size-4 text-muted-foreground" aria-hidden /> Learning outcomes
        </>
      }
      description="Topic mastery from practice, the AI tutor, quizzes, homework and online tests. Separate from official results."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4">
          <BigStat
            label="Topics recovered this term"
            value={formatNumber(o.recovered)}
            sub={o.startedBelow ? `of ${formatNumber(o.startedBelow)} student topics that started below 50% are now 50% or more (${pct(o.recoveredShare)})` : 'No student topics started below 50% with repeat evidence yet'}
          />
          <BigStat
            label="Average mastery gain"
            value={o.averageGain == null ? '—' : `${o.averageGain > 0 ? '+' : ''}${o.averageGain} pts`}
            sub={o.trackedPairs ? `across ${formatNumber(o.trackedPairs)} student topics with repeat evidence (${formatNumber(o.trackedStudents)} students); first vs latest score this term` : 'Needs two or more pieces of evidence on a topic'}
          />
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-[12.5px] font-medium">Evidence by source · {formatNumber(o.evidenceTotal)} this term</p>
          {o.evidenceBySource.length ? (
            <ul className="space-y-2">
              {o.evidenceBySource.map((e) => (
                <li key={e.source} className="text-[12.5px]">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{INSIGHT_SOURCE_LABELS[e.source] ?? e.label}</span>
                    <span className="tabular text-muted-foreground">{formatNumber(e.count)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full rounded-full bg-chart-1" style={{ width: `${(e.count / maxSource) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">No mastery evidence yet this term.</p>
          )}
          {o.bySubject.length > 0 && (
            <table className="mt-4 w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[11.5px] text-muted-foreground">
                  <th className="pb-1 font-medium">Subject</th>
                  <th className="pb-1 text-right font-medium">Topics tracked</th>
                  <th className="pb-1 text-right font-medium">Avg gain</th>
                  <th className="pb-1 text-right font-medium">Recovered</th>
                </tr>
              </thead>
              <tbody>
                {o.bySubject.map((r) => (
                  <tr key={r.subject} className="border-t border-border/70">
                    <td className="py-1.5 pr-2">{r.subject}</td>
                    <td className="py-1.5 text-right tabular">{formatNumber(r.pairs)}</td>
                    <td className="py-1.5 text-right tabular">{r.averageGain > 0 ? '+' : ''}{r.averageGain}</td>
                    <td className="py-1.5 text-right tabular">{formatNumber(r.recovered)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="min-w-0">
          <p className="mb-1 text-[12.5px] font-medium">Exam Academy practice</p>
          <p className="mb-2 text-[12px] text-muted-foreground">
            {formatNumber(o.practice.attempts)} practice sessions this term
            {o.practice.averageScore != null && <>, average {o.practice.averageScore}%</>}
            {o.practice.firstHalfAverage != null && o.practice.secondHalfAverage != null && (
              <>
                {' '}
                ({o.practice.firstHalfAverage}% in the first half of term → {o.practice.secondHalfAverage}% since)
              </>
            )}
            .
          </p>
          <div className="h-36">
            {weeks ? (
              <WeekBars label="Average practice score" color="var(--chart-4)" format={(v) => `${v}%`} data={weeks.map((w) => ({ week: w.week, value: w.practiceAverage }))} />
            ) : (
              <Skeleton className="h-full rounded-lg" />
            )}
          </div>
          <p className="mt-1 text-[11.5px] text-muted-foreground">Average practice score by week (weeks without practice are blank).</p>
        </div>
      </div>
    </Section>
  );
}

function BigStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-4">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-[28px] font-semibold leading-tight tabular">{value}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function FeesPanel({ s }: { s: SuccessSummary }) {
  const f = s.finance!;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between text-[13px]">
          <span>Collection rate</span>
          <span className="font-display text-[18px] font-semibold tabular">{pct(f.collectionRate)}</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((f.collectionRate ?? 0) * 100)} aria-label="Collection rate">
          <div className="h-full rounded-full bg-chart-4" style={{ width: `${Math.min(100, (f.collectionRate ?? 0) * 100)}%` }} />
        </div>
      </div>
      <Facts
        rows={[
          ['Billed this term', money(f.billedKobo, s.currency)],
          ['Collected', money(f.collectedKobo, s.currency)],
          ['Paid online (Paystack)', `${money(f.onlineKobo, s.currency)} · ${formatNumber(f.onlineCount)} payments`],
          ['Paid at school (cash, transfer, POS…)', money(f.offlineKobo, s.currency)],
          ['Online share of payments', pct(f.onlineShare)],
        ]}
      />
    </div>
  );
}
