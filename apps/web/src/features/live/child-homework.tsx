import { HOMEWORK_KIND_LABELS } from '@aischool/shared';
import { ChevronDown, ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { type ChildHomeworkRow, useChildHomework } from './api';
import { AttachmentList } from './files';
import { fmtScore, HandInBadge, SubmissionContent } from './handin';
import { dayLabel } from './ui';

/** A parent's read-only view of one child's homework: what's set, what's handed in, and marks. */
export function ChildHomework({ childId, first }: { childId: string; first: string }) {
  const q = useChildHomework(childId);
  const rows = q.data;
  const marked = rows?.filter((h) => h.mine?.status === 'GRADED' && h.mine.score != null && h.maxScore) ?? [];
  const average = marked.length ? Math.round((marked.reduce((t, h) => t + h.mine!.score! / h.maxScore!, 0) / marked.length) * 100) : null;
  const missed = rows?.filter((h) => h.overdue && !h.mine).length ?? 0;

  return (
    <section aria-label="Homework">
      <h2 className="mb-3 flex flex-wrap items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
        <ClipboardList className="size-4 text-muted-foreground" aria-hidden /> Homework
        {average != null && (
          <Badge variant="success" className="tabular">
            Average mark {average}%
          </Badge>
        )}
        {missed > 0 && <Badge variant="danger">{missed} not handed in</Badge>}
      </h2>
      {q.error && !rows ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : !rows ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-[13px] text-muted-foreground">No homework has been set for {first}’s class yet.</p>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {rows.map((h) => (
              <li key={h.id}>
                <Row h={h} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function Row({ h }: { h: ChildHomeworkRow }) {
  const [open, setOpen] = useState(false);
  const id = `chw-${h.id}`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium">{h.title}</span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {h.subject?.name ?? 'Homework'}
            {h.teacher && ` · ${h.teacher}`} · due {dayLabel(h.dueDate.slice(0, 10), { day: 'numeric', month: 'short' })}
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <HandInBadge mine={h.mine} overdue={h.overdue} maxScore={h.maxScore} />
            {h.mine?.late && h.mine.status !== 'SUBMITTED' && <Badge variant="warning">Late</Badge>}
            {h.kind !== 'QUESTIONS' && <Badge variant="outline">{HOMEWORK_KIND_LABELS[h.kind]}</Badge>}
          </span>
        </span>
        {h.mine?.status === 'GRADED' && h.mine.score != null && (
          <span className="shrink-0 text-right font-display text-[17px] font-semibold leading-tight tabular">
            {fmtScore(h.mine.score)}
            {h.maxScore != null && <span className="block text-[11px] font-normal text-muted-foreground">of {h.maxScore}</span>}
          </span>
        )}
        <ChevronDown className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div id={id} className="border-t border-border bg-muted/20 px-4 py-3">
          {h.mine?.feedback && (
            <div className="mb-3 rounded-xl border border-border bg-card px-3 py-2.5">
              <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">Teacher’s feedback</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed">{h.mine.feedback}</p>
            </div>
          )}
          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{h.instructions}</p>
          {h.questions.length > 0 && (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed marker:text-muted-foreground">
              {h.questions.map((q, i) => (
                <li key={i} className="break-words pl-1">
                  {q}
                </li>
              ))}
            </ol>
          )}
          <AttachmentList homeworkId={h.id} attachments={h.attachments} className="mt-3" />
          {h.mine && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                What was handed in · {dayLabel(h.mine.submittedAt.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' })}
                {h.mine.late ? ' (late)' : ''}
              </p>
              <SubmissionContent s={{ text: h.mine.text ?? null, files: h.mine.files ?? [], links: h.mine.links ?? [] }} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
