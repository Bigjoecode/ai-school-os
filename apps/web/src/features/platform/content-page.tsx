import { EXAM_LABELS, EXAMS, examQuestionSchema, QUESTION_DIFFICULTIES, type ExamBody, type ExamQuestionInput, type ExamQuestionRow, type SyllabusTopicRow } from '@aischool/shared';
import { Archive, BookMarked, Check, FileJson, FilePen, ListTree, MoreHorizontal, Pencil, Plus, ScanSearch, Send, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable } from '@/components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { formatNumber, formatRelative } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { apiFieldErrors, FormError, plural, zodErrors } from '../operations/ui';
import { useAddTopic, useDeleteQuestion, useDraftQuestions, useImportQuestions, useQuestions, useSaveQuestion, useSetQuestionStatus, useTopics } from './commerce-api';
import { FilterSelect, Toolbar, useTabParam } from './ui';

type QStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
const TABS = ['questions', 'topics'] as const;
const STATUS: Record<QStatus, { label: string; variant: BadgeProps['variant'] }> = {
  DRAFT: { label: 'Draft', variant: 'warning' },
  PUBLISHED: { label: 'Published', variant: 'success' },
  RETIRED: { label: 'Retired', variant: 'outline' },
};
const SOURCE_LABEL = { LICENSED: 'Licensed', AUTHORED: 'Authored', AI_REVIEWED: 'AI draft' } as const;
const LEVELS = ['PRIMARY', 'JUNIOR', 'SENIOR'] as const;
const LEVEL_LABEL: Record<(typeof LEVELS)[number], string> = { PRIMARY: 'Primary', JUNIOR: 'Junior secondary', SENIOR: 'Senior secondary' };
const LETTERS = 'ABCDE';
const sameSubject = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const titleCase = (s: string) => s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());

export default function ContentPage() {
  const [tab, setTab] = useTabParam(TABS, 'questions');
  const [editing, setEditing] = useState<ExamQuestionRow | 'new' | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Exam content"
        description="The Exam Academy question bank behind BECE, WAEC, NECO and JAMB practice. Students only ever see published questions."
        actions={
          tab === 'questions' ? (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <FileJson /> Import
              </Button>
              <Button variant="outline" onClick={() => setDraftOpen(true)}>
                <Sparkles /> AI draft
              </Button>
              <Button onClick={() => setEditing('new')}>
                <Plus /> New question
              </Button>
            </>
          ) : (
            <Button onClick={() => setTopicOpen(true)}>
              <Plus /> Add topic
            </Button>
          )
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])}>
        <TabsList>
          <TabsTrigger value="questions">
            <ScanSearch /> Question bank
          </TabsTrigger>
          <TabsTrigger value="topics">
            <ListTree /> Syllabus topics
          </TabsTrigger>
        </TabsList>
        <TabsContent value="questions">
          <QuestionsTab onEdit={setEditing} />
        </TabsContent>
        <TabsContent value="topics">
          <TopicsTab />
        </TabsContent>
      </Tabs>
      <QuestionDialog question={editing} onOpenChange={(o) => !o && setEditing(null)} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <DraftDialog open={draftOpen} onOpenChange={setDraftOpen} />
      <TopicDialog open={topicOpen} onOpenChange={setTopicOpen} />
    </Page>
  );
}

// ------------------------------------------------------------------ questions

function QuestionsTab({ onEdit }: { onEdit: (q: ExamQuestionRow) => void }) {
  const [exam, setExam] = useState<string>();
  const [subject, setSubject] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 300);
  const bank = useQuestions({ exam, subject, status, q: q.trim() || undefined });
  const all = useQuestions({});
  const setStatusM = useSetQuestionStatus();
  const del = useDeleteQuestion();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<ExamQuestionRow | null>(null);
  const rows = bank.data?.rows;
  useEffect(() => setSelected(new Set()), [exam, subject, status, q]);

  const subjects = useMemo(() => [...new Set((all.data?.rows ?? []).map((r) => r.subject))].sort(), [all.data]);
  const summary = bank.data?.summary ?? [];
  const count = (e: string, s?: string) => summary.filter((x) => x.exam === e && (!s || x.status === s)).reduce((t, x) => t + x.count, 0);

  const bulk = (s: QStatus) =>
    setStatusM.mutate(
      { ids: [...selected], status: s },
      {
        onSuccess: (r) => {
          toast.success(`${plural(r.updated, 'question')} ${s === 'PUBLISHED' ? 'published' : s === 'RETIRED' ? 'retired' : 'moved to draft'}`);
          setSelected(new Set());
        },
      },
    );
  const allOn = !!rows?.length && rows.every((r) => selected.has(r.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const columns: Column<ExamQuestionRow>[] = [
    {
      key: 'sel',
      header: <Checkbox aria-label="Select all" checked={allOn ? true : selected.size ? 'indeterminate' : false} onCheckedChange={(v) => setSelected(v === true ? new Set(rows?.map((r) => r.id)) : new Set())} />,
      className: 'w-8',
      cell: (r) => <Checkbox aria-label="Select" checked={selected.has(r.id)} onClick={(e) => e.stopPropagation()} onCheckedChange={(v) => toggle(r.id, v === true)} />,
    },
    {
      key: 'stem',
      header: 'Question',
      cell: (r) => (
        <div className="min-w-0 max-w-[460px]">
          <p className="line-clamp-2 text-[13px]">{r.stem}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            Answer {LETTERS[r.answer]}: {r.options[r.answer]}
          </p>
        </div>
      ),
    },
    {
      key: 'exam',
      header: 'Exam',
      cell: (r) => (
        <div>
          <p className="whitespace-nowrap font-medium">{r.exam}</p>
          <p className="whitespace-nowrap text-[12px] text-muted-foreground">
            {titleCase(r.subject)}
            {r.year ? ` · ${r.year}` : ''}
          </p>
        </div>
      ),
    },
    { key: 'topic', header: 'Topic', cell: (r) => <p className="max-w-[160px] truncate text-[12.5px] text-muted-foreground">{r.topic ?? '—'}</p> },
    {
      key: 'meta',
      header: 'Source',
      cell: (r) => (
        <div>
          <p className="whitespace-nowrap text-[12.5px]">{SOURCE_LABEL[r.source]}</p>
          <p className="text-[11.5px] text-muted-foreground">{r.difficulty.toLowerCase()}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (r) => <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge> },
    { key: 'updated', header: 'Updated', cell: (r) => <span className="whitespace-nowrap text-[12px] text-muted-foreground">{formatRelative(r.updatedAt)}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-10 text-right',
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Question actions" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} className="w-44">
            <DropdownMenuItem onSelect={() => onEdit(r)}>
              <Pencil /> Edit
            </DropdownMenuItem>
            {r.status !== 'PUBLISHED' && (
              <DropdownMenuItem onSelect={() => setStatusM.mutate({ ids: [r.id], status: 'PUBLISHED' }, { onSuccess: () => toast.success('Published') })}>
                <Send /> Publish
              </DropdownMenuItem>
            )}
            {r.status === 'PUBLISHED' && (
              <DropdownMenuItem onSelect={() => setStatusM.mutate({ ids: [r.id], status: 'RETIRED' }, { onSuccess: () => toast.success('Retired') })}>
                <Archive /> Retire
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setDeleting(r)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        {EXAMS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setExam(exam === e ? undefined : e)}
            className={cn('rounded-2xl border bg-card p-4 text-left shadow-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', exam === e ? 'border-brand' : 'border-border hover:border-border-strong')}
          >
            <p className="truncate text-[12px] font-medium text-muted-foreground">{EXAM_LABELS[e]}</p>
            <p className="mt-1 font-display text-[22px] font-semibold tracking-tight tabular">{formatNumber(count(e, 'PUBLISHED'))}</p>
            <p className="text-[12px] text-muted-foreground">
              published · {formatNumber(count(e, 'DRAFT'))} draft · {formatNumber(count(e, 'RETIRED'))} retired
            </p>
          </button>
        ))}
      </div>
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search question text…" className="sm:w-64" />
          <FilterSelect label="Exam" value={exam} onChange={setExam} allLabel="All exams" options={EXAMS.map((e) => ({ value: e, label: EXAM_LABELS[e] }))} className="sm:w-[150px]" />
          <FilterSelect label="Subject" value={subject} onChange={setSubject} allLabel="All subjects" options={subjects.map((s) => ({ value: s, label: titleCase(s) }))} />
          <FilterSelect label="Status" value={status} onChange={setStatus} allLabel="Any status" options={(Object.keys(STATUS) as QStatus[]).map((s) => ({ value: s, label: STATUS[s].label }))} className="sm:w-[140px]" />
          {rows && <p className="text-[12.5px] text-muted-foreground tabular sm:ml-auto">{plural(rows.length, 'question')}{rows.length >= 500 ? ' (first 500)' : ''}</p>}
        </Toolbar>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-brand-soft/30 px-4 py-2.5">
            <p className="mr-auto text-[13px] font-medium">{plural(selected.size, 'question')} selected</p>
            <Button size="sm" onClick={() => bulk('PUBLISHED')} loading={setStatusM.isPending && setStatusM.variables?.status === 'PUBLISHED'}>
              <Check /> Publish
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk('DRAFT')}>
              <Undo2 /> To draft
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk('RETIRED')}>
              <Archive /> Retire
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={bank.isLoading || bank.isPlaceholderData}
          error={bank.error}
          onRetry={() => void bank.refetch()}
          onRowClick={onEdit}
          rowLabel={() => 'Edit question'}
          renderMobile={(r) => (
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[13.5px]">{r.stem}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {r.exam} · {titleCase(r.subject)}
                  {r.topic ? ` · ${r.topic}` : ''} · {SOURCE_LABEL[r.source]}
                </p>
              </div>
              <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
            </div>
          )}
          empty={{ icon: ScanSearch, title: 'No questions match', description: 'Try another filter, write a question, or import a batch.' }}
        />
      </Card>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this question?"
        description="Past attempts keep their copy. Retire it instead if it was ever published."
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => (toast.success('Question deleted'), setDeleting(null)) })}
      />
    </div>
  );
}

function TopicSelect({ id, subject, value, onChange, topics }: { id: string; subject: string; value: string; onChange: (v: string) => void; topics: SyllabusTopicRow[] | undefined }) {
  const options = (topics ?? []).filter((t) => sameSubject(t.subject, subject));
  return (
    <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">{subject ? (options.length ? 'No topic' : 'No topics for this subject') : 'Choose a subject first'}</SelectItem>
        {options.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name} <span className="text-muted-foreground">· {LEVEL_LABEL[t.level]}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ExamSelect({ id, value, onChange }: { id: string; value: ExamBody; onChange: (v: ExamBody) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ExamBody)}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {EXAMS.map((e) => (
          <SelectItem key={e} value={e}>
            {EXAM_LABELS[e]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SubjectInput({ id, value, onChange, subjects }: { id: string; value: string; onChange: (v: string) => void; subjects: string[] }) {
  return (
    <>
      <Input id={id} list={`${id}-list`} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Mathematics" />
      <datalist id={`${id}-list`}>
        {subjects.map((s) => (
          <option key={s} value={titleCase(s)} />
        ))}
      </datalist>
    </>
  );
}

function useSubjects() {
  const topics = useTopics();
  const all = useQuestions({});
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const s of [...(all.data?.rows ?? []).map((r) => r.subject), ...(topics.data ?? []).map((t) => t.subject)]) m.set(s.toLowerCase(), s);
    return [...m.values()].sort();
  }, [all.data, topics.data]);
}

function QuestionDialog({ question, onOpenChange }: { question: ExamQuestionRow | 'new' | null; onOpenChange: (o: boolean) => void }) {
  const save = useSaveQuestion();
  const topics = useTopics();
  const subjects = useSubjects();
  const existing = question && question !== 'new' ? question : null;
  const blank = { exam: 'WAEC' as ExamBody, subject: '', topicId: '', year: '', stem: '', options: ['', '', '', ''], answer: 0, explanation: '', difficulty: 'MEDIUM' as ExamQuestionInput['difficulty'], source: 'AUTHORED' as ExamQuestionInput['source'], status: 'DRAFT' as QStatus };
  const [v, setV] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!question) return;
    setErrors({});
    setV(
      existing
        ? { exam: existing.exam, subject: titleCase(existing.subject), topicId: existing.topicId ?? '', year: existing.year ? String(existing.year) : '', stem: existing.stem, options: [...existing.options], answer: existing.answer, explanation: existing.explanation ?? '', difficulty: existing.difficulty, source: existing.source, status: existing.status }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = examQuestionSchema.safeParse({ ...v, topicId: v.topicId || null, year: v.year ? Number(v.year) : null, options: v.options.map((o) => o.trim()) });
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      if (errs.options) errs.options = 'Fill in every option (2 to 5)';
      return setErrors(errs);
    }
    if (parsed.data.answer >= parsed.data.options.length) return setErrors({ answer: 'Mark one of the options as correct' });
    save.mutate(
      { id: existing?.id, body: parsed.data },
      {
        onSuccess: () => {
          toast.success(existing ? 'Question saved' : parsed.data.status === 'PUBLISHED' ? 'Question published' : 'Draft saved');
          onOpenChange(false);
        },
        onError: (err) => setErrors(apiFieldErrors(err)),
      },
    );
  };

  return (
    <FormDialog open={!!question} onOpenChange={onOpenChange} title={existing ? 'Edit question' : 'New question'} icon={<FilePen />} submitLabel={existing ? 'Save question' : 'Create question'} pending={save.isPending} onSubmit={submit} size="xl">
      <div className="grid gap-4">
        <FormError message={errors.form} />
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Exam" htmlFor="q-exam" error={errors.exam}>
            <ExamSelect id="q-exam" value={v.exam} onChange={(x) => set('exam', x)} />
          </Field>
          <Field label="Subject" htmlFor="q-subject" error={errors.subject} className="sm:col-span-2">
            <SubjectInput id="q-subject" value={v.subject} onChange={(x) => setV((p) => ({ ...p, subject: x, topicId: '' }))} subjects={subjects} />
          </Field>
          <Field label="Year" htmlFor="q-year" error={errors.year} optional>
            <Input id="q-year" type="number" min={1980} max={2100} value={v.year} onChange={(e) => set('year', e.target.value)} />
          </Field>
        </div>
        <Field label="Topic" htmlFor="q-topic" error={errors.topicId} optional>
          <TopicSelect id="q-topic" subject={v.subject} value={v.topicId} onChange={(x) => set('topicId', x)} topics={topics.data} />
        </Field>
        <Field label="Question" htmlFor="q-stem" error={errors.stem}>
          <Textarea id="q-stem" rows={3} value={v.stem} onChange={(e) => set('stem', e.target.value)} />
        </Field>
        <Field label="Options — select the correct answer" error={errors.options ?? errors.answer}>
          <div role="radiogroup" aria-label="Correct answer" className="grid gap-2">
            {v.options.map((o, i) => (
              <div key={i} className={cn('flex items-center gap-2 rounded-xl border p-1.5 pl-2.5', v.answer === i ? 'border-success bg-success-soft/40' : 'border-border')}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={v.answer === i}
                  aria-label={`Option ${LETTERS[i]} is correct`}
                  onClick={() => set('answer', i)}
                  className={cn('grid size-7 shrink-0 place-items-center rounded-full border text-[12px] font-semibold', v.answer === i ? 'border-success bg-success text-white' : 'border-border-strong text-muted-foreground hover:border-success')}
                >
                  {v.answer === i ? <Check className="size-3.5" /> : LETTERS[i]}
                </button>
                <Input aria-label={`Option ${LETTERS[i]}`} value={o} onChange={(e) => set('options', v.options.map((x, j) => (j === i ? e.target.value : x)))} className="border-0 bg-transparent shadow-none focus-visible:ring-0" />
                {v.options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove option ${LETTERS[i]}`}
                    onClick={() => setV((p) => ({ ...p, options: p.options.filter((_, j) => j !== i), answer: p.answer === i ? 0 : p.answer > i ? p.answer - 1 : p.answer }))}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
            {v.options.length < 5 && (
              <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => set('options', [...v.options, ''])}>
                <Plus /> Add option
              </Button>
            )}
          </div>
        </Field>
        <Field label="Explanation" htmlFor="q-expl" error={errors.explanation} optional hint="Shown after the student answers.">
          <Textarea id="q-expl" rows={3} value={v.explanation} onChange={(e) => set('explanation', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Difficulty" htmlFor="q-diff">
            <Select value={v.difficulty} onValueChange={(x) => set('difficulty', x as typeof v.difficulty)}>
              <SelectTrigger id="q-diff">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_DIFFICULTIES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {titleCase(d.toLowerCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Source" htmlFor="q-source">
            <Select value={v.source} onValueChange={(x) => set('source', x as typeof v.source)}>
              <SelectTrigger id="q-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SOURCE_LABEL) as (keyof typeof SOURCE_LABEL)[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === 'AI_REVIEWED' ? 'AI draft, reviewed' : SOURCE_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status" htmlFor="q-status">
            <Select value={v.status} onValueChange={(x) => set('status', x as QStatus)}>
              <SelectTrigger id="q-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS) as QStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ import

const SAMPLE = `[
  {
    "exam": "WAEC",
    "subject": "Mathematics",
    "year": 2019,
    "stem": "Simplify 2^3 × 2^2.",
    "options": ["2^5", "2^6", "4^5", "4^6"],
    "answer": 0,
    "explanation": "Add the indices: 3 + 2 = 5.",
    "difficulty": "EASY",
    "source": "LICENSED",
    "status": "DRAFT"
  }
]`;

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const imp = useImportQuestions();
  const [text, setText] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [valid, setValid] = useState<ExamQuestionInput[] | null>(null);
  useEffect(() => {
    if (open) {
      setText('');
      setProblems([]);
      setValid(null);
    }
  }, [open]);

  const check = (raw: string) => {
    setValid(null);
    if (!raw.trim()) return setProblems([]);
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return setProblems([`Not valid JSON: ${(e as Error).message}`]);
    }
    if (!Array.isArray(data)) return setProblems(['Paste an array: [ {…}, {…} ]']);
    if (!data.length) return setProblems(['The array is empty']);
    if (data.length > 2000) return setProblems(['At most 2,000 questions per import']);
    const errs: string[] = [];
    const out: ExamQuestionInput[] = [];
    data.forEach((item, i) => {
      const r = examQuestionSchema.safeParse(item);
      if (!r.success) errs.push(...r.error.issues.slice(0, 3).map((x) => `#${i + 1} ${x.path.join('.') || 'item'}: ${x.message}`));
      else if (r.data.answer >= r.data.options.length) errs.push(`#${i + 1} answer: points past the last option`);
      else out.push(r.data);
    });
    setProblems(errs);
    if (!errs.length) setValid(out);
  };

  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    if (!valid) return check(text);
    imp.mutate(valid, {
      onSuccess: (r) => {
        toast.success(`${plural(r.imported, 'question')} imported`);
        onOpenChange(false);
      },
      onError: (err) => setProblems([apiFieldErrors(err).form ?? 'Import failed']),
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import questions"
      description="Paste a JSON array of questions. Each one is checked here first; nothing is saved until every row is valid. Import as DRAFT and publish after review."
      icon={<FileJson />}
      submitLabel={valid ? `Import ${plural(valid.length, 'question')}` : 'Check'}
      pending={imp.isPending}
      onSubmit={submit}
      size="xl"
    >
      <div className="grid gap-3">
        <Textarea
          aria-label="Questions JSON"
          rows={14}
          className="font-mono text-[12px]"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            check(e.target.value);
          }}
          placeholder={SAMPLE}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => (setText(SAMPLE), check(SAMPLE))}>
            Paste an example
          </Button>
          {valid && (
            <Badge variant="success">
              <Check className="size-3" /> {plural(valid.length, 'question')} ready
            </Badge>
          )}
          {problems.length > 0 && <Badge variant="danger">{plural(problems.length, 'problem')}</Badge>}
        </div>
        {problems.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-danger/30 bg-danger-soft/40 p-3 font-mono text-[11.5px] text-danger">
            {problems.slice(0, 50).map((p, i) => (
              <li key={i} className="[overflow-wrap:anywhere]">
                {p}
              </li>
            ))}
            {problems.length > 50 && <li>…and {problems.length - 50} more</li>}
          </ul>
        )}
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ AI draft

function DraftDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const draft = useDraftQuestions();
  const topics = useTopics();
  const subjects = useSubjects();
  const [v, setV] = useState({ exam: 'WAEC' as ExamBody, subject: '', topicId: '', count: '5', difficulty: 'MEDIUM' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) setErrors({});
  }, [open]);
  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const count = Number(v.count);
    const errs: Record<string, string> = {};
    if (v.subject.trim().length < 2) errs.subject = 'Choose a subject';
    if (!Number.isInteger(count) || count < 1 || count > 20) errs.count = '1 to 20';
    if (Object.keys(errs).length) return setErrors(errs);
    draft.mutate(
      { exam: v.exam, subject: v.subject.trim(), topicId: v.topicId || null, count, difficulty: v.difficulty },
      {
        onSuccess: (r) => {
          toast.success(`${plural(r.drafted, 'draft')} added for review`, { description: 'Filter by Draft, check each one, then publish.' });
          onOpenChange(false);
        },
        onError: (err) => setErrors(apiFieldErrors(err)),
      },
    );
  };
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Draft questions with AI" icon={<Sparkles />} submitLabel="Draft questions" pending={draft.isPending} onSubmit={submit} size="lg">
      <div className="grid gap-4">
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft/50 p-3 text-[12.5px]">
          <BookMarked className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            AI drafts land as <strong>Draft</strong> and are never shown to students until a person checks the stem, the options, the marked answer and the explanation, then publishes them. Expect to fix or delete some.
          </p>
        </div>
        <FormError message={errors.form} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Exam" htmlFor="d-exam">
            <ExamSelect id="d-exam" value={v.exam} onChange={(x) => setV((p) => ({ ...p, exam: x }))} />
          </Field>
          <Field label="Subject" htmlFor="d-subject" error={errors.subject}>
            <SubjectInput id="d-subject" value={v.subject} onChange={(x) => setV((p) => ({ ...p, subject: x, topicId: '' }))} subjects={subjects} />
          </Field>
        </div>
        <Field label="Topic" htmlFor="d-topic" optional>
          <TopicSelect id="d-topic" subject={v.subject} value={v.topicId} onChange={(x) => setV((p) => ({ ...p, topicId: x }))} topics={topics.data} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="How many" htmlFor="d-count" error={errors.count}>
            <Input id="d-count" type="number" min={1} max={20} value={v.count} onChange={(e) => setV((p) => ({ ...p, count: e.target.value }))} />
          </Field>
          <Field label="Difficulty" htmlFor="d-diff">
            <Select value={v.difficulty} onValueChange={(x) => setV((p) => ({ ...p, difficulty: x }))}>
              <SelectTrigger id="d-diff">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_DIFFICULTIES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {titleCase(d.toLowerCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ topics

function TopicsTab() {
  const q = useTopics();
  const [subject, setSubject] = useState<string>();
  const [level, setLevel] = useState<string>();
  const subjects = useMemo(() => [...new Set((q.data ?? []).map((t) => t.subject))].sort(), [q.data]);
  const rows = useMemo(() => (q.data ?? []).filter((t) => (!subject || t.subject === subject) && (!level || t.level === level)), [q.data, subject, level]);
  const names = useMemo(() => new Map((q.data ?? []).map((t) => [t.id, t.name])), [q.data]);
  const groups = useMemo(() => {
    const m = new Map<string, SyllabusTopicRow[]>();
    for (const t of rows) {
      const k = `${t.subject}|${t.level}`;
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m.entries()];
  }, [rows]);

  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <FilterSelect label="Subject" value={subject} onChange={setSubject} allLabel="All subjects" options={subjects.map((s) => ({ value: s, label: titleCase(s) }))} />
        <FilterSelect label="Level" value={level} onChange={setLevel} allLabel="All levels" options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))} />
        <p className="text-[12.5px] text-muted-foreground tabular sm:ml-auto">{plural(rows.length, 'topic')}</p>
      </Toolbar>
      {q.isLoading ? (
        <div className="h-40 animate-pulse" />
      ) : !groups.length ? (
        <p className="p-10 text-center text-[13px] text-muted-foreground">No topics yet. Add the syllabus so questions and mastery can be grouped.</p>
      ) : (
        <div className="divide-y divide-border">
          {groups.map(([k, ts]) => {
            const [s, l] = k.split('|') as [string, (typeof LEVELS)[number]];
            return (
              <div key={k} className="p-4 sm:px-5">
                <p className="mb-2 text-[13px] font-semibold">
                  {titleCase(s)} <span className="font-normal text-muted-foreground">· {LEVEL_LABEL[l]}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ts.map((t) => (
                    <Badge key={t.id} variant="secondary" className="font-normal" title={t.parentId ? `Under ${names.get(t.parentId) ?? ''}` : undefined}>
                      {t.parentId && <span className="text-muted-foreground">{names.get(t.parentId)} › </span>}
                      {t.name}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function TopicDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const add = useAddTopic();
  const topics = useTopics();
  const subjects = useSubjects();
  const [v, setV] = useState({ subject: '', level: 'SENIOR' as (typeof LEVELS)[number], name: '', parentId: '', order: '0' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setErrors({});
      setV((p) => ({ ...p, name: '', parentId: '' }));
    }
  }, [open]);
  const parents = (topics.data ?? []).filter((t) => sameSubject(t.subject, v.subject) && t.level === v.level && !t.parentId);
  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (v.subject.trim().length < 2) errs.subject = 'Choose a subject';
    if (v.name.trim().length < 2) errs.name = 'Name the topic';
    if (Object.keys(errs).length) return setErrors(errs);
    add.mutate(
      { subject: v.subject.trim(), level: v.level, name: v.name.trim(), parentId: v.parentId || null, order: Number(v.order) || 0 },
      { onSuccess: () => (toast.success(`${v.name.trim()} added`), onOpenChange(false)), onError: (err) => setErrors(apiFieldErrors(err)) },
    );
  };
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Add a syllabus topic" icon={<ListTree />} submitLabel="Add topic" pending={add.isPending} onSubmit={submit}>
      <div className="grid gap-4">
        <FormError message={errors.form} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Subject" htmlFor="t-subject" error={errors.subject}>
            <SubjectInput id="t-subject" value={v.subject} onChange={(x) => setV((p) => ({ ...p, subject: x, parentId: '' }))} subjects={subjects} />
          </Field>
          <Field label="Level" htmlFor="t-level">
            <Select value={v.level} onValueChange={(x) => setV((p) => ({ ...p, level: x as typeof v.level, parentId: '' }))}>
              <SelectTrigger id="t-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Topic" htmlFor="t-name" error={errors.name}>
          <Input id="t-name" value={v.name} onChange={(e) => setV((p) => ({ ...p, name: e.target.value }))} placeholder="Quadratic equations" />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-4">
          <Field label="Under" htmlFor="t-parent" optional>
            <Select value={v.parentId || '__none__'} onValueChange={(x) => setV((p) => ({ ...p, parentId: x === '__none__' ? '' : x }))}>
              <SelectTrigger id="t-parent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Top level</SelectItem>
                {parents.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Order" htmlFor="t-order">
            <Input id="t-order" type="number" min={0} value={v.order} onChange={(e) => setV((p) => ({ ...p, order: e.target.value }))} />
          </Field>
        </div>
      </div>
    </FormDialog>
  );
}
