import { type PaperDetail, type QuestionCounts, type QuestionRow, QUESTION_TYPE_LABELS } from '@aischool/shared';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FileText,
  KeyRound,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Pagination } from '@/components/ui/data-table';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { useDebounced, useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useDeletePaper, usePaper, useQuestions, useQuestionTopics, useUpdatePaper } from '../assessment/api';
import { AssessmentStatusBadge, DifficultyBadge, LETTERS, printAs, QuestionTypeBadge } from '../assessment/ui';
import { BackLink, DetailSkeleton } from '../planning/ui';
import { QuestionOptions } from '../questions/question-card';
import { type Shortfall, shortfallLines } from './build-paper-dialog';

type PaperQuestion = PaperDetail['sections'][number]['questions'][number];

export default function PaperDetailPage() {
  const { id = '' } = useParams();
  const query = usePaper(id);
  const p = query.data;

  if (query.isLoading) {
    return (
      <Page className="max-w-4xl">
        <DetailSkeleton />
      </Page>
    );
  }
  if (!p) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Page className="max-w-4xl">
        <BackLink to="/exams">Exams</BackLink>
        {notFound ? (
          <EmptyState icon={FileText} title="Exam paper not found" description="It may have been deleted." />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </Page>
    );
  }
  return <PaperView p={p} />;
}

function answerLines(q: QuestionRow): number {
  if (q.type === 'SHORT_ANSWER') return Math.min(4, Math.max(2, q.marks));
  return Math.min(14, Math.max(5, Math.round(q.marks * 1.2)));
}

function PaperView({ p }: { p: PaperDetail }) {
  useDocumentTitle(p.title);
  const navigate = useNavigate();
  const location = useLocation();
  const canManage = useCan('assessment.manage');
  const update = useUpdatePaper(p.id);
  const remove = useDeletePaper();
  const [showScheme, setShowScheme] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shortfall, setShortfall] = useState<{ lines: string[] } | null>(() => {
    const st = location.state as { shortfall?: Shortfall; requested?: Partial<QuestionCounts> } | null;
    const lines = shortfallLines(st?.shortfall, st?.requested);
    return lines.length ? { lines } : null;
  });

  // Don't show the build callout again after a reload/back.
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const final = p.status === 'FINAL';
  const editable = canManage && !final;
  const sectionIds = p.sections.map((s) => s.questions.map((q) => q.id));
  const allIds = sectionIds.flat();

  const setOrder = (ids: string[]) => update.mutate({ questionIds: ids });
  const move = (sectionIndex: number, index: number, delta: number) => {
    const next = sectionIds.map((ids) => [...ids]);
    const ids = next[sectionIndex];
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    setOrder(next.flat());
  };
  const drop = (qid: string) => setOrder(allIds.filter((x) => x !== qid));

  return (
    <Page className="max-w-4xl print:max-w-none print:p-0">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <BackLink to="/exams">Exams</BackLink>
        <div className="flex flex-wrap items-center gap-2">
          <label className="mr-1 inline-flex cursor-pointer items-center gap-2 text-[13px] font-medium">
            <Switch checked={showScheme} onCheckedChange={setShowScheme} aria-label="Show marking scheme" />
            <KeyRound className="size-3.5 text-muted-foreground" /> Marking scheme
          </label>
          {editable && (
            <Button variant="outline" onClick={() => setPickerOpen(true)}>
              <Plus /> Add questions
            </Button>
          )}
          <Button variant="outline" onClick={() => printAs('paper')}>
            <Printer /> Print
          </Button>
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => printAs('scheme')}>
                  <KeyRound /> Print marking scheme
                </DropdownMenuItem>
                {editable && (
                  <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                    <Pencil /> Edit details
                  </DropdownMenuItem>
                )}
                {final ? (
                  <DropdownMenuItem onSelect={() => update.mutate({ status: 'DRAFT' })}>
                    <Unlock /> Reopen for editing
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => update.mutate({ status: 'FINAL' })} disabled={allIds.length === 0}>
                    <Lock /> Mark as final
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 /> Delete paper
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!canManage && (
            <Button variant="outline" onClick={() => printAs('scheme')}>
              <KeyRound /> Print scheme
            </Button>
          )}
        </div>
      </div>

      {shortfall && (
        <div role="note" className="mb-5 flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-soft/60 p-4 print:hidden">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-medium">
              {shortfall.lines.join('. ')} — generate or approve more in the{' '}
              <Link to="/questions" className="font-semibold text-brand hover:underline">
                Question Bank
              </Link>
              .
            </p>
            <p className="mt-0.5 text-muted-foreground">You can add questions to this paper at any time.</p>
          </div>
          <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={() => setShortfall(null)}>
            <X />
          </Button>
        </div>
      )}

      {final && canManage && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-success/30 bg-success-soft/50 px-4 py-2.5 text-[13px] print:hidden">
          <CheckCircle2 className="size-4 text-success" /> This paper is final. Reopen it to make changes.
        </div>
      )}

      {/* ---------------------------------------------------- the paper */}
      <article className="print-exam-paper print-doc">
        <Card className="overflow-hidden print:border-0 print:shadow-none">
          <div aria-hidden className="h-1 w-full bg-gradient-to-r from-brand via-ai-2 to-ai-3 print:hidden" />
          <header className="border-b border-border px-5 pb-5 pt-6 text-center sm:px-10 print:px-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{p.schoolName}</p>
            <h1 className="mx-auto mt-2 max-w-2xl font-display text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px]">{p.title}</h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {p.term.name} · {p.term.sessionName}
              {p.component ? ` · ${p.component.name}` : ''}
            </p>
            <div className="mt-2 flex justify-center print:hidden">
              <AssessmentStatusBadge status={p.status} />
            </div>
            <dl className="mx-auto mt-5 grid max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-left sm:grid-cols-4 print:grid-cols-4">
              {(
                [
                  ['Subject', p.subject.name],
                  ['Class', p.classLevel.name],
                  ['Duration', `${p.durationMinutes} minutes`],
                  ['Total marks', String(p.totalMarks)],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="bg-card px-3 py-2">
                  <dt className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 truncate text-[13.5px] font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mx-auto mt-4 hidden max-w-2xl grid-cols-2 gap-6 text-left text-[13px] print:grid">
              <p>
                Name: <span className="inline-block w-56 border-b border-dotted border-foreground/50" />
              </p>
              <p>
                Admission no.: <span className="inline-block w-32 border-b border-dotted border-foreground/50" />
              </p>
            </div>
          </header>

          <div className="space-y-8 px-5 py-6 sm:px-10 print:px-0">
            {p.instructions && (
              <section className="rounded-xl border border-border bg-muted/40 px-4 py-3 print-avoid-break">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Instructions</p>
                <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed">{p.instructions}</p>
              </section>
            )}

            {allIds.length === 0 && (
              <EmptyState
                compact
                icon={FileText}
                title="No questions on this paper"
                description="Add approved questions from the bank."
                action={
                  editable && (
                    <Button size="sm" onClick={() => setPickerOpen(true)}>
                      <Plus /> Add questions
                    </Button>
                  )
                }
              />
            )}

            {p.sections.map((section, si) =>
              section.questions.length === 0 ? null : (
                <section key={section.key}>
                  <div className="mb-4 flex items-baseline justify-between gap-3 border-b-2 border-foreground/80 pb-1.5">
                    <h2 className="font-display text-[15px] font-bold uppercase tracking-[0.08em]">
                      Section {section.key} <span className="font-medium normal-case tracking-normal text-muted-foreground">— {section.title}</span>
                    </h2>
                    <span className="text-[12px] tabular text-muted-foreground">
                      {section.questions.reduce((n, q) => n + q.marks, 0)} marks
                    </span>
                  </div>
                  <ol className="space-y-5">
                    {section.questions.map((q, i) => (
                      <PaperItem
                        key={q.id}
                        q={q}
                        showScheme={showScheme}
                        editable={editable}
                        busy={update.isPending}
                        first={i === 0}
                        last={i === section.questions.length - 1}
                        onUp={() => move(si, i, -1)}
                        onDown={() => move(si, i, 1)}
                        onRemove={() => drop(q.id)}
                      />
                    ))}
                  </ol>
                </section>
              ),
            )}
            {allIds.length > 0 && <p className="pt-2 text-center text-[12px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">— End of paper —</p>}
          </div>
        </Card>
      </article>

      {/* ---------------------------------------------------- marking scheme (print only) */}
      <article className="print-marking-scheme hidden print:hidden">
        <header className="mb-5 border-b border-border pb-3 text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em]">{p.schoolName}</p>
          <h1 className="mt-1 font-display text-[20px] font-semibold">Marking scheme — {p.title}</h1>
          <p className="mt-1 text-[12.5px]">
            {p.subject.name} · {p.classLevel.name} · {p.term.name} {p.term.sessionName} · {p.totalMarks} marks
          </p>
        </header>
        {p.sections.map((s) =>
          s.questions.length === 0 ? null : (
            <section key={s.key} className="mb-5">
              <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider">Section {s.key}</h2>
              {s.key === 'A' ? (
                <table className="w-full border-collapse text-[12.5px]">
                  <tbody>
                    {chunk(s.questions, 5).map((row, ri) => (
                      <tr key={ri}>
                        {row.map((q) => (
                          <td key={q.id} className="border border-border px-2 py-1">
                            <span className="font-semibold">{q.number}.</span> {q.correctIndex != null ? LETTERS[q.correctIndex] : '—'}
                            {q.correctIndex != null && q.options[q.correctIndex] ? (
                              <span className="text-muted-foreground"> ({q.options[q.correctIndex]})</span>
                            ) : null}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <ol className="space-y-3 text-[12.5px]">
                  {s.questions.map((q) => (
                    <li key={q.id} className="print-avoid-break">
                      <p className="font-semibold">
                        {q.number}. <span className="font-normal">({q.marks} marks)</span>
                      </p>
                      {q.answer && <p className="mt-0.5 whitespace-pre-line">{q.answer}</p>}
                      {q.markingGuide && <p className="mt-0.5 whitespace-pre-line italic">{q.markingGuide}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ),
        )}
      </article>

      {editable && <EditDetailsDialog open={editOpen} onOpenChange={setEditOpen} p={p} />}
      {editable && (
        <QuestionPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          p={p}
          existing={allIds}
          onAdd={(ids) => update.mutate({ questionIds: [...allIds, ...ids] }, { onSuccess: () => setPickerOpen(false) })}
          pending={update.isPending}
        />
      )}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this exam paper?"
        description={`“${p.title}” will be deleted. Its questions stay in the bank.`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(p.id, {
            onSuccess: () => {
              setDeleteOpen(false);
              navigate('/exams');
            },
          })
        }
      />
    </Page>
  );
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function PaperItem({
  q,
  showScheme,
  editable,
  busy,
  first,
  last,
  onUp,
  onDown,
  onRemove,
}: {
  q: PaperQuestion;
  showScheme: boolean;
  editable: boolean;
  busy: boolean;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const objective = q.type === 'MULTIPLE_CHOICE' || q.type === 'TRUE_FALSE';
  return (
    <li className="group print-avoid-break relative flex gap-3">
      <span className="w-7 shrink-0 pt-px text-right font-display text-[14px] font-semibold tabular">{q.number}.</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 whitespace-pre-line text-[14px] leading-relaxed">{q.stem}</p>
          <span className="shrink-0 whitespace-nowrap pt-0.5 text-[12px] tabular text-muted-foreground">
            [{q.marks} {q.marks === 1 ? 'mark' : 'marks'}]
          </span>
        </div>
        {objective ? (
          <ol className={cn('mt-2 grid gap-x-6 gap-y-1 text-[13.5px]', q.options.length > 2 ? 'sm:grid-cols-2 print:grid-cols-2' : 'grid-cols-2')}>
            {q.options.map((o, i) => {
              const correct = showScheme && q.correctIndex === i;
              return (
                <li key={i} className={cn('flex gap-2 rounded-md px-1.5 py-0.5', correct && 'bg-success-soft font-medium text-success print:bg-transparent print:font-normal print:text-foreground')}>
                  <span className="font-semibold">{LETTERS[i]}.</span>
                  <span className="min-w-0">{o}</span>
                  {correct && <CheckCircle2 className="ml-auto mt-0.5 size-3.5 shrink-0 print:hidden" aria-label="Correct answer" />}
                </li>
              );
            })}
          </ol>
        ) : (
          <div aria-hidden className="mt-3 space-y-[22px] print:block">
            {Array.from({ length: answerLines(q) }).map((_, i) => (
              <div key={i} className="border-b border-dotted border-border-strong" />
            ))}
          </div>
        )}
        {showScheme && (q.answer || q.markingGuide || !objective) && (
          <div className="mt-3 rounded-xl border border-success/30 bg-success-soft/40 p-3 text-[13px] leading-relaxed print:hidden">
            {q.answer && (
              <p className="whitespace-pre-line">
                <span className="font-semibold text-success">Answer: </span>
                {q.answer}
              </p>
            )}
            {q.markingGuide && (
              <p className="mt-1 whitespace-pre-line text-muted-foreground">
                <span className="font-semibold text-foreground">Marking guide: </span>
                {q.markingGuide}
              </p>
            )}
          </div>
        )}
        {showScheme && (
          <div className="mt-2 flex flex-wrap gap-1.5 print:hidden">
            <QuestionTypeBadge type={q.type} />
            <DifficultyBadge difficulty={q.difficulty} />
            <Badge variant="outline">{q.topic}</Badge>
          </div>
        )}
      </div>
      {editable && (
        <div className="flex shrink-0 flex-col gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 print:hidden">
          <Button size="icon-sm" variant="ghost" aria-label={`Move question ${q.number} up`} disabled={first || busy} onClick={onUp}>
            <ArrowUp />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={`Move question ${q.number} down`} disabled={last || busy} onClick={onDown}>
            <ArrowDown />
          </Button>
          <Button size="icon-sm" variant="ghost" className="hover:text-danger" aria-label={`Remove question ${q.number}`} disabled={busy} onClick={onRemove}>
            <X />
          </Button>
        </div>
      )}
    </li>
  );
}

// ------------------------------------------------------------------ dialogs

function EditDetailsDialog({ open, onOpenChange, p }: { open: boolean; onOpenChange: (o: boolean) => void; p: PaperDetail }) {
  const update = useUpdatePaper(p.id);
  const [title, setTitle] = useState(p.title);
  const [instructions, setInstructions] = useState(p.instructions ?? '');
  const [duration, setDuration] = useState(p.durationMinutes);
  useEffect(() => {
    if (open) {
      setTitle(p.title);
      setInstructions(p.instructions ?? '');
      setDuration(p.durationMinutes);
    }
  }, [open, p]);
  const bad = !title.trim() || duration < 10 || duration > 240;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (bad) return;
            update.mutate({ title: title.trim(), instructions: instructions.trim(), durationMinutes: duration }, { onSuccess: () => onOpenChange(false) });
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit paper details</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label="Title" htmlFor="ep-title" error={!title.trim() ? 'Give the paper a title' : undefined}>
              <Input id="ep-title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Duration (minutes)" htmlFor="ep-duration" error={duration < 10 || duration > 240 ? 'Between 10 and 240 minutes' : undefined}>
              <Input id="ep-duration" type="number" min={10} max={240} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Instructions" htmlFor="ep-instr" optional>
              <Textarea id="ep-instr" rows={4} maxLength={2000} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={update.isPending} disabled={bad}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const PICK_PAGE = 15;

function QuestionPickerDialog({
  open,
  onOpenChange,
  p,
  existing,
  onAdd,
  pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  p: PaperDetail;
  existing: string[];
  onAdd: (ids: string[]) => void;
  pending: boolean;
}) {
  const [topic, setTopic] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setPicked([]);
      setSearch('');
      setTopic(undefined);
    }
  }, [open]);
  useEffect(() => setPage(1), [topic, q]);

  const topics = useQuestionTopics(open ? p.subject.id : undefined, p.classLevel.id);
  const list = useQuestions(
    { subjectId: p.subject.id, classLevelId: p.classLevel.id, status: 'APPROVED', topic, q: q || undefined, page, pageSize: PICK_PAGE },
    open,
  );
  const onPaper = useMemo(() => new Set(existing), [existing]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Add questions from the bank</DialogTitle>
          <DialogDescription>
            Approved {p.subject.name} questions for {p.classLevel.name}. Objective questions go to Section A, written ones to Section B.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2.5 px-6 pb-2 sm:flex-row">
          <SearchInput value={search} onChange={setSearch} placeholder="Search questions…" className="sm:flex-1" />
          <Select value={topic ?? NONE} onValueChange={(v) => setTopic(v === NONE ? undefined : v)}>
            <SelectTrigger className="sm:w-56" aria-label="Filter by topic">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All topics</SelectItem>
              {(topics.data ?? [])
                .filter((t) => t.approved > 0)
                .map((t) => (
                  <SelectItem key={t.topic} value={t.topic}>
                    {t.topic} ({t.approved})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <DialogBody className="space-y-2">
          {list.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
          ) : (list.data?.items ?? []).length === 0 ? (
            <EmptyState compact icon={FileText} title="No approved questions found" description="Approve drafts in the Question Bank, or try another topic." />
          ) : (
            (list.data?.items ?? []).map((row) => {
              const already = onPaper.has(row.id);
              const on = picked.includes(row.id);
              return (
                <label
                  key={row.id}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors',
                    already ? 'cursor-not-allowed border-border opacity-50' : on ? 'border-brand/50 bg-brand-soft/40' : 'border-border hover:border-border-strong',
                  )}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={already || on}
                    disabled={already}
                    onCheckedChange={(v) => setPicked(v === true ? [...picked, row.id] : picked.filter((x) => x !== row.id))}
                    aria-label={`Pick question: ${row.stem.slice(0, 60)}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <QuestionTypeBadge type={row.type} />
                      <DifficultyBadge difficulty={row.difficulty} />
                      <span className="text-[11.5px] text-muted-foreground">{row.topic}</span>
                      {already && <Badge variant="outline">On this paper</Badge>}
                      <span className="ml-auto text-[11.5px] tabular text-muted-foreground">{row.marks} marks</span>
                    </div>
                    <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-[13.5px]">{row.stem}</p>
                    {row.options.length > 0 && (
                      <div className="mt-2">
                        <QuestionOptions q={row} />
                      </div>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </DialogBody>
        {list.data && list.data.total > PICK_PAGE && (
          <Pagination page={page} pageSize={PICK_PAGE} total={list.data.total} onPageChange={setPage} noun="questions" />
        )}
        <DialogFooter>
          <p className="mr-auto hidden text-[12.5px] text-muted-foreground sm:block">
            {picked.length ? `${picked.length} selected · ${QUESTION_TYPE_LABELS.MULTIPLE_CHOICE.toLowerCase()} and true/false go to Section A` : 'Nothing selected'}
          </p>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onAdd(picked)} disabled={!picked.length} loading={pending}>
            Add {picked.length || ''} {picked.length === 1 ? 'question' : 'questions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
