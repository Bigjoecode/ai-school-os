import {
  type AiJobView,
  DIFFICULTIES,
  type Difficulty,
  generateQuestionsSchema,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  type QuestionCounts,
  type QuestionRow,
  type QuestionType,
  questionSchema,
} from '@aischool/shared';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { cn, titleCase } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { useGenerateQuestions, useQuestionTopics, useSaveQuestion } from '../assessment/api';
import { CountsEditor, countsTotal, LETTERS } from '../assessment/ui';
import { currentTerm } from '../planning/pickers';
import { useScheme, useSchemes } from '../schemes/api';

type Errors = Partial<Record<string, string>>;

function issuesToErrors(issues: { path: PropertyKey[]; message: string }[]): Errors {
  const out: Errors = {};
  for (const i of issues) {
    const key = i.path.map(String).join('.') || 'form';
    if (!out[key]) out[key] = i.message;
  }
  return out;
}

// ------------------------------------------------------------------ add / edit

interface Draft {
  topic: string;
  type: QuestionType;
  difficulty: Difficulty;
  stem: string;
  options: string[];
  correctIndex: number | null;
  answer: string;
  markingGuide: string;
  marks: number;
  status: QuestionRow['status'];
}

const emptyDraft = (topic = ''): Draft => ({
  topic,
  type: 'MULTIPLE_CHOICE',
  difficulty: 'MEDIUM',
  stem: '',
  options: ['', '', '', ''],
  correctIndex: null,
  answer: '',
  markingGuide: '',
  marks: 1,
  status: 'APPROVED',
});

const fromRow = (q: QuestionRow): Draft => ({
  topic: q.topic,
  type: q.type,
  difficulty: q.difficulty,
  stem: q.stem,
  options: q.type === 'TRUE_FALSE' ? ['True', 'False'] : q.options,
  correctIndex: q.correctIndex,
  answer: q.answer ?? '',
  markingGuide: q.markingGuide ?? '',
  marks: q.marks,
  status: q.status,
});

export function QuestionDialog({
  open,
  onOpenChange,
  question,
  subjectId,
  classLevelId,
  defaultTopic,
  topics,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question?: QuestionRow | null;
  subjectId?: string;
  classLevelId?: string;
  defaultTopic?: string;
  topics: string[];
}) {
  const save = useSaveQuestion();
  const [d, setD] = useState<Draft>(emptyDraft());
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (open) {
      setD(question ? fromRow(question) : emptyDraft(defaultTopic));
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, question?.id]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((prev) => ({ ...prev, [key]: value }));
  const objective = d.type === 'MULTIPLE_CHOICE' || d.type === 'TRUE_FALSE';

  const changeType = (type: QuestionType) => {
    setD((prev) => {
      if (type === prev.type) return prev;
      if (type === 'TRUE_FALSE') return { ...prev, type, options: ['True', 'False'], correctIndex: null, marks: prev.marks || 1 };
      if (type === 'MULTIPLE_CHOICE') {
        return { ...prev, type, options: prev.type === 'MULTIPLE_CHOICE' ? prev.options : ['', '', '', ''], correctIndex: null };
      }
      return { ...prev, type, options: [], correctIndex: null, marks: prev.marks < 2 ? (type === 'THEORY' ? 10 : 2) : prev.marks };
    });
  };

  const subject = question?.subject.id ?? subjectId;
  const level = question?.classLevel.id ?? classLevelId;

  const submit = () => {
    const parsed = questionSchema.safeParse({
      subjectId: subject ?? '',
      classLevelId: level ?? '',
      topic: d.topic,
      type: d.type,
      difficulty: d.difficulty,
      stem: d.stem,
      options: objective ? d.options.map((o) => o.trim()) : [],
      correctIndex: objective ? d.correctIndex : null,
      answer: d.answer,
      markingGuide: d.markingGuide,
      marks: d.marks,
      status: d.status,
    });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    save.mutate(
      { id: question?.id, input: parsed.data },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => {
          if (err instanceof ApiError && err.errors.length) setErrors(issuesToErrors(err.errors.map((e) => ({ path: e.path.split('.'), message: e.message }))));
          else toast.error(err.message);
        },
      },
    );
  };

  const optionError = errors.options ?? Object.entries(errors).find(([k]) => k.startsWith('options.'))?.[1];

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
            <DialogTitle>{question ? 'Edit question' : 'Add a question'}</DialogTitle>
            <DialogDescription>
              {question ? `${question.subject.name} · ${question.classLevel.name}` : 'Write it once, reuse it on every paper.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Topic" htmlFor="q-topic" error={errors.topic} className="sm:col-span-2">
                <Input
                  id="q-topic"
                  list="q-topic-list"
                  autoComplete="off"
                  value={d.topic}
                  invalid={!!errors.topic}
                  placeholder="e.g. Quadratic equations"
                  onChange={(e) => set('topic', e.target.value)}
                />
                <datalist id="q-topic-list">
                  {topics.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </Field>
              <Field label="Type" htmlFor="q-type">
                <Select value={d.type} onValueChange={(v) => changeType(v as QuestionType)}>
                  <SelectTrigger id="q-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUESTION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {QUESTION_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Difficulty" htmlFor="q-diff">
                  <Select value={d.difficulty} onValueChange={(v) => set('difficulty', v as Difficulty)}>
                    <SelectTrigger id="q-diff">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTIES.map((x) => (
                        <SelectItem key={x} value={x}>
                          {titleCase(x)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Marks" htmlFor="q-marks" error={errors.marks}>
                  <Input
                    id="q-marks"
                    type="number"
                    min={1}
                    max={50}
                    value={d.marks}
                    invalid={!!errors.marks}
                    onChange={(e) => set('marks', Number(e.target.value) || 0)}
                  />
                </Field>
              </div>
              <Field label="Question" htmlFor="q-stem" error={errors.stem} className="sm:col-span-2">
                <Textarea id="q-stem" rows={3} value={d.stem} aria-invalid={!!errors.stem || undefined} onChange={(e) => set('stem', e.target.value)} />
              </Field>
            </div>

            {objective && (
              <fieldset>
                <legend className="mb-1.5 text-[13px] font-medium">
                  Options <span className="font-normal text-muted-foreground">— select the correct one</span>
                </legend>
                <div role="radiogroup" aria-label="Correct option" className="space-y-2">
                  {d.options.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={d.correctIndex === i}
                        aria-label={`Option ${LETTERS[i]} is correct`}
                        onClick={() => set('correctIndex', i)}
                        className={cn(
                          'grid size-9 shrink-0 place-items-center rounded-lg border text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          d.correctIndex === i ? 'border-success bg-success text-white' : 'border-input bg-card text-muted-foreground hover:border-border-strong',
                        )}
                      >
                        {LETTERS[i]}
                      </button>
                      {d.type === 'TRUE_FALSE' ? (
                        <div className="flex h-10 flex-1 items-center rounded-lg border border-border bg-muted/40 px-3 text-sm">{o}</div>
                      ) : (
                        <>
                          <Input
                            aria-label={`Option ${LETTERS[i]}`}
                            value={o}
                            onChange={(e) => set('options', d.options.map((x, j) => (j === i ? e.target.value : x)))}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove option ${LETTERS[i]}`}
                            disabled={d.options.length <= 3}
                            onClick={() =>
                              setD((prev) => ({
                                ...prev,
                                options: prev.options.filter((_, j) => j !== i),
                                correctIndex:
                                  prev.correctIndex == null ? null : prev.correctIndex === i ? null : prev.correctIndex > i ? prev.correctIndex - 1 : prev.correctIndex,
                              }))
                            }
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                {d.type === 'MULTIPLE_CHOICE' && d.options.length < 6 && (
                  <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => set('options', [...d.options, ''])}>
                    <Plus /> Add option
                  </Button>
                )}
                {(optionError || errors.correctIndex) && (
                  <p role="alert" className="mt-1.5 text-[12px] font-medium text-danger">
                    {optionError ?? errors.correctIndex}
                  </p>
                )}
              </fieldset>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {!objective && (
                <Field label="Model answer / key points" htmlFor="q-answer" error={errors.answer} className="sm:col-span-2">
                  <Textarea id="q-answer" rows={3} value={d.answer} aria-invalid={!!errors.answer || undefined} onChange={(e) => set('answer', e.target.value)} />
                </Field>
              )}
              <Field label="Marking guide" htmlFor="q-guide" optional className="sm:col-span-2" error={errors.markingGuide}>
                <Textarea
                  id="q-guide"
                  rows={2}
                  value={d.markingGuide}
                  placeholder={objective ? 'Why this is the answer (optional)' : 'e.g. 2 marks for the formula, 3 for working, 1 for the answer'}
                  onChange={(e) => set('markingGuide', e.target.value)}
                />
              </Field>
              <Field label="Status" htmlFor="q-status" hint="Only approved questions are used when building papers.">
                <Select value={d.status} onValueChange={(v) => set('status', v as Draft['status'])}>
                  <SelectTrigger id="q-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                    {question && <SelectItem value="RETIRED">Retired</SelectItem>}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {(errors.subjectId || errors.classLevelId) && (
              <p role="alert" className="text-[12px] font-medium text-danger">
                Pick a subject and class first.
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {question ? 'Save changes' : 'Add question'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ generate

const DEFAULT_COUNTS: QuestionCounts = { multipleChoice: 10, trueFalse: 0, shortAnswer: 2, theory: 0 };

export function GenerateQuestionsDialog({
  open,
  onOpenChange,
  subjectId,
  classLevelId,
  defaultTopic,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId?: string;
  classLevelId?: string;
  defaultTopic?: string;
  onStarted: (job: AiJobView, topic: string) => void;
}) {
  const structure = useStructure();
  const generate = useGenerateQuestions();
  const [topic, setTopic] = useState('');
  const [counts, setCounts] = useState<QuestionCounts>(DEFAULT_COUNTS);
  const [difficulty, setDifficulty] = useState<'MIXED' | Difficulty>('MIXED');
  const [guidance, setGuidance] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (open) {
      setTopic(defaultTopic ?? '');
      setErrors({});
      setGuidance('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Suggestions: topics already in the bank + this term's scheme-of-work weeks.
  const bankTopics = useQuestionTopics(open ? subjectId : undefined, classLevelId);
  const schemes = useSchemes({ subjectId, classLevelId }, open && !!subjectId && !!classLevelId);
  const termId = currentTerm(structure.data)?.id;
  const schemeId = useMemo(() => {
    const list = (schemes.data ?? []).filter((s) => s.weekCount > 0 && s.status !== 'ARCHIVED');
    return (list.find((s) => s.term.id === termId) ?? list[0])?.id;
  }, [schemes.data, termId]);
  const scheme = useScheme(open ? schemeId : undefined);
  const schemeTopics = useMemo(() => (scheme.data?.weeks ?? []).map((w) => ({ label: `Wk ${w.week}`, topic: w.topic })), [scheme.data]);
  const existing = (bankTopics.data ?? []).map((t) => t.topic);
  const total = countsTotal(counts);

  const subjectName = structure.data?.subjects.find((s) => s.id === subjectId)?.name;
  const levelName = structure.data?.classLevels.find((l) => l.id === classLevelId)?.name;

  const submit = () => {
    const parsed = generateQuestionsSchema.safeParse({
      subjectId: subjectId ?? '',
      classLevelId: classLevelId ?? '',
      topic,
      counts,
      difficulty,
      guidance,
    });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    generate.mutate(parsed.data, {
      onSuccess: (job) => {
        onStarted(job, parsed.data.topic);
        onOpenChange(false);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const chip = (t: string, label?: string) => (
    <button
      key={`${label ?? ''}${t}`}
      type="button"
      onClick={() => setTopic(t)}
      className={cn(
        'max-w-full truncate rounded-full border px-2.5 py-0.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        topic === t ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
      )}
    >
      {label && <span className="mr-1 font-semibold">{label}</span>}
      {t}
    </button>
  );

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
            <div className="ai-border mb-2 grid size-10 place-items-center rounded-xl bg-card">
              <AiSparkle className="size-5" />
            </div>
            <DialogTitle>Generate questions with AI</DialogTitle>
            <DialogDescription>
              {subjectName && levelName ? (
                <>
                  For <span className="font-medium text-foreground">{subjectName}</span> ·{' '}
                  <span className="font-medium text-foreground">{levelName}</span>. They arrive as drafts for you to review and approve.
                </>
              ) : (
                'Pick a subject and class on the page first.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <Field label="Topic" htmlFor="gq-topic" error={errors.topic}>
              <Input
                id="gq-topic"
                autoComplete="off"
                list="gq-topic-list"
                value={topic}
                invalid={!!errors.topic}
                placeholder="e.g. Photosynthesis"
                onChange={(e) => setTopic(e.target.value)}
              />
              <datalist id="gq-topic-list">
                {[...new Set([...schemeTopics.map((s) => s.topic), ...existing])].map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            {(schemeTopics.length > 0 || existing.length > 0) && (
              <div className="-mt-2 space-y-2">
                {schemeTopics.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">From this term’s scheme of work</p>
                    <div className="scrollbar-thin flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">{schemeTopics.map((s) => chip(s.topic, s.label))}</div>
                  </div>
                )}
                {existing.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Already in the bank</p>
                    <div className="scrollbar-thin flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">{existing.map((t) => chip(t))}</div>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <p className="text-[13px] font-medium">How many of each?</p>
                <p className={cn('text-[12px] tabular', total < 1 || total > 40 ? 'text-danger' : 'text-muted-foreground')}>{total} of 40 max</p>
              </div>
              <CountsEditor idPrefix="gq" value={counts} onChange={setCounts} />
              {errors.counts && (
                <p role="alert" className="mt-1.5 text-[12px] font-medium text-danger">
                  {errors.counts}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Difficulty" htmlFor="gq-diff">
                <Select value={difficulty} onValueChange={(v) => setDifficulty(v as 'MIXED' | Difficulty)}>
                  <SelectTrigger id="gq-diff">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MIXED">Mixed (easy → hard)</SelectItem>
                    {DIFFICULTIES.map((x) => (
                      <SelectItem key={x} value={x}>
                        {titleCase(x)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Guidance for the AI" htmlFor="gq-guidance" optional className="sm:col-span-2" error={errors.guidance}>
                <Textarea
                  id="gq-guidance"
                  rows={3}
                  maxLength={1500}
                  value={guidance}
                  onChange={(e) => setGuidance(e.target.value)}
                  placeholder="e.g. Use Nigerian contexts and naira; include two calculation questions; WAEC style…"
                />
              </Field>
            </div>
            {(errors.subjectId || errors.classLevelId) && (
              <p role="alert" className="text-[12px] font-medium text-danger">
                Pick a subject and class first.
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="ai" loading={generate.isPending} disabled={!subjectId || !classLevelId}>
              {!generate.isPending && <Sparkles />} Generate {total > 0 ? total : ''} questions
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
