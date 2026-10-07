import type { CbtExamDetail, CbtRosterRow } from '@aischool/shared';
import { CBT_SHOW_RESULTS_LABELS } from '@aischool/shared';
import { ArrowLeft, CalendarClock, Clock, Eye, EyeOff, KeyRound, MoreHorizontal, Pencil, Play, Square, Trash2, Undo2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDeleteOnlineExam, useExamAction, useOnlineExam } from './api';
import { MarkingPanel } from './marking';
import { OfflinePanel } from './offline/offline-panel';
import { ResultsPanel } from './results';
import { ScheduleExamDialog } from './schedule-dialog';
import { AttemptBadge, PhaseBadge, clock, minutesLabel, windowLabel } from './ui';

export default function OnlineExamPage() {
  const { id = '' } = useParams();
  const q = useOnlineExam(id);
  if (q.error && !q.data) {
    return (
      <Page>
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      </Page>
    );
  }
  if (!q.data) {
    return (
      <Page>
        <Skeleton className="mb-6 h-10 w-80" />
        <div className="grid gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="mt-6 h-80 rounded-2xl" />
      </Page>
    );
  }
  return <ExamView e={q.data} fetchedAt={q.dataUpdatedAt} />;
}

function ExamView({ e, fetchedAt }: { e: CbtExamDetail; fetchedAt: number }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'students';
  const action = useExamAction(e.id);
  const del = useDeleteOnlineExam();
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'close' | 'delete' | 'unpublish'>(null);
  const started = e.counts.started > 0;
  const toMark = e.counts.submitted - e.counts.marked;

  const actions = e.canManage && (
    <>
      {e.phase === 'DRAFT' && (
        <Button onClick={() => action.mutate({ action: 'publish' })} loading={action.isPending && action.variables?.action === 'publish'}>
          <Play /> Schedule
        </Button>
      )}
      {e.phase === 'OPEN' && (
        <Button variant="outline" onClick={() => setConfirm('close')}>
          <Square /> Close now
        </Button>
      )}
      {e.phase !== 'DRAFT' && (e.showResults !== 'IMMEDIATE' || e.phase === 'ENDED') && (
        <Button
          variant={e.resultsReleasedAt ? 'outline' : 'default'}
          onClick={() => action.mutate({ action: 'release', body: { released: !e.resultsReleasedAt } })}
          loading={action.isPending && action.variables?.action === 'release'}
          disabled={!started}
          title={!started ? 'Nobody has sat the exam yet' : undefined}
        >
          {e.resultsReleasedAt ? <EyeOff /> : <Eye />} {e.resultsReleasedAt ? 'Hide results' : 'Release results'}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {e.phase !== 'ENDED' && (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil /> {started ? 'Extend or edit' : 'Edit'}
            </DropdownMenuItem>
          )}
          {e.phase === 'ENDED' && (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <CalendarClock /> Reopen with a later closing time
            </DropdownMenuItem>
          )}
          {e.status === 'SCHEDULED' && !started && (
            <DropdownMenuItem onSelect={() => setConfirm('unpublish')}>
              <Undo2 /> Back to draft
            </DropdownMenuItem>
          )}
          {!started && (
            <DropdownMenuItem onSelect={() => setConfirm('delete')} className="text-danger focus:text-danger">
              <Trash2 /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link to="/online-exams" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Online Exams
          </Link>
        }
        title={e.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <PhaseBadge phase={e.phase} />
            <span>
              {e.subject.name} · {e.classArms.map((a) => a.name).join(', ')}
            </span>
          </span>
        }
        actions={actions}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={CalendarClock} label="Window" value={windowLabel(e.opensAt, e.closesAt)} small />
        <Stat icon={Clock} label="Duration" value={`${e.durationMinutes} min · ${e.questionCount} questions`} small />
        <Stat icon={Users} label="Submitted" value={`${e.counts.submitted} of ${e.counts.students}`} sub={e.counts.inProgress ? `${e.counts.inProgress} writing now` : undefined} />
        <Stat
          icon={KeyRound}
          label={e.accessCode ? `Access code: ${e.accessCode}` : 'No access code'}
          value={CBT_SHOW_RESULTS_LABELS[e.showResults]}
          sub={e.resultsReleasedAt ? 'Results released' : 'Results to students'}
          small
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams((p) => (p.set('tab', v), p), { replace: true })}>
        <TabsList>
          <TabsTrigger value="students">{e.phase === 'OPEN' ? 'Live monitor' : 'Students'}</TabsTrigger>
          {e.writtenQuestions > 0 && e.canManage && (
            <TabsTrigger value="marking">
              Marking{toMark > 0 && <span className="ml-1 rounded-full bg-warning-soft px-1.5 text-[11px] text-warning tabular">{toMark}</span>}
            </TabsTrigger>
          )}
          <TabsTrigger value="results">Results</TabsTrigger>
          {(e.canManage || e.offlineEnabled) && <TabsTrigger value="offline">Offline{e.offlineEnabled ? ' · on' : ''}</TabsTrigger>}
        </TabsList>
        <TabsContent value="students">
          <Roster e={e} fetchedAt={fetchedAt} />
        </TabsContent>
        {e.writtenQuestions > 0 && e.canManage && (
          <TabsContent value="marking">
            <MarkingPanel examId={e.id} />
          </TabsContent>
        )}
        <TabsContent value="results">
          <ResultsPanel examId={e.id} />
        </TabsContent>
        {(e.canManage || e.offlineEnabled) && (
          <TabsContent value="offline">
            <OfflinePanel e={e} />
          </TabsContent>
        )}
      </Tabs>

      {e.canManage && <ScheduleExamDialog open={editOpen} onOpenChange={setEditOpen} exam={e} started={started} />}
      <ConfirmDialog
        open={confirm === 'close'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Close the exam now?"
        description={e.counts.inProgress ? `${e.counts.inProgress} student${e.counts.inProgress === 1 ? ' is' : 's are'} still writing. They will be handed in with the answers saved so far.` : 'Nobody else will be able to start it.'}
        confirmLabel="Close exam"
        loading={action.isPending}
        onConfirm={() => action.mutate({ action: 'close' }, { onSettled: () => setConfirm(null) })}
      />
      <ConfirmDialog
        open={confirm === 'unpublish'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Move back to draft?"
        description="Students will no longer see it until you schedule it again."
        confirmLabel="Back to draft"
        destructive={false}
        loading={action.isPending}
        onConfirm={() => action.mutate({ action: 'unpublish' }, { onSettled: () => setConfirm(null) })}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this online exam?"
        description="The exam paper itself stays in Exams."
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => del.mutate(e.id, { onSuccess: () => navigate('/online-exams') })}
      />
    </Page>
  );
}

function Stat({ icon: Icon, label, value, sub, small }: { icon: typeof Clock; label: string; value: string; sub?: string; small?: boolean }) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Icon className="size-3.5 shrink-0" /> <span className="truncate">{label}</span>
      </p>
      <p className={cn('mt-1 font-display font-semibold tracking-tight tabular', small ? 'text-[14px] leading-snug' : 'text-xl')}>{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-muted-foreground">{sub}</p>}
    </Card>
  );
}

/** Seconds since the data was fetched, ticking every second, for live countdowns. */
function useElapsed(since: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return Math.max(0, Math.floor((now - since) / 1000));
}

function Roster({ e, fetchedAt }: { e: CbtExamDetail; fetchedAt: number }) {
  const live = e.roster.some((r) => r.status === 'IN_PROGRESS');
  const elapsed = useElapsed(fetchedAt, live);
  const [filter, setFilter] = useState<'all' | 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE'>('all');
  const rows = useMemo(
    () => e.roster.filter((r) => filter === 'all' || (filter === 'DONE' ? r.status === 'SUBMITTED' || r.status === 'MARKED' : r.status === filter)),
    [e.roster, filter],
  );
  const count = (f: typeof filter) => e.roster.filter((r) => f === 'all' || (f === 'DONE' ? r.status === 'SUBMITTED' || r.status === 'MARKED' : r.status === f)).length;

  if (!e.roster.length) {
    return (
      <Card>
        <EmptyState icon={Users} title="No students in these classes" description="Add students to the classes, or pick other classes." />
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        {(
          [
            ['all', 'Everyone'],
            ['IN_PROGRESS', 'Writing'],
            ['DONE', 'Handed in'],
            ['NOT_STARTED', 'Not started'],
          ] as const
        ).map(([f, label]) => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'ghost'} onClick={() => setFilter(f)} aria-pressed={filter === f}>
            {label} <span className="tabular opacity-70">{count(f)}</span>
          </Button>
        ))}
        {e.phase === 'OPEN' && <span className="ml-auto text-[12px] text-muted-foreground">Updates every 10 seconds</span>}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Answered</TableHead>
            <TableHead className="text-right">Time</TableHead>
            <TableHead className="text-right">Left screen</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead>Last seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <RosterRow key={r.student.id} r={r} e={e} elapsed={elapsed} />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function RosterRow({ r, e, elapsed }: { r: CbtRosterRow; e: CbtExamDetail; elapsed: number }) {
  const left = r.secondsLeft != null ? Math.max(0, r.secondsLeft - elapsed) : null;
  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{r.student.name}</p>
        <p className="text-[12px] text-muted-foreground">
          {r.student.admissionNumber}
          {r.student.classArm && e.classArms.length > 1 ? ` · ${r.student.classArm}` : ''}
        </p>
      </TableCell>
      <TableCell>
        <AttemptBadge status={r.status} written={e.writtenQuestions > 0} />
      </TableCell>
      <TableCell className="text-right tabular">{r.status === 'NOT_STARTED' ? '—' : `${r.answered}/${e.questionCount}`}</TableCell>
      <TableCell className="text-right tabular">
        {left != null ? <span className={cn('font-medium', left < 300 ? 'text-danger' : 'text-info')}>{clock(left)} left</span> : r.timeTakenSeconds != null ? minutesLabel(r.timeTakenSeconds) : '—'}
      </TableCell>
      <TableCell className={cn('text-right tabular', r.focusLosses >= 3 ? 'font-semibold text-danger' : r.focusLosses > 0 ? 'text-warning' : 'text-muted-foreground')}>{r.status === 'NOT_STARTED' ? '—' : r.focusLosses}</TableCell>
      <TableCell className="text-right tabular">
        {r.score != null ? (
          <>
            <span className="font-medium">
              {r.score}/{r.total}
            </span>
            <span className="ml-1.5 text-[12px] text-muted-foreground">{r.percent}%</span>
          </>
        ) : r.objectiveScore != null ? (
          <span className="text-muted-foreground" title="Objective part only; written answers still to mark">
            {r.objectiveScore}+
          </span>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-[12.5px] text-muted-foreground">{r.lastSeenAt ? formatRelative(r.lastSeenAt) : '—'}</TableCell>
    </TableRow>
  );
}
