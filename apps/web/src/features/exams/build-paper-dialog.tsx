import {
  buildPaperSchema,
  DIFFICULTIES,
  type Difficulty,
  type Paginated,
  type QuestionCounts,
  type QuestionRow,
} from '@aischool/shared';
import { useQueries } from '@tanstack/react-query';
import { Check, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-client';
import { cn, titleCase } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { useAssessmentSettings, useBuildPaper, useQuestionTopics } from '../assessment/api';
import { COUNT_LABELS, COUNT_ROWS, CountsEditor, countsTotal } from '../assessment/ui';
import { currentTerm, LevelSelect, SubjectSelect, TermSelect } from '../planning/pickers';

type Errors = Partial<Record<string, string>>;

export interface BuildDefaults {
  subjectId?: string;
  classLevelId?: string;
  termId?: string;
}

export type Shortfall = Partial<Record<keyof QuestionCounts, number>>;

/** "Only 7 of 10 multiple-choice questions were available" lines. */
export function shortfallLines(shortfall: Shortfall | undefined, requested?: Partial<QuestionCounts>): string[] {
  if (!shortfall) return [];
  return (Object.entries(shortfall) as [keyof QuestionCounts, number][])
    .filter(([, n]) => n > 0)
    .map(([key, missing]) => {
      const want = requested?.[key];
      return want != null
        ? `Only ${want - missing} of ${want} ${COUNT_LABELS[key]} questions were available`
        : `${missing} ${COUNT_LABELS[key]} ${missing === 1 ? 'question was' : 'questions were'} not available`;
    });
}

export function BuildPaperDialog({ open, onOpenChange, defaults }: { open: boolean; onOpenChange: (open: boolean) => void; defaults?: BuildDefaults }) {
  const navigate = useNavigate();
  const structure = useStructure();
  const settings = useAssessmentSettings();
  const build = useBuildPaper();

  const [subjectId, setSubjectId] = useState<string | undefined>();
  const [classLevelId, setClassLevelId] = useState<string | undefined>();
  const [termId, setTermId] = useState<string | undefined>();
  const [componentKey, setComponentKey] = useState<string>('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [duration, setDuration] = useState(60);
  const [topics, setTopics] = useState<string[]>([]);
  const [counts, setCounts] = useState<QuestionCounts>({ multipleChoice: 20, trueFalse: 0, shortAnswer: 5, theory: 2 });
  const [difficulty, setDifficulty] = useState<'MIXED' | Difficulty>('MIXED');
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!open) return;
    setSubjectId(defaults?.subjectId);
    setClassLevelId(defaults?.classLevelId);
    setTermId(defaults?.termId ?? currentTerm(structure.data)?.id);
    const comps = settings.components;
    setComponentKey(comps[comps.length - 1]?.key ?? '');
    setTitle('');
    setInstructions('');
    setTopics([]);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => setTopics([]), [subjectId, classLevelId]);

  const topicCounts = useQuestionTopics(open ? subjectId : undefined, classLevelId);

  // Approved questions available per type, for the chosen topics.
  const scope = topics.length ? topics : [undefined];
  const availability = useQueries({
    queries: COUNT_ROWS.flatMap((r) =>
      scope.map((topic) => {
        const params = { subjectId, classLevelId, topic, type: r.type, status: 'APPROVED', page: 1, pageSize: 1 };
        return {
          queryKey: qk.questions(params),
          queryFn: ({ signal }: { signal: AbortSignal }) => api.get<Paginated<QuestionRow>>('/questions', params, signal),
          enabled: open && !!subjectId && !!classLevelId,
          staleTime: 30_000,
        };
      }),
    ),
  });
  const available = useMemo(() => {
    const out: Partial<Record<keyof QuestionCounts, number | null>> = {};
    COUNT_ROWS.forEach((r, i) => {
      const slice = availability.slice(i * scope.length, (i + 1) * scope.length);
      out[r.key] = slice.every((q) => q.data) ? slice.reduce((n, q) => n + (q.data?.total ?? 0), 0) : null;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability.map((q) => q.data?.total).join(','), scope.length]);

  const hints = Object.fromEntries(
    COUNT_ROWS.map((r) => {
      const n = available[r.key];
      if (!subjectId || !classLevelId) return [r.key, null];
      if (n == null) return [r.key, 'Checking the bank…'];
      const short = counts[r.key] > n;
      return [r.key, <span className={cn(short && 'text-warning')}>{n} approved available{short ? ` — only ${n} will be used` : ''}</span>];
    }),
  );

  const submit = () => {
    const parsed = buildPaperSchema.safeParse({
      subjectId: subjectId ?? '',
      classLevelId: classLevelId ?? '',
      termId: termId ?? '',
      componentKey,
      title,
      instructions,
      durationMinutes: duration,
      topics,
      counts,
      difficulty,
    });
    if (!parsed.success) {
      const out: Errors = {};
      for (const i of parsed.error.issues) out[String(i.path[0] ?? 'form')] ??= i.message;
      setErrors(out);
      return;
    }
    setErrors({});
    build.mutate(parsed.data, {
      onSuccess: (r) => {
        const lines = shortfallLines(r.shortfall, parsed.data.counts);
        if (lines.length) toast.warning('Paper built with fewer questions', { description: `${lines.join('. ')}.` });
        else toast.success('Exam paper built', { description: `${r.paper.questionCount} questions · ${r.paper.totalMarks} marks` });
        onOpenChange(false);
        navigate(`/exams/${r.paper.id}`, { state: { shortfall: r.shortfall, requested: parsed.data.counts } });
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const total = countsTotal(counts);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
              <FileText className="size-5" />
            </div>
            <DialogTitle>Build an exam paper</DialogTitle>
            <DialogDescription>We pick from your approved questions — objective questions in Section A, written ones in Section B.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Subject" htmlFor="bp-subject" error={errors.subjectId}>
                <SubjectSelect id="bp-subject" structure={structure.data} value={subjectId} onChange={setSubjectId} invalid={!!errors.subjectId} />
              </Field>
              <Field label="Class" htmlFor="bp-level" error={errors.classLevelId}>
                <LevelSelect id="bp-level" structure={structure.data} value={classLevelId} onChange={setClassLevelId} invalid={!!errors.classLevelId} />
              </Field>
              <Field label="Term" htmlFor="bp-term" error={errors.termId}>
                <TermSelect id="bp-term" structure={structure.data} value={termId} onChange={setTermId} invalid={!!errors.termId} />
              </Field>
              <Field label="Assessment" htmlFor="bp-comp" error={errors.componentKey}>
                <Select value={componentKey} onValueChange={setComponentKey}>
                  <SelectTrigger id="bp-comp" invalid={!!errors.componentKey}>
                    <SelectValue placeholder="Select assessment" />
                  </SelectTrigger>
                  <SelectContent>
                    {settings.components.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.name} (/{c.maxScore})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Title" htmlFor="bp-title" optional hint="Leave blank for e.g. “Mathematics — First Term Examination”.">
                <Input id="bp-title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Duration (minutes)" htmlFor="bp-duration" error={errors.durationMinutes}>
                <Input
                  id="bp-duration"
                  type="number"
                  min={10}
                  max={240}
                  step={5}
                  value={duration}
                  invalid={!!errors.durationMinutes}
                  onChange={(e) => setDuration(Number(e.target.value) || 0)}
                />
              </Field>
            </div>

            <div>
              <p className="mb-1.5 text-[13px] font-medium">
                Topics <span className="font-normal text-muted-foreground">— none selected means any topic</span>
              </p>
              {!subjectId || !classLevelId ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-3 text-[12.5px] text-muted-foreground">Pick a subject and class to see topics.</p>
              ) : topicCounts.isLoading ? (
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-7 w-28 rounded-full" />
                  ))}
                </div>
              ) : (topicCounts.data ?? []).length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-3 text-[12.5px] text-muted-foreground">
                  No questions in the bank for this subject and class yet.
                </p>
              ) : (
                <div className="scrollbar-thin flex max-h-40 flex-wrap gap-1.5 overflow-y-auto" role="group" aria-label="Topics">
                  {(topicCounts.data ?? []).map((t) => {
                    const on = topics.includes(t.topic);
                    return (
                      <button
                        key={t.topic}
                        type="button"
                        aria-pressed={on}
                        disabled={t.approved === 0 && !on}
                        onClick={() => setTopics(on ? topics.filter((x) => x !== t.topic) : [...topics, t.topic])}
                        className={cn(
                          'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40',
                          on ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
                        )}
                      >
                        {on && <Check className="size-3" />}
                        <span className="truncate">{t.topic}</span>
                        <span className="tabular opacity-70">{t.approved}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <p className="text-[13px] font-medium">Questions</p>
                <p className="text-[12px] tabular text-muted-foreground">{total} requested</p>
              </div>
              <CountsEditor idPrefix="bp" value={counts} onChange={setCounts} hints={hints} />
              {errors.counts && (
                <p role="alert" className="mt-1.5 text-[12px] font-medium text-danger">
                  {errors.counts}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Difficulty" htmlFor="bp-diff">
                <Select value={difficulty} onValueChange={(v) => setDifficulty(v as 'MIXED' | Difficulty)}>
                  <SelectTrigger id="bp-diff">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MIXED">Mixed</SelectItem>
                    {DIFFICULTIES.map((x) => (
                      <SelectItem key={x} value={x}>
                        {titleCase(x)} only
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Instructions" htmlFor="bp-instr" optional className="sm:col-span-2">
                <Textarea
                  id="bp-instr"
                  rows={3}
                  maxLength={2000}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Answer ALL questions in Section A and any THREE in Section B."
                />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={build.isPending}>
              Build paper
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
