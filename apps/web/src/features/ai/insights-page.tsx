import type { AtRiskStudent, RiskLevel } from '@aischool/shared';
import { motion } from 'framer-motion';
import { AlertTriangle, CalendarCheck, Eye, Info, PartyPopper, Receipt, Trophy, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page, PageHeader } from '@/components/layout/page-header';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney, formatPct, formatRelative } from '@/lib/format';
import { cn, initialsFromName } from '@/lib/utils';
import { armOptions, useStructure } from '../academics/api';
import { Segmented } from '../operations/ui';
import { StudentSheet } from '../students/student-sheet';
import { askAboutLink, LEVEL_BADGE, useAgents, useAskAgent, useAtRisk } from './api';
import { BriefingCard } from './briefing-card';

const ALL = '__all';

export default function InsightsPage() {
  const agents = useAgents();
  const canBrief = !!agents.data?.some((a) => a.agent === 'principal');
  const [classArmId, setClassArmId] = useState('');
  const [level, setLevel] = useState<'ALL' | RiskLevel>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const structure = useStructure();
  const arms = armOptions(structure.data);
  const report = useAtRisk(classArmId || undefined);
  const askAgent = useAskAgent();
  const data = report.data;

  const students = useMemo(() => (data?.students ?? []).filter((s) => level === 'ALL' || s.level === level), [data, level]);

  return (
    <Page>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <AiSparkle className="size-3.5" /> AI School
          </span>
        }
        title="School intelligence"
        description="Early warnings drawn from attendance, results and fees — so the right students get support before problems grow."
      />

      <div className="space-y-6">
        {canBrief && (
          <div id="briefing" className="scroll-mt-20">
            <BriefingCard />
          </div>
        )}

        <section aria-labelledby="attention-h" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 id="attention-h" className="font-display text-lg font-semibold tracking-tight">
                Students who need attention
              </h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {data?.term ? `${data.term.name} · ` : ''}
                {data ? `Updated ${formatRelative(data.generatedAt)}` : 'Checking every student’s record…'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {arms.length > 0 && (
                <Select value={classArmId || ALL} onValueChange={(v) => setClassArmId(v === ALL ? '' : v)}>
                  <SelectTrigger className="h-9 w-44" aria-label="Filter by class">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All classes</SelectItem>
                    {arms.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Segmented
                size="sm"
                label="Level"
                value={level}
                onChange={setLevel}
                options={[
                  { value: 'ALL', label: 'All' },
                  { value: 'HIGH', label: 'High', count: data?.counts.high },
                  { value: 'MEDIUM', label: 'Medium', count: data?.counts.medium },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
            <Kpi tone="danger" icon={AlertTriangle} label="Need support now" value={data?.counts.high} hint="High concern" loading={report.isLoading} />
            <Kpi tone="warning" icon={Eye} label="Worth watching" value={data?.counts.medium} hint="Medium concern" loading={report.isLoading} />
            <Kpi tone="neutral" icon={Users} label="Students assessed" value={data?.counts.assessed} hint={classArmId ? 'In this class' : 'Across the school'} loading={report.isLoading} />
          </div>

          {report.error && !data ? (
            <Card>
              <ErrorState error={report.error} onRetry={() => void report.refetch()} />
            </Card>
          ) : report.isLoading ? (
            <Card className="divide-y divide-border">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-48 max-w-full" />
                    <Skeleton className="h-3 w-72 max-w-full" />
                  </div>
                </div>
              ))}
            </Card>
          ) : students.length === 0 ? (
            <Card>
              <EmptyState
                icon={PartyPopper}
                title={level === 'ALL' ? 'No students need attention right now' : `No ${LEVEL_BADGE[level].label.toLowerCase()}-concern students`}
                description="Attendance, results and fees all look healthy. We’ll flag anyone who starts to slip."
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {students.map((s, i) => (
                  <motion.li
                    key={s.student.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 10) * 0.03 }}
                  >
                    <StudentRow s={s} askAgent={askAgent} onOpen={() => setOpenId(s.student.id)} />
                  </motion.li>
                ))}
              </ul>
            </Card>
          )}

          {data && (
            <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Based on {listSignals(data.signals)}.
                {!data.signals.fees && ' Fees aren’t included because your role can’t see finance.'} These are prompts for a conversation, not
                judgements — always talk to the class teacher first.
              </span>
            </p>
          )}
        </section>
      </div>

      <StudentSheet id={openId} onClose={() => setOpenId(null)} />
    </Page>
  );
}

function listSignals(s: { attendance: boolean; results: boolean; fees: boolean; liveClasses: boolean }) {
  const names = [s.attendance && 'attendance', s.results && 'results', s.fees && 'fees', s.liveClasses && 'live class attendance'].filter(Boolean) as string[];
  if (names.length === 0) return 'the records available to you';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function Kpi({
  tone,
  icon: Icon,
  label,
  value,
  hint,
  loading,
}: {
  tone: 'danger' | 'warning' | 'neutral';
  icon: typeof Users;
  label: string;
  value: number | undefined;
  hint: string;
  loading: boolean;
}) {
  return (
    <Card className="flex items-center gap-4 p-4 sm:p-5">
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl',
          tone === 'danger' && 'bg-danger-soft text-danger',
          tone === 'warning' && 'bg-warning-soft text-warning',
          tone === 'neutral' && 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[12.5px] text-muted-foreground">{label}</p>
        {loading || value == null ? (
          <Skeleton className="mt-1 h-7 w-12" />
        ) : (
          <p className="font-display text-2xl font-semibold tabular tracking-tight">
            <AnimatedNumber value={value} />
          </p>
        )}
        <p className="text-[11.5px] text-muted-foreground">{hint}</p>
      </div>
    </Card>
  );
}

function StudentRow({ s, askAgent, onOpen }: { s: AtRiskStudent; askAgent: 'principal' | 'school' | null; onOpen: () => void }) {
  const badge = LEVEL_BADGE[s.level];
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 gap-3">
        <Avatar name={s.student.name} initials={initialsFromName(s.student.name)} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={onOpen}
              className="truncate rounded text-left text-[14px] font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {s.student.name}
            </button>
            <Badge variant={badge.variant} dot>
              {badge.label}
            </Badge>
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            <span className="font-mono">{s.student.admissionNumber}</span>
            {s.student.classArm && <> · {s.student.classArm}</>}
          </p>
          {s.reasons.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Reasons">
              {s.reasons.map((r) => (
                <li
                  key={r}
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[11.5px] font-medium',
                    s.level === 'HIGH' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
                  )}
                >
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 lg:w-[300px] lg:shrink-0 [&>*]:min-w-0">
        <Metric icon={CalendarCheck} label="Attendance" value={formatPct(s.attendanceRate)} warn={s.attendanceRate != null && s.attendanceRate < 85} />
        <Metric icon={Trophy} label="Average" value={formatPct(s.averagePercent)} warn={s.averagePercent != null && s.averagePercent < 50} />
        <Metric
          icon={Receipt}
          label="Overdue"
          value={s.overdueKobo ? formatMoney(s.overdueKobo / 100, 'NGN', { maximumFractionDigits: 0, notation: s.overdueKobo >= 100_000_000 ? 'compact' : 'standard' }) : '—'}
          warn={!!s.overdueKobo}
        />
      </dl>
      <div className="flex flex-wrap gap-2 lg:shrink-0 lg:flex-col">
        <Button variant="outline" size="sm" onClick={onOpen}>
          Open record
        </Button>
        {askAgent && (
          <Button asChild variant="ghost" size="sm" className="text-ai-2 hover:text-ai-2">
            <Link to={askAboutLink(askAgent, s)} aria-label={`Ask ${askAgent === 'principal' ? 'Principal' : 'School'} AI about ${s.student.name}`}>
              <AiSparkle animated={false} /> Ask {askAgent === 'principal' ? 'Principal' : 'School'} AI
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, warn }: { icon: typeof Users; label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 px-2.5 py-2">
      <dt className="flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3 shrink-0" aria-hidden /> <span className="truncate">{label}</span>
      </dt>
      <dd className={cn('mt-0.5 truncate text-[13.5px] font-semibold tabular', warn ? 'text-foreground' : 'text-muted-foreground')}>{value}</dd>
    </div>
  );
}
