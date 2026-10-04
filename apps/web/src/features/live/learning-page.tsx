import type { MyLearning } from '@aischool/shared';
import { HOMEWORK_KIND_LABELS } from '@aischool/shared';
import { AlertTriangle, ArrowRight, BookOpenCheck, CalendarClock, ChevronDown, ClipboardList, Lightbulb, Paperclip, Video } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useMyLearning } from './api';
import { AttachmentList } from './files';
import { HandInBadge } from './handin';
import { addDays, dayLabel, JoinButton, LiveStatusBadge, NotesText, OpensHint, ProviderIcon, relativeDay, schoolDate, schoolToday, timeRange, useSchoolTz } from './ui';

type LiveItem = MyLearning['liveClasses'][number];
type HomeworkItem = MyLearning['homework'][number];
type SummaryItem = MyLearning['summaries'][number];

const names = (list: string[]) => (list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

export default function LearningPage() {
  const q = useMyLearning();
  const d = q.data;
  const family = !!d && [...d.liveClasses, ...d.homework].some((x) => x.children.length > 0);
  const empty = !!d && d.liveClasses.length === 0 && d.homework.length === 0 && d.summaries.length === 0;

  return (
    <Page className="max-w-5xl">
      <PageHeader
        title="My learning"
        description={family ? 'Live classes, homework and class notes for your children.' : 'Your live classes, homework and notes from your lessons.'}
      />
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <div className="space-y-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-20 w-full rounded-2xl" />
            </div>
          ))}
        </div>
      ) : empty ? (
        <Card>
          <EmptyState
            icon={BookOpenCheck}
            title="Nothing here yet"
            description="When teachers schedule live classes, set homework or share notes from a lesson, you’ll find them here."
          />
        </Card>
      ) : (
        <div className="space-y-8">
          <LiveSection items={d.liveClasses} />
          <HomeworkSection items={d.homework} />
          <SummariesSection items={d.summaries} />
        </div>
      )}
    </Page>
  );
}

function Heading({ icon: Icon, title, count }: { icon: typeof Video; title: string; count?: number }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
      <Icon className="size-4 text-muted-foreground" aria-hidden /> {title}
      {count != null && count > 0 && <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium tabular text-muted-foreground">{count}</span>}
    </h2>
  );
}

// ------------------------------------------------------------------ live classes

function LiveSection({ items }: { items: LiveItem[] }) {
  const tz = useSchoolTz();
  const today = schoolToday(tz);
  return (
    <section aria-label="Live classes">
      <Heading icon={Video} title="Live classes" count={items.length} />
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-[13px] text-muted-foreground">No live classes in the next two weeks.</p>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {items.map((c) => (
              <li key={c.id} className={cn('flex items-center gap-3 px-4 py-3', c.status === 'LIVE' && 'bg-danger-soft/30')}>
                <ProviderIcon provider={c.provider} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{c.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted-foreground">
                    <span className="font-medium text-foreground/80">{relativeDay(schoolDate(c.startsAt, tz), today)}</span>
                    <span className="tabular">{timeRange(c, tz)}</span>
                    {c.teacher && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{c.teacher.name}</span>
                      </>
                    )}
                    {c.children.length > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">for {names(c.children)}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {c.canJoin ? <JoinButton liveClass={{ ...c, canHost: false }} label="Join class" /> : <LiveStatusBadge status={c.status} />}
                  {c.status === 'SCHEDULED' && c.children.length === 0 && <OpensHint startsAt={c.startsAt} />}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ homework

function HomeworkSection({ items }: { items: HomeworkItem[] }) {
  const tz = useSchoolTz();
  const today = schoolToday(tz);
  // Due soonest first; anything past its date goes last.
  const sorted = useMemo(() => {
    const upcoming = items.filter((h) => !h.overdue).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const past = items.filter((h) => h.overdue).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
    return [...upcoming, ...past];
  }, [items]);
  return (
    <section aria-label="Homework">
      <Heading icon={ClipboardList} title="Homework" count={items.filter((h) => !h.overdue).length} />
      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-[13px] text-muted-foreground">No homework right now.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((h) => (
            <li key={h.id}>
              <HomeworkCard h={h} today={today} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HomeworkCard({ h, today }: { h: HomeworkItem; today: string }) {
  const [open, setOpen] = useState(false);
  const due = h.dueDate.slice(0, 10);
  const id = `hw-${h.id}`;
  const soon = !h.overdue && due <= addDays(today, 1);
  // Students get their own hand-in (or null); parents don't.
  const student = h.mine !== undefined;
  const todo = student && (!h.mine || h.mine.status === 'RETURNED') && (!h.overdue || h.allowLate);
  return (
    <Card className={cn('overflow-hidden', h.overdue && 'opacity-80')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className={cn('grid w-12 shrink-0 place-items-center rounded-xl border py-1.5 text-center leading-none', soon ? 'border-warning/40 bg-warning-soft/50' : 'border-border bg-card')} aria-hidden>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{dayLabel(due, { month: 'short' })}</span>
          <span className="mt-1 font-display text-[17px] font-semibold tabular">{dayLabel(due, { day: 'numeric' })}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{h.title}</span>
          <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
            {h.subject?.name ?? 'Homework'}
            {h.teacher && ` · ${h.teacher}`}
            {h.children.length > 0 && ` · for ${names(h.children)}`}
          </span>
          <span className="mt-2 flex flex-wrap gap-1.5">
            {h.overdue ? (
              <Badge variant="danger" className="gap-1">
                <AlertTriangle /> Past due
              </Badge>
            ) : (
              <Badge variant={soon ? 'warning' : 'outline'} className="gap-1">
                <CalendarClock /> Due {relativeDay(due, today) === 'Today' || relativeDay(due, today) === 'Tomorrow' ? relativeDay(due, today).toLowerCase() : dayLabel(due, { weekday: 'long', day: 'numeric', month: 'short' })}
              </Badge>
            )}
            {h.questions.length > 0 && <Badge variant="outline">{h.questions.length} {h.questions.length === 1 ? 'question' : 'questions'}</Badge>}
            {h.kind !== 'QUESTIONS' && <Badge variant="brand">{HOMEWORK_KIND_LABELS[h.kind]}</Badge>}
            {h.attachments.length > 0 && (
              <Badge variant="outline" className="gap-1">
                <Paperclip /> {h.attachments.length}
              </Badge>
            )}
            {student && <HandInBadge mine={h.mine} overdue={h.overdue} maxScore={h.maxScore} />}
          </span>
        </span>
        <ChevronDown className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div id={id} className="border-t border-border bg-muted/20 px-4 py-3.5 sm:pl-[76px]">
          <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{h.instructions}</p>
          {h.questions.length > 0 && (
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed marker:text-muted-foreground">
              {h.questions.map((q, i) => (
                <li key={i} className="break-words pl-1">
                  {q}
                </li>
              ))}
            </ol>
          )}
          <AttachmentList homeworkId={h.id} attachments={h.attachments} className="mt-3" />
          {student && h.mine?.status === 'GRADED' && h.mine.feedback && (
            <p className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-success/30 bg-success-soft/30 px-3 py-2 text-[13px] leading-relaxed">{h.mine.feedback}</p>
          )}
        </div>
      )}
      {student && (
        <div className={cn('flex justify-end border-t border-border px-4 py-2.5', todo && 'bg-brand-soft/20')}>
          <Button asChild size="sm" variant={todo ? 'default' : 'outline'}>
            <Link to={`/learning/homework/${h.id}`}>
              {todo ? (h.mine?.status === 'RETURNED' ? 'Redo and hand in' : 'Open and hand in') : 'Open'} <ArrowRight />
            </Link>
          </Button>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ summaries

function SummariesSection({ items }: { items: SummaryItem[] }) {
  return (
    <section aria-label="Class notes">
      <Heading icon={BookOpenCheck} title="Class notes" count={items.length} />
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-[13px] text-muted-foreground">When a teacher shares notes from a live class, they appear here.</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          {items.map((s) => (
            <li key={s.liveClassId}>
              <SummaryCard s={s} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SummaryCard({ s }: { s: SummaryItem }) {
  const [open, setOpen] = useState(false);
  const id = `notes-${s.liveClassId}`;
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ai-gradient shadow-[0_6px_20px_-8px_var(--ai-2)]">
          <AiSparkle className="size-4 [&_path]:fill-white" animated={false} />
        </span>
        <div className="min-w-0">
          <p className="text-[11.5px] text-muted-foreground">
            {dayLabel(s.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {s.classArm}
            {s.subject && ` · ${s.subject}`}
          </p>
          <h3 className="mt-0.5 font-display text-[15px] font-semibold leading-snug tracking-tight">{s.title}</h3>
        </div>
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed">{s.summary}</p>
      {s.keyConcepts.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Key concepts">
          {s.keyConcepts.map((k, i) => (
            <li key={i} className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-[12px] font-medium text-brand">
              <Lightbulb className="size-3" aria-hidden /> {k}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={id}
          className="inline-flex items-center gap-1 rounded text-[12.5px] font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? 'Hide revision notes' : 'Revision notes'}
          <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        {open && (
          <div id={id} className="mt-3 rounded-xl border border-border bg-muted/20 px-3.5 py-3">
            <NotesText text={s.revisionNotes} />
          </div>
        )}
      </div>
    </Card>
  );
}
