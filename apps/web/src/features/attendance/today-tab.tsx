import type { TodayAttendance } from '@aischool/shared';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Briefcase, CheckCircle2, ClipboardCheck, GraduationCap, MessageSquareText, PartyPopper, Sun, UserX } from 'lucide-react';
import { Link } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAttendanceToday } from './api';
import { CountLegend, DateStepper, fmtRate, longDate, plural, rateTone, RateChip, StackedBar, StatTile, STATUS_META, StreakBadge } from './ui';

interface Props {
  date: string | undefined;
  onDateChange: (date: string | undefined) => void;
  onOpenRegister: (classArmId: string, date: string) => void;
  onDraftMessage: (student: { id: string; name: string }) => void;
}

export function TodayTab({ date, onDateChange, onOpenRegister, onDraftMessage }: Props) {
  const query = useAttendanceToday(date);
  const d = query.data;
  const canManage = useCan('attendance.manage');
  const canAi = useCan('ai.use');
  const canGuardians = useCan('guardians.read');
  const canDraft = canAi && canGuardians;

  if (query.error && !d) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const value = date ?? d?.date;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {d ? (
            <p className="font-display text-[17px] font-semibold tracking-tight">
              {longDate(d.date)}
              {!date && <span className="ml-2 align-middle text-[12px] font-medium text-brand">Today</span>}
            </p>
          ) : (
            <Skeleton className="h-6 w-56" />
          )}
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">{d?.term ? d.term.name : 'Registers, absences and staff at a glance'}</p>
        </div>
        <div className="flex items-center gap-2">
          {date && (
            <Button variant="ghost" size="sm" onClick={() => onDateChange(undefined)}>
              Back to today
            </Button>
          )}
          {value && <DateStepper value={value} max={todayIso()} onChange={(v) => onDateChange(v)} className="w-[240px]" />}
        </div>
      </div>

      {d && !d.schoolDay ? (
        <Card>
          <EmptyState icon={Sun} title="Not a school day" description={`${d.dayName} isn’t a school day, so there are no registers to take.`} />
        </Card>
      ) : (
        <>
          <Kpis d={d} loading={!d} canManage={canManage} />
          <div className="grid gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <ClassGrid d={d} onOpenRegister={onOpenRegister} />
            </div>
            <Absentees d={d} canDraft={canDraft} onDraftMessage={onDraftMessage} />
          </div>
        </>
      )}
    </div>
  );
}

function Kpis({ d, loading, canManage }: { d?: TodayAttendance; loading: boolean; canManage: boolean }) {
  const s = d?.students;
  const taken = d?.registersTaken ?? 0;
  const expected = d?.registersExpected ?? 0;
  const staff = d?.staff;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <StatTile
        label="Students present"
        icon={<GraduationCap />}
        loading={loading}
        value={fmtRate(s?.rate)}
        tone={rateTone(s?.rate)}
        sub={
          s && (
            <span>
              {s.present + s.late} of {s.onRoll} on roll
              {s.unmarked > 0 && <span className="text-warning"> · {s.unmarked} not yet marked</span>}
            </span>
          )
        }
      >
        {s && (
          <div className="space-y-2">
            <StackedBar counts={s} total={s.onRoll} />
            <CountLegend counts={s} />
          </div>
        )}
      </StatTile>
      <StatTile
        label="Registers taken"
        icon={<ClipboardCheck />}
        loading={loading}
        value={
          <>
            {taken}
            <span className="text-[18px] font-medium text-muted-foreground">/{expected}</span>
          </>
        }
        tone={expected > 0 && taken >= expected ? 'success' : undefined}
        sub={expected === 0 ? 'No classes expect a register' : taken >= expected ? 'Every class has been marked' : `${plural(expected - taken, 'class', 'classes')} still to mark`}
      >
        <Progress value={expected ? (taken / expected) * 100 : 0} label="Registers taken" barClassName={taken >= expected ? 'bg-success' : 'bg-brand'} />
      </StatTile>
      <div className="sm:col-span-2 xl:col-span-1">
        <StatTile
          label="Staff"
          icon={<Briefcase />}
          loading={loading}
          value={
            <>
              {staff ? staff.present + staff.late : 0}
              <span className="text-[18px] font-medium text-muted-foreground">/{staff?.total ?? 0}</span>
            </>
          }
          sub={
            staff && (
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  <span className="font-medium text-foreground tabular">{staff.present}</span> in
                </span>
                <span className={cn(staff.late > 0 && 'text-warning')}>
                  <span className="font-medium tabular">{staff.late}</span> late
                </span>
                <span>
                  <span className="font-medium text-foreground tabular">{staff.notIn}</span> not in
                </span>
                {staff.onLeave > 0 && (
                  <span>
                    <span className="font-medium text-foreground tabular">{staff.onLeave}</span> on leave
                  </span>
                )}
                {canManage && (
                  <Link to="/attendance?tab=staff" className="font-medium text-brand hover:underline">
                    Manage
                  </Link>
                )}
              </span>
            )
          }
        />
      </div>
    </div>
  );
}

function ClassGrid({ d, onOpenRegister }: { d?: TodayAttendance; onOpenRegister: (id: string, date: string) => void }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>Class registers</CardTitle>
          <CardDescription>Open a class to take or review its register</CardDescription>
        </div>
        {d && (
          <Badge variant={d.registersTaken >= d.registersExpected && d.registersExpected > 0 ? 'success' : 'outline'}>
            {d.registersTaken}/{d.registersExpected} taken
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {!d ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
        ) : d.classes.length === 0 ? (
          <EmptyState compact icon={GraduationCap} title="No classes yet" description="Add class arms in Academic Setup and enrol students to start taking registers." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.classes.map((c, i) => (
              <motion.button
                key={c.classArm.id}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 12) * 0.025 }}
                onClick={() => onOpenRegister(c.classArm.id, d.date)}
                className={cn(
                  'group flex flex-col gap-2.5 rounded-xl border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  c.taken ? 'border-border' : 'border-dashed border-warning/40',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">
                      {c.classArm.levelName} {c.classArm.name}
                    </p>
                    <p className="truncate text-[12px] text-muted-foreground">{c.classTeacher ?? 'No class teacher'}</p>
                  </div>
                  {c.taken ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                      <CheckCircle2 className="size-3" aria-hidden /> Taken
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                      <AlertCircle className="size-3" aria-hidden /> Not taken
                    </span>
                  )}
                </div>
                <StackedBar counts={c.counts} total={c.onRoll} />
                <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                  <span className="tabular">
                    {c.taken ? `${c.counts.absent} absent · ${c.counts.late} late` : `${c.onRoll} on roll`}
                  </span>
                  {c.taken ? (
                    <RateChip rate={c.rate} />
                  ) : (
                    <span className="inline-flex items-center gap-1 font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      Take <ArrowRight className="size-3" />
                    </span>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Absentees({
  d,
  canDraft,
  onDraftMessage,
}: {
  d?: TodayAttendance;
  canDraft: boolean;
  onDraftMessage: (s: { id: string; name: string }) => void;
}) {
  const list = [...(d?.absentees ?? [])].sort(
    (a, b) => (a.status === b.status ? b.consecutive - a.consecutive || a.name.localeCompare(b.name) : a.status === 'ABSENT' ? -1 : 1),
  );
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div>
          <CardTitle>Absent today</CardTitle>
          <CardDescription>{d ? `${plural(d.students.absent, 'absence')} · ${plural(d.students.late, 'late arrival')}` : 'Learners marked absent or late'}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {!d ? (
          <div className="space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            compact
            icon={d.registersTaken > 0 ? PartyPopper : UserX}
            title={d.registersTaken > 0 ? 'Everyone’s here' : 'Nothing marked yet'}
            description={d.registersTaken > 0 ? 'No absences or late arrivals in the registers taken so far.' : 'Absences show up here as registers are taken.'}
          />
        ) : (
          <ul className="-mx-1 max-h-[520px] space-y-1 overflow-y-auto pr-1 scrollbar-thin">
            {list.map((a) => (
              <li key={a.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/50">
                <span aria-hidden className={cn('grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold', STATUS_META[a.status].soft)}>
                  {STATUS_META[a.status].letter}
                </span>
                <div className="min-w-0 flex-1">
                  <Link to={`/attendance/students/${a.id}`} className="block truncate text-[13.5px] font-medium hover:underline">
                    {a.name}
                  </Link>
                  <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                    <span>{a.classArm}</span>
                    {a.status === 'LATE' && <span className="text-warning">· late</span>}
                    {a.note && <span className="truncate">· {a.note}</span>}
                  </p>
                </div>
                {a.status === 'ABSENT' && <StreakBadge days={a.consecutive} />}
                {canDraft && a.status === 'ABSENT' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-[12px]"
                    aria-label={`Draft message to ${a.name}’s parent`}
                    title="Draft message to parent"
                    onClick={() => onDraftMessage({ id: a.id, name: a.name })}
                  >
                    <MessageSquareText /> <span className="hidden sm:inline xl:hidden 2xl:inline">Draft message</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canDraft && list.some((a) => a.status === 'ABSENT') && (
          <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <AiSparkle className="size-3" animated={false} /> Use <MessageSquareText className="inline size-3" aria-hidden /> to draft a note to a parent with AI.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
