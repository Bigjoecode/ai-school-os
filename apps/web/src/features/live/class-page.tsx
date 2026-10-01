import { LIVE_PROVIDER_LABELS, type LiveAttendanceStatus, type LiveClassDetail, type LiveRecordingRow, type SyncResult } from '@aischool/shared';
import {
  AlertTriangle,
  AudioLines,
  BookOpen,
  CalendarDays,
  Check,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Film,
  KeyRound,
  MessageSquare,
  NotebookPen,
  Pencil,
  RefreshCw,
  Upload,
  User,
  Users,
  Video,
  XCircle,
} from 'lucide-react';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CopyButton } from '../finance/ui';
import { Segmented, timeOf } from '../operations/ui';
import { BackLink, DetailSkeleton } from '../planning/ui';
import { useCancelLiveClass, useLiveClass, useMarkLiveAttendance, useSaveTranscript, useSyncLiveClass } from './api';
import { IntelligencePanel } from './intelligence-panel';
import { ScheduleSheet } from './schedule-dialogs';
import { attendancePct, dayLabel, formatDuration, JoinButton, LiveStatusBadge, OpensHint, ProviderIcon, schoolDate, timeRange, useSchoolTz } from './ui';

type Tab = 'summary' | 'attendance' | 'recordings' | 'transcript';
const TABS: Tab[] = ['summary', 'attendance', 'recordings', 'transcript'];

export default function LiveClassPage() {
  const { id } = useParams();
  const q = useLiveClass(id);
  const [params, setParams] = useSearchParams();
  const c = q.data;
  const fromParam = params.get('tab') as Tab | null;
  const tab: Tab = fromParam && TABS.includes(fromParam) ? fromParam : c?.status === 'LIVE' ? 'attendance' : 'summary';

  if (q.error && !c) {
    return (
      <Page className="max-w-6xl">
        <BackLink to="/live">Live classes</BackLink>
        <ErrorState className="mt-6" error={q.error} onRetry={() => void q.refetch()} />
      </Page>
    );
  }
  if (!c) {
    return (
      <Page className="max-w-6xl">
        <DetailSkeleton />
      </Page>
    );
  }

  const marked = c.attendanceList.filter((a) => a.status).length;
  return (
    <Page className="max-w-6xl">
      <BackLink to="/live">Live classes</BackLink>
      <Header c={c} />
      <Tabs value={tab} onValueChange={(t) => setParams({ tab: t }, { replace: true })}>
        <TabsList aria-label="Class sections">
          <TabsTrigger value="summary">
            <AiSparkle className="size-3.5" animated={false} /> AI summary
          </TabsTrigger>
          <TabsTrigger value="attendance">
            <Users /> Attendance
            {marked > 0 && <span className="rounded-full bg-muted px-1.5 text-[10.5px] tabular">{marked}</span>}
          </TabsTrigger>
          <TabsTrigger value="recordings">
            <Film /> Recordings
            {c.recordingList.length > 0 && <span className="rounded-full bg-muted px-1.5 text-[10.5px] tabular">{c.recordingList.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="transcript">
            <FileText /> Transcript &amp; notes
          </TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <IntelligencePanel c={c} onOpenTranscript={() => setParams({ tab: 'transcript' }, { replace: true })} />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceTab c={c} />
        </TabsContent>
        <TabsContent value="recordings">
          <RecordingsTab c={c} />
        </TabsContent>
        <TabsContent value="transcript">
          <TranscriptTab c={c} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

// ------------------------------------------------------------------ header

function Header({ c }: { c: LiveClassDetail }) {
  const tz = useSchoolTz();
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const cancel = useCancelLiveClass();
  const open = c.status === 'SCHEDULED' || c.status === 'LIVE';
  const date = schoolDate(c.startsAt, tz);
  const pct = attendancePct(c.attendance);

  return (
    <>
      <PageHeader
        className="mt-3 sm:mb-6"
        title={c.title}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <LiveStatusBadge status={c.status} />
            <span className="inline-flex items-center gap-1.5">
              <ProviderIcon provider={c.provider} size="sm" />
              {LIVE_PROVIDER_LABELS[c.provider]}
            </span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" aria-hidden /> {dayLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            <span className="inline-flex items-center gap-1.5 tabular">
              <Clock className="size-3.5" aria-hidden /> {timeRange(c, tz)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" aria-hidden /> {c.classArm.name}
              {c.subject && ` · ${c.subject.name}`}
            </span>
            {c.teacher && (
              <span className="inline-flex items-center gap-1.5">
                <User className="size-3.5" aria-hidden /> {c.teacher.name}
              </span>
            )}
          </span>
        }
        actions={
          c.canHost && open ? (
            <>
              <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setCancelling(true)}>
                <XCircle /> Cancel class
              </Button>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
            </>
          ) : undefined
        }
      />

      {open && (
        <Card className={cn('mb-6 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5', c.status === 'LIVE' && 'border-danger/30 bg-danger-soft/20')}>
          <ProviderIcon provider={c.provider} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-semibold tracking-tight">{c.status === 'LIVE' ? (c.canHost ? 'Your class is open' : 'This class is on now') : 'The room opens ten minutes before the start'}</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {c.canHost
                ? c.provider === 'ZOOM'
                  ? 'Start opens Zoom as the host. Students join from their portal and are marked present when they do.'
                  : 'Students join from their portal and are marked present (or late) when they do.'
                : 'Students join from their portal.'}
            </p>
            <InfoLine c={c} />
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
            {c.status === 'LIVE' ? <JoinButton liveClass={c} size="lg" /> : <OpensHint startsAt={c.startsAt} />}
          </div>
        </Card>
      )}

      {c.status === 'CANCELLED' && (
        <p className="mb-6 flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-[13px] text-muted-foreground">
          <XCircle className="size-4 shrink-0" aria-hidden /> This class was cancelled. Students no longer see it.
        </p>
      )}

      {c.status === 'ENDED' && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 [&>*]:min-w-0">
          <Stat label="Attended" value={pct == null ? '—' : `${pct}%`} note={c.attendance ? `${c.attendance.present + c.attendance.late} of ${c.attendance.expected || c.attendanceList.length}` : 'Not marked yet'} />
          <Stat label="Late" value={c.attendance ? String(c.attendance.late) : '—'} note="joined after 10 min" />
          <Stat label="Recordings" value={String(c.recordingList.length)} note={c.syncedAt ? `Fetched ${formatRelative(c.syncedAt)}` : 'Not fetched yet'} />
          <Stat label="Transcript" value={c.transcript ? `${c.transcript.words.toLocaleString()}` : '—'} note={c.transcript ? 'words' : 'None yet'} />
        </div>
      )}

      {(c.agenda || c.lessonPlan) && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          {c.agenda && (
            <Card className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Agenda</p>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{c.agenda}</p>
            </Card>
          )}
          {c.lessonPlan && (
            <Link to={`/lessons/${c.lessonPlan.id}`} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="flex h-full items-center gap-3 p-4 transition-colors group-hover:border-border-strong">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                  <BookOpen className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Lesson plan</span>
                  <span className="block truncate text-[13.5px] font-medium">{c.lessonPlan.topic}</span>
                </span>
                <ExternalLink className="size-4 text-muted-foreground" aria-hidden />
              </Card>
            </Link>
          )}
        </div>
      )}

      <ScheduleSheet open={editing} onOpenChange={setEditing} liveClass={c} />
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this live class?"
        description="The meeting is cancelled with the meeting service and students no longer see it. This can’t be undone — you can schedule a new one."
        confirmLabel="Cancel class"
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate(c.id, { onSuccess: () => setCancelling(false) })}
      />
    </>
  );
}

function InfoLine({ c }: { c: LiveClassDetail }) {
  const { meetingCode, passcode } = c.providerInfo;
  if (!meetingCode && !passcode && !(c.canHost && c.joinUrl)) return null;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]">
      {meetingCode && (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-muted-foreground">Meeting code</span>
          <span className="font-mono font-medium">{meetingCode}</span>
          <CopyButton text={meetingCode} label="meeting code" />
        </span>
      )}
      {passcode && (
        <span className="inline-flex items-center gap-1.5">
          <KeyRound className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">Passcode</span>
          <span className="font-mono font-medium">{passcode}</span>
          <CopyButton text={passcode} label="passcode" />
        </span>
      )}
      {c.canHost && c.joinUrl && (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span className="text-muted-foreground">Student link</span>
          <span className="max-w-[16rem] truncate font-mono text-[12px]">{c.joinUrl}</span>
          <CopyButton text={c.joinUrl} label="student link" />
        </span>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card className="p-4">
      <p className="truncate text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-[22px] font-semibold leading-none tracking-tight tabular">{value}</p>
      <p className="mt-1 truncate text-[11.5px] text-muted-foreground">{note}</p>
    </Card>
  );
}

// ------------------------------------------------------------------ attendance

const MARKS: { value: LiveAttendanceStatus; label: string; on: string }[] = [
  { value: 'PRESENT', label: 'Present', on: 'border-success bg-success text-white' },
  { value: 'LATE', label: 'Late', on: 'border-warning bg-warning text-white' },
  { value: 'ABSENT', label: 'Absent', on: 'border-danger bg-danger text-white' },
];

const SOURCE_LABEL: Record<string, string> = { PORTAL: 'Joined in app', PROVIDER: 'From meeting', MANUAL: 'Marked by hand' };

function AttendanceTab({ c }: { c: LiveClassDetail }) {
  const save = useMarkLiveAttendance(c.id);
  const sync = useSyncLiveClass(c.id);
  const [draft, setDraft] = useState<Record<string, LiveAttendanceStatus>>({});
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [filter, setFilter] = useState<'all' | 'unmarked'>('all');
  const canEdit = c.canHost && c.status !== 'CANCELLED' && c.status !== 'SCHEDULED';

  // Drop draft marks once the server agrees with them.
  useEffect(() => {
    setDraft((d) => {
      const next = { ...d };
      for (const a of c.attendanceList) if (next[a.studentId] === a.status) delete next[a.studentId];
      return next;
    });
  }, [c.attendanceList]);

  const dirty = Object.keys(draft).length;
  const statusOf = (id: string, current: LiveAttendanceStatus | null) => draft[id] ?? current;
  const counts = useMemo(() => {
    const n = { PRESENT: 0, LATE: 0, ABSENT: 0, none: 0 };
    for (const a of c.attendanceList) {
      const s = draft[a.studentId] ?? a.status;
      if (s) n[s] += 1;
      else n.none += 1;
    }
    return n;
  }, [c.attendanceList, draft]);
  const list = filter === 'unmarked' ? c.attendanceList.filter((a) => !statusOf(a.studentId, a.status)) : c.attendanceList;

  const markRest = (status: LiveAttendanceStatus) =>
    setDraft((d) => {
      const next = { ...d };
      for (const a of c.attendanceList) if (!(d[a.studentId] ?? a.status)) next[a.studentId] = status;
      return next;
    });

  if (c.attendanceList.length === 0) {
    return <EmptyState icon={Users} title="No students in this class" description="Add students to the class in Students, and they’ll show here." />;
  }

  return (
    <div className="space-y-4">
      {c.canHost && c.provider !== 'EXTERNAL' && c.status !== 'SCHEDULED' && c.status !== 'CANCELLED' && (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium">Fetch attendance from {LIVE_PROVIDER_LABELS[c.provider]}</p>
            <p className="text-[12.5px] text-muted-foreground">
              Matches people in the meeting to students by name, and pulls recordings and the transcript.
              {c.syncedAt && ` Last fetched ${formatRelative(c.syncedAt)}.`}
            </p>
          </div>
          <Button
            variant="outline"
            loading={sync.isPending}
            onClick={() => sync.mutate(undefined, { onSuccess: setSyncResult, onError: (err) => setSyncResult({ message: errorMessage(err), attendanceMatched: 0, attendanceUnmatched: [], recordings: 0, transcript: false }) })}
            className="shrink-0"
          >
            {!sync.isPending && <RefreshCw />} Fetch from {c.provider === 'GOOGLE_MEET' ? 'Meet' : c.provider === 'ZOOM' ? 'Zoom' : 'BBB'}
          </Button>
        </Card>
      )}
      {syncResult && (
        <div role="status" className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-[13px]">
          <p className="font-medium">{syncResult.message}</p>
          {syncResult.attendanceUnmatched.length > 0 && (
            <div className="mt-2">
              <p className="text-[12.5px] text-muted-foreground">Couldn’t match these names to students — mark them by hand below:</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {syncResult.attendanceUnmatched.map((n) => (
                  <Badge key={n} variant="warning">
                    {n}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
          <Badge variant="success">{counts.PRESENT} present</Badge>
          <Badge variant="warning">{counts.LATE} late</Badge>
          <Badge variant="danger">{counts.ABSENT} absent</Badge>
          {counts.none > 0 && <Badge variant="outline">{counts.none} not marked</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && counts.none > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={() => markRest('PRESENT')}>
                <Check /> Rest present
              </Button>
              <Button size="sm" variant="outline" onClick={() => markRest('ABSENT')}>
                Rest absent
              </Button>
            </>
          )}
          <Segmented
            size="sm"
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Everyone' },
              { value: 'unmarked', label: 'Not marked', count: counts.none },
            ]}
          />
        </div>
      </div>

      {!c.canHost && <p className="text-[12.5px] text-muted-foreground">Only the class’s teacher (or a manager) can change attendance.</p>}

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <EmptyState compact icon={Check} title="Everyone’s marked" />
        ) : (
          <ul className="divide-y divide-border">
            {list.map((a) => {
              const s = statusOf(a.studentId, a.status);
              const changed = a.studentId in draft;
              return (
                <li key={a.studentId} className={cn('flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3', changed && 'bg-brand-soft/30')}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{a.name}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted-foreground">
                      <span className="font-mono">{a.admissionNumber}</span>
                      {a.joinedAt && <span>joined {timeOf(a.joinedAt)}</span>}
                      {a.minutes != null && <span>{a.minutes} min</span>}
                      {a.source && SOURCE_LABEL[a.source] && !changed && (
                        <span className="rounded-full border border-border px-1.5 leading-4">{SOURCE_LABEL[a.source]}</span>
                      )}
                    </p>
                  </div>
                  {canEdit ? (
                    <div role="radiogroup" aria-label={`Attendance for ${a.name}`} className="flex shrink-0 gap-1">
                      {MARKS.map((m) => {
                        const on = s === m.value;
                        return (
                          <button
                            key={m.value}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() =>
                              setDraft((d) => {
                                const next = { ...d };
                                if (a.status === m.value) delete next[a.studentId];
                                else next[a.studentId] = m.value;
                                return next;
                              })
                            }
                            className={cn(
                              'h-8 rounded-full border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              on ? m.on : 'border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                            )}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="shrink-0">
                      {s ? (
                        <Badge variant={s === 'PRESENT' ? 'success' : s === 'LATE' ? 'warning' : 'danger'}>{MARKS.find((m) => m.value === s)!.label}</Badge>
                      ) : (
                        <Badge variant="outline">Not marked</Badge>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {dirty > 0 && (
        <div className="sticky bottom-4 z-20 flex flex-col gap-2 rounded-2xl border border-border bg-popover/95 p-3 shadow-pop backdrop-blur sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 px-1 text-[13px]">
            <strong className="tabular">{dirty}</strong> unsaved {dirty === 1 ? 'change' : 'changes'}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraft({})}>
              Discard
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate(Object.entries(draft).map(([studentId, status]) => ({ studentId, status })))}>
              {!save.isPending && <Check />} Save attendance
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ recordings

const KIND: Record<LiveRecordingRow['kind'], { icon: typeof Video; label: string }> = {
  VIDEO: { icon: Video, label: 'Video' },
  AUDIO: { icon: AudioLines, label: 'Audio' },
  TRANSCRIPT: { icon: FileText, label: 'Transcript' },
  CHAT: { icon: MessageSquare, label: 'Chat' },
};

function RecordingsTab({ c }: { c: LiveClassDetail }) {
  if (c.recordingList.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Film}
          title="No recordings yet"
          description={
            c.provider === 'EXTERNAL'
              ? 'Meeting links can’t share recordings with us — paste a link to a recording in your notes if you have one.'
              : c.status === 'ENDED'
                ? `If the class was recorded, use “Fetch from ${c.provider === 'GOOGLE_MEET' ? 'Meet' : c.provider === 'ZOOM' ? 'Zoom' : 'BBB'}” on the Attendance tab. Meeting services can take a while to finish processing recordings.`
                : 'Recordings show here after the class, once the meeting service has processed them.'
          }
        />
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border">
        {c.recordingList.map((r) => {
          const k = KIND[r.kind];
          const dur = formatDuration(r.durationSeconds);
          return (
            <li key={r.id}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <k.icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{r.title}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {k.label}
                    {dur && ` · ${dur}`}
                    {r.startedAt && ` · ${timeOf(r.startedAt)}`}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-brand">
                  {r.kind === 'VIDEO' || r.kind === 'AUDIO' ? 'Watch' : 'Open'} <ExternalLink className="size-3.5" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ------------------------------------------------------------------ transcript & notes

const SOURCE_NAME = { PROVIDER: 'From the meeting service', UPLOAD: 'Uploaded', NOTES: 'Teacher’s notes' } as const;

function TranscriptTab({ c }: { c: LiveClassDetail }) {
  const hasTranscript = !!c.transcript && c.transcript.source !== 'NOTES';
  return (
    <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <FileText className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
              Transcript
              {hasTranscript && <Badge variant="success">{SOURCE_NAME[c.transcript!.source]}</Badge>}
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {hasTranscript ? `${c.transcript!.words.toLocaleString()} words — the AI summary is built from this.` : 'The best basis for the AI summary: what was actually said in class.'}
            </p>
          </div>
        </div>
        {hasTranscript && (
          <blockquote className="mt-4 max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/30 px-3.5 py-3 text-[13px] leading-relaxed text-muted-foreground scrollbar-thin">
            {c.transcript!.preview}
            {c.transcript!.preview.length >= 600 && '…'}
          </blockquote>
        )}
        {c.canHost && c.status !== 'SCHEDULED' && c.status !== 'CANCELLED' && <TranscriptUpload c={c} replacing={hasTranscript} />}
        {!c.canHost && !hasTranscript && <p className="mt-4 text-[12.5px] text-muted-foreground">No transcript for this class.</p>}
      </Card>
      <NotesCard c={c} />
    </div>
  );
}

function TranscriptUpload({ c, replacing }: { c: LiveClassDetail; replacing: boolean }) {
  const save = useSaveTranscript(c.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(!replacing);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 2_000_000) return setError('That file is too big — transcripts are usually under 1 MB.');
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ''));
      setFileName(f.name);
      setError(null);
      setOpen(true);
    };
    reader.onerror = () => setError('Couldn’t read that file.');
    reader.readAsText(f);
  };

  const submit = () => {
    if (text.trim().length < 20) return setError('Add a little more — at least a few sentences.');
    setError(null);
    save.mutate(
      { source: 'UPLOAD', text },
      {
        onSuccess: () => {
          setText('');
          setFileName(null);
          setOpen(false);
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  if (!open) {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Pencil /> Replace transcript
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-2.5 border-t border-border pt-4">
      <Field label={replacing ? 'Replace with' : 'Paste a transcript'} htmlFor="tr-text" hint="Plain text, or captions from a .vtt/.srt file — timestamps are removed for you.">
        <Textarea id="tr-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the transcript here…" invalid={!!error} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept=".vtt,.srt,.txt,text/plain,text/vtt" className="sr-only" onChange={onFile} aria-label="Upload a transcript file" tabIndex={-1} />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload /> Upload .vtt, .srt or .txt
        </Button>
        {fileName && (
          <span className="inline-flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
            <Download className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{fileName}</span>
          </span>
        )}
        <span className="flex-1" />
        {replacing && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        )}
        <Button type="button" size="sm" loading={save.isPending} onClick={submit} disabled={!text.trim()}>
          {!save.isPending && <Check />} Save transcript
        </Button>
      </div>
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-[12px] font-medium text-danger">
          <AlertTriangle className="size-3.5" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

function NotesCard({ c }: { c: LiveClassDetail }) {
  const save = useSaveTranscript(c.id);
  const [text, setText] = useState(c.teacherNotes ?? '');
  const [error, setError] = useState<string | null>(null);
  const editable = c.canHost && c.status !== 'SCHEDULED' && c.status !== 'CANCELLED';
  useEffect(() => setText(c.teacherNotes ?? ''), [c.teacherNotes]);
  const changed = text.trim() !== (c.teacherNotes ?? '').trim();

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
          <NotebookPen className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold tracking-tight">Your notes on the class</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">No transcript? A few lines on what you covered, questions students asked and what they found hard is enough for the AI.</p>
        </div>
      </div>
      {editable ? (
        <div className="mt-4 grid gap-2.5">
          <Textarea
            id="notes-text"
            aria-label="Your notes on the class"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={20_000}
            placeholder={'e.g. Covered elimination method with three worked examples. Most of the class got the first two; several struggled when both equations needed multiplying. Ada asked about word problems — revisit next lesson.'}
            invalid={!!error}
          />
          <div className="flex items-center gap-2">
            {error && (
              <p role="alert" className="min-w-0 flex-1 text-[12px] font-medium text-danger">
                {error}
              </p>
            )}
            <span className="flex-1" />
            <Button
              size="sm"
              loading={save.isPending}
              disabled={!changed}
              onClick={() => {
                if (text.trim().length < 20) return setError('Add a little more — at least a few sentences.');
                setError(null);
                save.mutate({ source: 'NOTES', text }, { onError: (err) => setError(errorMessage(err)) });
              }}
            >
              {!save.isPending && <Check />} Save notes
            </Button>
          </div>
        </div>
      ) : c.teacherNotes ? (
        <p className="mt-4 whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/30 px-3.5 py-3 text-[13.5px] leading-relaxed">{c.teacherNotes}</p>
      ) : (
        <p className="mt-4 text-[12.5px] text-muted-foreground">{c.status === 'SCHEDULED' ? 'Notes can be added once the class has started.' : 'No notes yet.'}</p>
      )}
    </Card>
  );
}
