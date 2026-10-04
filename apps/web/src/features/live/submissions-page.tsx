import { HOMEWORK_KIND_LABELS, type SubmissionBoard, type SubmissionRow } from '@aischool/shared';
import { ArrowLeft, ChevronDown, ChevronRight, Inbox, RotateCcw, Save, Users } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useCan } from '@/lib/auth-store';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn, initialsFromName } from '@/lib/utils';
import { FormError, Segmented } from '../operations/ui';
import { useAiMark, useGradeSubmission, useSubmissionBoard } from './api';
import { fmtScore, HandInBadge, SubmissionContent } from './handin';
import { dayLabel } from './ui';

type Filter = 'TO_MARK' | 'GRADED' | 'RETURNED' | 'MISSING' | 'ALL';

/** A teacher's view of one assignment's hand-ins: who has and hasn't handed in, and marking. */
export default function SubmissionsPage() {
  const { id = '' } = useParams();
  const q = useSubmissionBoard(id);
  const d = q.data;
  const [filter, setFilter] = useState<Filter | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const counts = useMemo(() => {
    const s = d?.submissions ?? [];
    return {
      toMark: s.filter((x) => x.status === 'SUBMITTED').length,
      graded: s.filter((x) => x.status === 'GRADED').length,
      returned: s.filter((x) => x.status === 'RETURNED').length,
      missing: d?.missing.length ?? 0,
      handed: s.length,
    };
  }, [d]);
  // Start on whatever needs attention.
  const active: Filter = filter ?? (counts.toMark > 0 ? 'TO_MARK' : 'ALL');
  const rows = useMemo(() => {
    const s = d?.submissions ?? [];
    if (active === 'TO_MARK') return s.filter((x) => x.status === 'SUBMITTED');
    if (active === 'GRADED') return s.filter((x) => x.status === 'GRADED');
    if (active === 'RETURNED') return s.filter((x) => x.status === 'RETURNED');
    return s;
  }, [d, active]);
  const opened = d?.submissions.find((s) => s.id === openId) ?? null;
  // "Next" in the sheet follows the list on screen, then anything else still to mark.
  const nextId = useMemo(() => {
    if (!d || !openId) return null;
    const order = [...rows, ...d.submissions.filter((x) => x.status === 'SUBMITTED' && !rows.includes(x))];
    const i = order.findIndex((x) => x.id === openId);
    return order.slice(i + 1).find((x) => x.status === 'SUBMITTED')?.id ?? null;
  }, [d, rows, openId]);

  return (
    <Page className="max-w-5xl">
      <PageHeader
        eyebrow={
          <Link to="/homework" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Homework
          </Link>
        }
        title={d?.homework.title ?? 'Hand-ins'}
        description={
          d
            ? `${HOMEWORK_KIND_LABELS[d.homework.kind]} · due ${dayLabel(d.homework.dueDate, { weekday: 'short', day: 'numeric', month: 'short' })}${d.homework.maxScore != null ? ` · out of ${d.homework.maxScore}` : ''}`
            : undefined
        }
      />
      {q.error && !d ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : !d ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&>*]:min-w-0">
            <Stat label="Handed in" value={`${counts.handed}/${counts.handed + counts.missing}`} />
            <Stat label="To mark" value={counts.toMark} tone={counts.toMark ? 'warning' : undefined} />
            <Stat label="Marked" value={counts.graded} tone={counts.graded ? 'success' : undefined} />
            <Stat label="Not handed in" value={counts.missing} tone={counts.missing ? 'danger' : undefined} />
          </div>

          {d.homework.markingGuide && (
            <Card className="overflow-hidden">
              <button
                type="button"
                onClick={() => setGuideOpen((o) => !o)}
                aria-expanded={guideOpen}
                aria-controls="marking-guide"
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-medium transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">Marking guide <span className="font-normal text-muted-foreground">· only teachers see this</span></span>
                <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', guideOpen && 'rotate-180')} aria-hidden />
              </button>
              {guideOpen && (
                <p id="marking-guide" className="whitespace-pre-wrap break-words border-t border-border bg-muted/20 px-4 py-3 text-[13px] leading-relaxed">
                  {d.homework.markingGuide}
                </p>
              )}
            </Card>
          )}

          <Segmented
            label="Show"
            value={active}
            onChange={setFilter}
            options={[
              { value: 'TO_MARK', label: 'To mark', count: counts.toMark },
              { value: 'GRADED', label: 'Marked', count: counts.graded },
              { value: 'RETURNED', label: 'Returned', count: counts.returned },
              { value: 'MISSING', label: 'Not handed in', count: counts.missing },
              { value: 'ALL', label: 'All hand-ins', count: counts.handed },
            ]}
          />

          {active === 'MISSING' ? (
            <MissingList board={d} />
          ) : rows.length === 0 ? (
            <Card>
              <EmptyState
                icon={Inbox}
                compact
                title={active === 'TO_MARK' ? 'Nothing to mark' : active === 'GRADED' ? 'Nothing marked yet' : active === 'RETURNED' ? 'Nothing returned' : 'No hand-ins yet'}
                description={active === 'TO_MARK' && counts.handed ? 'You’re up to date with this assignment.' : 'Hand-ins appear here as students send them.'}
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {rows.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(s.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <Avatar name={s.student.name} initials={initialsFromName(s.student.name)} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">{s.student.name}</span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {formatRelative(s.submittedAt)}
                          {summary(s) && ` · ${summary(s)}`}
                        </span>
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          <HandInBadge mine={s} maxScore={d.homework.maxScore} />
                          {s.late && s.status !== 'SUBMITTED' && <Badge variant="warning">Late</Badge>}
                          {s.aiSuggestion && s.status === 'SUBMITTED' && (
                            <Badge variant="ai" className="tabular">
                              AI: {fmtScore(s.aiSuggestion.score)}/{s.aiSuggestion.outOf}
                            </Badge>
                          )}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {d && <MarkSheet board={d} row={opened} onClose={() => setOpenId(null)} onNext={nextId ? () => setOpenId(nextId) : undefined} />}
    </Page>
  );
}

function summary(s: SubmissionRow): string {
  const parts: string[] = [];
  if (s.text) parts.push('typed answer');
  const n = (kind: string) => s.files.filter((f) => f.mimeType.startsWith(kind)).length;
  const photos = n('image/');
  const videos = n('video/');
  const audio = n('audio/');
  const docs = s.files.length - photos - videos - audio;
  if (photos) parts.push(`${photos} ${photos === 1 ? 'photo' : 'photos'}`);
  if (videos) parts.push(`${videos} ${videos === 1 ? 'video' : 'videos'}`);
  if (audio) parts.push(`${audio} ${audio === 1 ? 'recording' : 'recordings'}`);
  if (docs) parts.push(`${docs} ${docs === 1 ? 'document' : 'documents'}`);
  if (s.links.length) parts.push(`${s.links.length} ${s.links.length === 1 ? 'link' : 'links'}`);
  return parts.join(', ');
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'warning' | 'success' | 'danger' }) {
  return (
    <Card className="p-3.5">
      <p className="truncate text-[11.5px] font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-display text-[22px] font-semibold leading-none tabular', tone === 'warning' && 'text-warning', tone === 'success' && 'text-success', tone === 'danger' && 'text-danger')}>{value}</p>
    </Card>
  );
}

function MissingList({ board }: { board: SubmissionBoard }) {
  if (!board.missing.length) {
    return (
      <Card>
        <EmptyState icon={Users} compact title="Everyone has handed in" description="Every student in the class has sent something." />
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border">
        {board.missing.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar name={m.name} initials={initialsFromName(m.name)} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium">{m.name}</span>
              <span className="block truncate text-[12px] tabular text-muted-foreground">{m.admissionNumber}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ------------------------------------------------------------------ marking

function MarkSheet({ board, row, onClose, onNext }: { board: SubmissionBoard; row: SubmissionRow | null; onClose: () => void; onNext?: () => void }) {
  const max = board.homework.maxScore;
  const grade = useGradeSubmission(board.homework.id);
  const ai = useAiMark(board.homework.id);
  const canAi = useCan('ai.use');
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const rowId = row?.id;

  useEffect(() => {
    if (!row) return;
    setScore(row.score != null ? String(row.score) : '');
    setFeedback(row.feedback ?? '');
    setErrors({});
    ai.reset();
    grade.reset();
    // Only when another hand-in is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId]);

  const save = (status: 'GRADED' | 'RETURNED') => (e?: FormEvent) => {
    e?.preventDefault();
    if (!row) return;
    const errs: Record<string, string> = {};
    const n = score.trim() === '' ? null : Number(score);
    if (n !== null && (!Number.isFinite(n) || n < 0)) errs.score = 'Enter a mark of 0 or more';
    else if (n !== null && max != null && n > max) errs.score = `The most is ${max}`;
    else if (n !== null && n > 1000) errs.score = 'The most is 1000';
    if (status === 'RETURNED' && !feedback.trim()) errs.feedback = 'Tell the student what to change';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    grade.mutate(
      { id: row.id, input: { score: status === 'RETURNED' ? null : n, feedback: feedback.trim() || null, status } },
      {
        onSuccess: () => (onNext ? onNext() : onClose()),
        onError: (err) => setErrors({ form: err instanceof Error ? err.message : 'Couldn’t save. Please try again.' }),
      },
    );
  };

  const sug = row?.aiSuggestion ?? null;
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">{row?.student.name ?? 'Hand-in'}</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">
            {row && (
              <>
                Handed in {formatDateTime(row.submittedAt)}
                {row.late && ' · late'}
                {row.gradedAt && ` · ${row.status === 'RETURNED' ? 'returned' : 'marked'} ${formatRelative(row.gradedAt)}`}
              </>
            )}
          </SheetDescription>
          {row && <HandInBadge mine={row} maxScore={max} className="mt-1 justify-self-start" />}
        </SheetHeader>
        <SheetBody>
          {row && (
            <div className="grid gap-5">
              <SubmissionContent s={row} />

              {canAi && (
                <section aria-label="AI suggestion" className="grid gap-2">
                  {sug ? (
                    <div className="rounded-xl border border-ai-2/30 bg-muted/30 p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-ai-gradient">
                          <AiSparkle className="size-3.5 [&_path]:fill-white" animated={false} />
                        </span>
                        <p className="min-w-0 flex-1 text-[13px] font-medium">
                          AI suggests <span className="tabular">{fmtScore(sug.score)}/{sug.outOf}</span>
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setScore(String(sug.score));
                            setFeedback(sug.feedback);
                            setErrors({});
                          }}
                        >
                          Use this
                        </Button>
                      </div>
                      {sug.reasons.length > 0 && (
                        <ul className="mt-2.5 list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed marker:text-muted-foreground">
                          {sug.reasons.map((r, i) => (
                            <li key={i} className="break-words">
                              {r}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-2.5 break-words text-[12.5px] italic leading-relaxed text-muted-foreground">“{sug.feedback}”</p>
                      <p className="mt-2 text-[11.5px] text-muted-foreground">Check it before you save — you decide the mark.</p>
                    </div>
                  ) : null}
                  <Button type="button" variant="outline" size="sm" className="justify-self-start" loading={ai.isPending} onClick={() => ai.mutate(row.id)}>
                    {!ai.isPending && <AiSparkle className="size-3.5" animated={false} />}
                    {sug ? 'Ask AI again' : 'Suggest a mark with AI'}
                  </Button>
                  {!sug && !row.text && !row.files.some((f) => f.mimeType.startsWith('image/')) && (
                    <p className="text-[12px] text-muted-foreground">AI can read typed answers and photos of written work. Videos, recordings and documents need you to mark them.</p>
                  )}
                </section>
              )}

              <form id="mark-form" onSubmit={save('GRADED')} noValidate className="grid gap-4 border-t border-border pt-4">
                <Field label={max != null ? `Mark (out of ${max})` : 'Mark'} htmlFor="mark-score" optional={max == null} error={errors.score}>
                  <div className="flex items-center gap-2">
                    <Input
                      id="mark-score"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={max ?? 1000}
                      step={0.5}
                      value={score}
                      onChange={(e) => setScore(e.target.value)}
                      className="w-28 tabular"
                      invalid={!!errors.score}
                    />
                    {max != null && <span className="text-[13px] tabular text-muted-foreground">/ {max}</span>}
                  </div>
                </Field>
                <Field label="Feedback to the student" htmlFor="mark-feedback" optional error={errors.feedback} hint="The student and their parents see this.">
                  <Textarea id="mark-feedback" rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={5000} invalid={!!errors.feedback} placeholder="What went well, and what to work on" />
                </Field>
                <FormError message={errors.form} />
              </form>
            </div>
          )}
        </SheetBody>
        <SheetFooter className="flex-wrap">
          <Button type="button" variant="outline" onClick={save('RETURNED')} disabled={grade.isPending} className="mr-auto">
            <RotateCcw /> Return to redo
          </Button>
          <Button type="submit" form="mark-form" loading={grade.isPending}>
            {!grade.isPending && <Save />} {onNext ? 'Save and next' : 'Save mark'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
