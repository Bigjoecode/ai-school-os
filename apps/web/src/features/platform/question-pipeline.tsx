import {
  EXAM_LABELS,
  EXAMS,
  MIN_PUBLISHED_TO_LIST,
  QUESTION_DIFFICULTIES,
  QUESTION_FLAG_LABELS,
  type ExamBody,
  type ExamCoverageRow,
  type ExamQuestionInput,
  type PipelineJob,
  type QuestionTarget,
  type ReviewItem,
  type TopicCoverage,
} from '@aischool/shared';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Bot, Check, ChevronRight, CircleSlash, ClipboardCheck, Gauge, ListChecks, Pencil, Settings2, SkipForward, Sparkles, Target, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { formatNumber, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { plural } from '../operations/ui';
import {
  isJobLive,
  useApprove,
  useBulkApprove,
  useCancelJob,
  useExamCoverage,
  useFillGaps,
  usePipelineJobs,
  usePipelineSettings,
  useReject,
  useReviewQueue,
  useReviewStats,
  useSavePipelineSettings,
  useSubjectCoverage,
  type ReviewFilter,
} from './question-pipeline-api';
import { FilterSelect, Kpi, Meter, Toolbar } from './ui';

const LETTERS = 'ABCDE';
const pct = (n: number) => `${n.toFixed(n >= 10 || n === 0 ? 0 : 1)}%`;

/** Coverage colour: red under a third, amber under two thirds, green after. */
function CoverageBar({ value }: { value: number }) {
  return (
    <div className="flex min-w-[110px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label="Coverage">
        <div className={cn('h-full rounded-full', value >= 66 ? 'bg-success' : value >= 33 ? 'bg-warning' : 'bg-danger')} style={{ width: `${Math.max(value, value > 0 ? 3 : 0)}%` }} />
      </div>
      <span className="w-11 text-right text-[12px] tabular text-muted-foreground">{pct(value)}</span>
    </div>
  );
}

function ExamSwitch({ value, onChange }: { value: ExamBody; onChange: (e: ExamBody) => void }) {
  return (
    <div role="radiogroup" aria-label="Exam" className="inline-flex rounded-xl border border-border bg-card p-1 shadow-soft">
      {EXAMS.map((e) => (
        <button
          key={e}
          type="button"
          role="radio"
          aria-checked={value === e}
          onClick={() => onChange(e)}
          className={cn('rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', value === e ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground')}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

// ================================================================== coverage

export function CoverageTab({ onReview }: { onReview: (f: ReviewFilter) => void }) {
  const [exam, setExam] = useState<ExamBody>('WAEC');
  const [subject, setSubject] = useState<string | null>(null);
  const [targetsOpen, setTargetsOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ExamSwitch value={exam} onChange={(e) => (setExam(e), setSubject(null))} />
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setTargetsOpen(true)}>
          <Settings2 /> Targets &amp; budget
        </Button>
      </div>
      {subject ? <SubjectView exam={exam} subject={subject} onBack={() => setSubject(null)} onReview={onReview} /> : <ExamOverview exam={exam} onOpen={setSubject} />}
      <JobsPanel exam={exam} subject={subject} />
      <TargetsDialog open={targetsOpen} onOpenChange={setTargetsOpen} />
    </div>
  );
}

type SortKey = 'subject' | 'topics' | 'objectives' | 'published' | 'drafts' | 'gap' | 'coveragePct';

function ExamOverview({ exam, onOpen }: { exam: ExamBody; onOpen: (s: string) => void }) {
  const cov = useExamCoverage(exam);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'gap', dir: -1 });
  const rows = useMemo(() => {
    const r = [...(cov.data?.subjects ?? [])];
    r.sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir;
    });
    return r;
  }, [cov.data, sort]);
  const t = cov.data?.totals;
  const head = (key: SortKey, label: string, className?: string) => (
    <TableHead className={className} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === 'subject' ? 1 : -1 }))}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </TableHead>
  );
  if (cov.error && !cov.data) return <ErrorState error={cov.error} onRetry={() => void cov.refetch()} />;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Kpi label="Coverage" icon={Gauge} loading={!t} value={t ? pct(t.coveragePct) : ''} sub={t ? `${formatNumber(t.targetQuestions - t.gap)} of ${formatNumber(t.targetQuestions)} target questions` : ''} />
        <Kpi label="Subjects offered" icon={ListChecks} loading={!t} value={t ? `${t.listed} / ${t.subjects}` : ''} sub={`Students see a subject at ${MIN_PUBLISHED_TO_LIST}+ published objective questions`} />
        <Kpi label="Published" icon={Check} tone="success" loading={!t} value={t ? formatNumber(t.published) : ''} sub="Live for students" />
        <Kpi label="Awaiting review" icon={ClipboardCheck} tone={t?.drafts ? 'warning' : undefined} loading={!t} value={t ? formatNumber(t.drafts) : ''} sub={t ? `Gap: ${formatNumber(t.gap)} questions` : ''} />
      </div>
      {cov.data && !cov.data.syllabusExam && (
        <p className="rounded-xl border border-dashed border-border p-3 text-[13px] text-muted-foreground">No {EXAM_LABELS[exam]} syllabus is loaded yet, so there are no topic targets. Import it under Import syllabus; existing questions are listed below.</p>
      )}
      {cov.data && cov.data.syllabusExam && cov.data.syllabusExam !== exam && (
        <p className="rounded-xl border border-dashed border-border p-3 text-[13px] text-muted-foreground">
          {EXAM_LABELS[exam]} uses the {EXAM_LABELS[cov.data.syllabusExam]} syllabus topics until its own syllabus is imported.
        </p>
      )}
      <Card className="overflow-hidden">
        {!cov.data ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Target} title="Nothing to cover yet" description="Import a syllabus or add questions for this exam." />
        ) : (
          <div className={cn('overflow-x-auto', cov.isPlaceholderData && 'opacity-60')}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {head('subject', 'Subject')}
                  {head('topics', 'Topics', 'text-right')}
                  {head('objectives', 'Objectives', 'hidden text-right lg:table-cell')}
                  <TableHead className="hidden text-right md:table-cell">Target / topic</TableHead>
                  {head('published', 'Published', 'text-right')}
                  {head('drafts', 'Drafts', 'text-right')}
                  {head('gap', 'Gap', 'text-right')}
                  {head('coveragePct', 'Coverage')}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <SubjectRow key={r.subject} r={r} exam={exam} onOpen={() => onOpen(r.subject)} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}

function SubjectRow({ r, exam, onOpen }: { r: ExamCoverageRow; exam: ExamBody; onOpen: () => void }) {
  return (
    <TableRow data-clickable tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())} aria-label={`Open ${r.subject} coverage`} className="cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none">
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-medium">{r.subject}</span>
          {r.listed ? <Badge variant="success">Offered</Badge> : <Badge variant="outline">Coming soon</Badge>}
        </div>
        {r.topics > 0 && <p className="text-[11.5px] text-muted-foreground">{r.topicsComplete} of {plural(r.topics, 'topic')} complete</p>}
      </TableCell>
      <TableCell className="text-right tabular">{r.topics || '—'}</TableCell>
      <TableCell className="hidden text-right tabular lg:table-cell">{r.objectives || '—'}</TableCell>
      <TableCell className="hidden text-right text-[12.5px] tabular text-muted-foreground md:table-cell">
        {r.target.objective} obj{exam !== 'JAMB' && r.target.theory ? ` + ${r.target.theory} theory` : ''}
      </TableCell>
      <TableCell className="text-right tabular">{formatNumber(r.published)}</TableCell>
      <TableCell className={cn('text-right tabular', r.drafts ? 'text-warning' : 'text-muted-foreground')}>{formatNumber(r.drafts)}</TableCell>
      <TableCell className="text-right font-medium tabular">{formatNumber(r.gap)}</TableCell>
      <TableCell>{r.targetQuestions ? <CoverageBar value={r.coveragePct} /> : <span className="text-[12px] text-muted-foreground">No syllabus</span>}</TableCell>
    </TableRow>
  );
}

function DifficultyMix({ d }: { d: Record<(typeof QUESTION_DIFFICULTIES)[number], number> }) {
  const total = d.EASY + d.MEDIUM + d.HARD;
  if (!total) return <span className="text-[12px] text-muted-foreground">—</span>;
  const tone = { EASY: 'bg-success', MEDIUM: 'bg-warning', HARD: 'bg-danger' } as const;
  return (
    <div className="flex w-24 flex-col gap-1" title={`Easy ${d.EASY} · Medium ${d.MEDIUM} · Hard ${d.HARD}`}>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        {QUESTION_DIFFICULTIES.map((k) => (d[k] ? <div key={k} className={tone[k]} style={{ width: `${(d[k] / total) * 100}%` }} /> : null))}
      </div>
      <span className="text-[11px] tabular text-muted-foreground">
        {d.EASY}/{d.MEDIUM}/{d.HARD}
      </span>
    </div>
  );
}

function SubjectView({ exam, subject, onBack, onReview }: { exam: ExamBody; subject: string; onBack: () => void; onReview: (f: ReviewFilter) => void }) {
  const cov = useSubjectCoverage(exam, subject);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [fillOpen, setFillOpen] = useState(false);
  const d = cov.data;
  const toggle = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };
  const jamb = exam === 'JAMB';
  const topicRow = (t: TopicCoverage, child = false) => (
    <TableRow key={t.id} className={cn(child && 'bg-muted/20')}>
      <TableCell className="w-8">
        <Checkbox aria-label={`Select ${t.name}`} checked={selected.has(t.id)} onCheckedChange={() => setSelected((s) => toggle(s, t.id))} />
      </TableCell>
      <TableCell>
        <div className={cn('flex min-w-0 items-start gap-1.5', child && 'pl-5')}>
          {!child && t.children.length > 0 ? (
            <button type="button" aria-label={open.has(t.id) ? 'Hide subtopics' : 'Show subtopics'} aria-expanded={open.has(t.id)} className="mt-0.5 rounded text-muted-foreground hover:text-foreground" onClick={() => setOpen((s) => toggle(s, t.id))}>
              <ChevronRight className={cn('size-4 transition-transform', open.has(t.id) && 'rotate-90')} />
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <div className="min-w-0">
            <p className={cn('text-[13px]', !child && 'font-medium')}>{t.name}</p>
            <p className="text-[11.5px] text-muted-foreground">
              {plural(t.objectives, 'objective')}
              {!child && t.children.length ? ` · ${plural(t.children.length, 'subtopic')}` : ''}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right tabular">
        {t.published.objective}
        {t.target && <span className="text-muted-foreground"> / {t.target.objective}</span>}
      </TableCell>
      {!jamb && (
        <TableCell className="text-right tabular">
          {t.published.theory}
          {t.target && <span className="text-muted-foreground"> / {t.target.theory}</span>}
        </TableCell>
      )}
      <TableCell className="text-right">
        {t.draft.objective + t.draft.theory > 0 ? (
          <button type="button" className="tabular text-warning underline-offset-2 hover:underline" onClick={() => onReview({ exam, subject, topicId: t.id })}>
            {t.draft.objective + t.draft.theory}
          </button>
        ) : (
          <span className="tabular text-muted-foreground">0</span>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <DifficultyMix d={t.difficulty} />
      </TableCell>
      <TableCell className="text-right">
        {t.gap ? (
          t.gap.objective + t.gap.theory === 0 ? (
            <Badge variant="success">
              <Check /> Met
            </Badge>
          ) : (
            <span className="font-medium tabular">{t.gap.objective + t.gap.theory}</span>
          )
        ) : (
          <span className="text-muted-foreground">·</span>
        )}
      </TableCell>
    </TableRow>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> All subjects
        </Button>
        <h2 className="font-display text-[18px] font-semibold tracking-tight">
          {EXAM_LABELS[exam]} · {subject}
        </h2>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onReview({ exam, subject })}>
            <ClipboardCheck /> Review drafts
          </Button>
          <Button size="sm" onClick={() => setFillOpen(true)} disabled={!d?.topics.length}>
            <Sparkles /> {selected.size ? `Fill ${plural(selected.size, 'topic')}` : 'Fill gaps'}
          </Button>
        </div>
      </div>
      {cov.error && !d ? (
        <ErrorState error={cov.error} onRetry={() => void cov.refetch()} />
      ) : !d ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
            <Kpi label="Coverage" icon={Gauge} value={pct(d.totals.coveragePct)} sub={`${d.totals.publishedTowardTarget} of ${d.totals.targetQuestions} target questions`} />
            <Kpi label="Topics" icon={ListChecks} value={d.totals.topics} sub={`${plural(d.totals.objectives, 'objective')} in the syllabus`} />
            <Kpi label="Published" icon={Check} tone="success" value={d.totals.published} sub={d.unassigned.published.objective + d.unassigned.published.theory ? `${d.unassigned.published.objective + d.unassigned.published.theory} not linked to a topic` : 'All linked to topics'} />
            <Kpi label="Awaiting review" icon={ClipboardCheck} tone={d.totals.drafts ? 'warning' : undefined} value={d.totals.drafts} sub={`Gap: ${d.totals.gap}`} />
          </div>
          <SubjectTarget exam={exam} subject={subject} target={d.target} />
          <Card className="overflow-hidden">
            {d.topics.length === 0 ? (
              <EmptyState icon={Target} title="No syllabus topics" description={`Import the ${EXAM_LABELS[exam]} ${subject} syllabus to set topic targets.`} />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-8">
                        <Checkbox
                          aria-label="Select all topics"
                          checked={selected.size && selected.size === d.topics.length ? true : selected.size ? 'indeterminate' : false}
                          onCheckedChange={(v) => setSelected(v === true ? new Set(d.topics.map((t) => t.id)) : new Set())}
                        />
                      </TableHead>
                      <TableHead>Topic</TableHead>
                      <TableHead className="text-right">Objective</TableHead>
                      {!jamb && <TableHead className="text-right">Theory</TableHead>}
                      <TableHead className="text-right">Drafts</TableHead>
                      <TableHead className="hidden md:table-cell">Difficulty (E/M/H)</TableHead>
                      <TableHead className="text-right">Gap</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{d.topics.flatMap((t) => [topicRow(t), ...(open.has(t.id) ? t.children.map((c) => topicRow(c, true)) : [])])}</TableBody>
                </Table>
              </div>
            )}
          </Card>
        </>
      )}
      <FillDialog open={fillOpen} onOpenChange={setFillOpen} exam={exam} subject={subject} topicIds={[...selected]} onStarted={() => setSelected(new Set())} />
    </div>
  );
}

function SubjectTarget({ exam, subject, target }: { exam: ExamBody; subject: string; target: QuestionTarget }) {
  const save = useSavePipelineSettings();
  const [obj, setObj] = useState(String(target.objective));
  const [th, setTh] = useState(String(target.theory));
  useEffect(() => (setObj(String(target.objective)), setTh(String(target.theory))), [target.objective, target.theory]);
  const dirty = obj !== String(target.objective) || th !== String(target.theory);
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
      <p className="mr-auto self-center text-[13px] text-muted-foreground">
        Target per topic for {subject}. {exam === 'JAMB' ? 'JAMB UTME is objective-only.' : 'Published questions count; drafts don’t until approved.'}
      </p>
      <Field label="Objective" htmlFor="t-obj" className="w-24">
        <Input id="t-obj" inputMode="numeric" value={obj} onChange={(e) => setObj(e.target.value.replace(/\D/g, ''))} />
      </Field>
      {exam !== 'JAMB' && (
        <Field label="Theory" htmlFor="t-th" className="w-24">
          <Input id="t-th" inputMode="numeric" value={th} onChange={(e) => setTh(e.target.value.replace(/\D/g, ''))} />
        </Field>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={!dirty || !obj}
        loading={save.isPending}
        onClick={() =>
          save.mutate({ subjects: { [`${exam}:${subject}`]: { objective: Math.min(100, Number(obj)), theory: exam === 'JAMB' ? 0 : Math.min(20, Number(th || 0)) } } }, { onSuccess: () => toast.success('Target saved'), onError: (e) => toast.error(errorMessage(e)) })
        }
      >
        Save target
      </Button>
    </div>
  );
}

function FillDialog({ open, onOpenChange, exam, subject, topicIds, onStarted }: { open: boolean; onOpenChange: (o: boolean) => void; exam: ExamBody; subject: string; topicIds: string[]; onStarted: () => void }) {
  const fill = useFillGaps();
  const [type, setType] = useState<'OBJECTIVE' | 'THEORY' | 'BOTH'>('OBJECTIVE');
  const [per, setPer] = useState('');
  const [max, setMax] = useState('10');
  useEffect(() => {
    if (open) (setType('OBJECTIVE'), setPer(''), fill.reset());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Sparkles />}
      title={`Fill gaps: ${subject}`}
      description={
        topicIds.length
          ? `Drafts questions for the ${plural(topicIds.length, 'selected topic')} in the background.`
          : `Drafts questions for the ${EXAM_LABELS[exam]} topics with the largest gaps, in the background. Drafts awaiting review count toward each target, so running it twice doesn't pile up duplicates.`
      }
      submitLabel="Start drafting"
      pending={fill.isPending}
      onSubmit={(e) => {
        e?.preventDefault();
        fill.mutate(
          { exam, subject, topicIds, type: exam === 'JAMB' ? 'OBJECTIVE' : type, perTopic: per ? Math.min(20, Number(per)) : null, maxTopics: Math.max(1, Math.min(60, Number(max) || 10)) },
          {
            onSuccess: (j) => (toast.success(`Drafting started: ${plural(j.topicsTotal, 'topic')}`), onStarted(), onOpenChange(false)),
            onError: (err) => toast.error(errorMessage(err)),
          },
        );
      }}
    >
      <div className="space-y-4">
        {exam !== 'JAMB' && (
          <Field label="Question type" htmlFor="f-type">
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger id="f-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OBJECTIVE">Objective</SelectItem>
                <SelectItem value="THEORY">Theory</SelectItem>
                <SelectItem value="BOTH">Both</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Questions per topic" htmlFor="f-per" hint="Empty = each topic's remaining gap">
            <Input id="f-per" inputMode="numeric" placeholder="Gap" value={per} onChange={(e) => setPer(e.target.value.replace(/\D/g, ''))} />
          </Field>
          {!topicIds.length && (
            <Field label="Topics at most" htmlFor="f-max">
              <Input id="f-max" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} />
            </Field>
          )}
        </div>
        <ul className="space-y-1.5 rounded-xl bg-muted/50 p-3 text-[12.5px] text-muted-foreground">
          <li className="flex gap-2">
            <Bot className="mt-0.5 size-3.5 shrink-0" /> Original questions from each topic's objectives, in {EXAM_LABELS[exam]} style, with a mix of easy, medium and hard.
          </li>
          <li className="flex gap-2">
            <ListChecks className="mt-0.5 size-3.5 shrink-0" /> Each is checked (four distinct options, a valid key, an explanation; theory guides that add up), near-duplicates are dropped, and a second model solves it independently.
          </li>
          <li className="flex gap-2">
            <ClipboardCheck className="mt-0.5 size-3.5 shrink-0" /> Everything lands in Review as a draft. Nothing reaches students until someone approves it.
          </li>
        </ul>
      </div>
    </FormDialog>
  );
}

const JOB_STATE: Record<PipelineJob['state'], { label: string; variant: 'secondary' | 'brand' | 'success' | 'danger' | 'warning' | 'outline' }> = {
  QUEUED: { label: 'Queued', variant: 'secondary' },
  RUNNING: { label: 'Running', variant: 'brand' },
  DONE: { label: 'Done', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  STOPPED: { label: 'Stopped', variant: 'warning' },
  CANCELLED: { label: 'Cancelled', variant: 'outline' },
};

function JobsPanel({ exam, subject }: { exam: ExamBody; subject: string | null }) {
  const jobs = usePipelineJobs();
  const cancel = useCancelJob();
  const [expanded, setExpanded] = useState<string | null>(null);
  const rows = (jobs.data ?? []).filter((j) => j.exam === exam && (!subject || j.subject === subject)).slice(0, 6);
  if (!rows.length) return null;
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <p className="font-display text-[14px] font-semibold">Drafting jobs</p>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((j) => {
          const live = isJobLive(j);
          const p = j.topicsTotal ? Math.round((j.topicsDone / j.topicsTotal) * 100) : 0;
          return (
            <li key={j.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={JOB_STATE[j.state].variant}>{JOB_STATE[j.state].label}</Badge>
                <p className="text-[13px] font-medium">
                  {j.subject} · {j.type === 'BOTH' ? 'objective + theory' : j.type.toLowerCase()}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {j.topicsDone}/{j.topicsTotal} topics · {plural(j.counts.drafted, 'draft')}
                  {j.counts.duplicates ? ` · ${j.counts.duplicates} duplicates dropped` : ''}
                  {j.counts.invalid ? ` · ${j.counts.invalid} invalid` : ''}
                  {j.counts.flagged ? ` · ${j.counts.flagged} flagged` : ''} · {formatRelative(j.createdAt)}
                </p>
                <div className="ml-auto flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setExpanded(expanded === j.id ? null : j.id)}>
                    {expanded === j.id ? 'Hide log' : 'Log'}
                  </Button>
                  {live && (
                    <Button variant="outline" size="sm" loading={cancel.isPending && cancel.variables === j.id} onClick={() => cancel.mutate(j.id, { onSuccess: () => toast.success('Stopping after the current topic') })}>
                      <X /> Stop
                    </Button>
                  )}
                </div>
              </div>
              {live && (
                <div className="mt-2 space-y-1">
                  <Meter pct={p} label="Job progress" />
                  {j.current && <p className="text-[12px] text-muted-foreground">Working on {j.current}…</p>}
                </div>
              )}
              {j.error && <p className="mt-1.5 text-[12.5px] text-danger">{j.error}</p>}
              {expanded === j.id && (
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-2.5 font-mono text-[11.5px] text-muted-foreground">
                  {j.log.join('\n')}
                  {`\n${j.counts.aiCalls} AI calls · $${j.costUsd.toFixed(4)}`}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function TargetsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const s = usePipelineSettings();
  const save = useSavePipelineSettings();
  const [v, setV] = useState<Record<ExamBody, { objective: string; theory: string }> | null>(null);
  const [budget, setBudget] = useState('');
  useEffect(() => {
    if (open && s.data) {
      setV(Object.fromEntries(EXAMS.map((e) => [e, { objective: String(s.data.defaults[e].objective), theory: String(s.data.defaults[e].theory) }])) as Record<ExamBody, { objective: string; theory: string }>);
      setBudget(String(s.data.dailyBudgetUsd));
    }
  }, [open, s.data]);
  const overrides = Object.entries(s.data?.subjects ?? {});
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Target />}
      title="Targets & AI budget"
      description="Questions each syllabus topic should have. Override a subject from its coverage page."
      submitLabel="Save"
      pending={save.isPending}
      onSubmit={(e) => {
        e?.preventDefault();
        if (!v) return;
        save.mutate(
          { defaults: Object.fromEntries(EXAMS.map((x) => [x, { objective: Math.min(100, Number(v[x].objective) || 0), theory: x === 'JAMB' ? 0 : Math.min(20, Number(v[x].theory) || 0) }])), dailyBudgetUsd: Math.min(1000, Number(budget) || 0) },
          { onSuccess: () => (toast.success('Targets saved'), onOpenChange(false)), onError: (err) => toast.error(errorMessage(err)) },
        );
      }}
    >
      {!v ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2 text-[13px]">
            <span className="text-[12px] font-medium text-muted-foreground">Exam</span>
            <span className="w-20 text-[12px] font-medium text-muted-foreground">Objective</span>
            <span className="w-20 text-[12px] font-medium text-muted-foreground">Theory</span>
            {EXAMS.map((e) => (
              <div key={e} className="contents">
                <span>{EXAM_LABELS[e]}</span>
                <Input aria-label={`${e} objective target`} className="w-20" inputMode="numeric" value={v[e].objective} onChange={(x) => setV({ ...v, [e]: { ...v[e], objective: x.target.value.replace(/\D/g, '') } })} />
                {e === 'JAMB' ? <span className="w-20 text-[12px] text-muted-foreground">None</span> : <Input aria-label={`${e} theory target`} className="w-20" inputMode="numeric" value={v[e].theory} onChange={(x) => setV({ ...v, [e]: { ...v[e], theory: x.target.value.replace(/\D/g, '') } })} />}
              </div>
            ))}
          </div>
          <Field label="Daily AI budget for drafting (USD)" htmlFor="t-budget" hint={s.data ? `Spent today: $${s.data.spentTodayUsd.toFixed(2)}. Jobs stop cleanly when it is reached.` : undefined}>
            <Input id="t-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ''))} />
          </Field>
          {overrides.length > 0 && (
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">Subject overrides</p>
              <ul className="flex flex-wrap gap-1.5">
                {overrides.map(([k, t]) => (
                  <li key={k} className="rounded-full bg-muted px-2.5 py-1 text-[12px]">
                    {k.replace(':', ' · ')} <span className="tabular text-muted-foreground">{t.objective}/{t.theory}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </FormDialog>
  );
}

// ================================================================== review

export function ReviewTab({ filter, onFilter }: { filter: ReviewFilter; onFilter: (f: ReviewFilter) => void }) {
  const queue = useReviewQueue(filter, 100);
  const stats = useReviewStats();
  const approve = useApprove();
  const reject = useReject();
  const bulk = useBulkApprove();
  const [mode, setMode] = useState<'focus' | 'list'>('focus');
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ReviewItem | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [rejectMode, setRejectMode] = useState<'DELETE' | 'RETIRE'>('DELETE');
  const items = queue.data?.items ?? [];
  const current = items.find((i) => !skipped.has(i.id)) ?? null;
  const unflagged = items.filter((i) => !i.flags.length);
  useEffect(() => setSkipped(new Set()), [filter.exam, filter.subject, filter.topicId, filter.flagged, filter.aiOnly]);

  const busy = approve.isPending || reject.isPending;
  const doApprove = (it: ReviewItem) => approve.mutate({ id: it.id }, { onSuccess: () => toast.success('Approved — live for students'), onError: (e) => toast.error(errorMessage(e)) });
  const doReject = (it: ReviewItem) => reject.mutate({ id: it.id, mode: rejectMode }, { onSuccess: () => toast.success(rejectMode === 'DELETE' ? 'Rejected and deleted' : 'Rejected and retired'), onError: (e) => toast.error(errorMessage(e)) });
  const doSkip = (it: ReviewItem) => setSkipped((s) => new Set(s).add(it.id));

  // Keyboard: A approve, E edit & approve, R reject, S skip (focus mode, when no dialog or field has focus).
  const keys = useRef({ current, busy, editing, bulkOpen, mode });
  keys.current = { current, busy, editing, bulkOpen, mode };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      if (k.mode !== 'focus' || !k.current || k.busy || k.editing || k.bulkOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.closest('[role="dialog"],[role="listbox"],[role="menu"]'))) return;
      const key = e.key.toLowerCase();
      if (key === 'a') doApprove(k.current);
      else if (key === 'e') setEditing(k.current);
      else if (key === 'r') doReject(k.current);
      else if (key === 's') doSkip(k.current);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rejectMode]);

  const subjects = queue.data?.subjects ?? [];
  const st = stats.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Kpi label="Waiting for review" icon={ClipboardCheck} tone={st?.waiting ? 'warning' : undefined} loading={!st} value={st ? formatNumber(st.waiting) : ''} sub={queue.data ? `${queue.data.flagged} flagged in this view` : ''} />
        <Kpi label="Approved today" icon={Check} tone="success" loading={!st} value={st?.today.approved ?? ''} sub={st ? `${st.today.edited} after edits · ${st.today.rejected} rejected` : ''} />
        <Kpi label="This week" icon={Gauge} loading={!st} value={st?.week.approved ?? ''} sub={st ? <WeekSpark daily={st.daily} /> : ''} />
        <Kpi label="Reviewers this week" icon={ListChecks} loading={!st} value={st?.reviewers.length ?? ''} sub={st?.reviewers.slice(0, 2).map((r) => `${r.name} ${r.approvedWeek}✓ ${r.rejectedWeek}✗`).join(' · ') || 'No reviews yet'} />
      </div>
      <Card className="overflow-hidden">
        <Toolbar>
          <FilterSelect label="Exam" value={filter.exam} onChange={(v) => onFilter({ ...filter, exam: v, subject: undefined, topicId: undefined })} allLabel="All exams" options={EXAMS.map((e) => ({ value: e, label: EXAM_LABELS[e] }))} className="sm:w-[150px]" />
          <FilterSelect
            label="Subject"
            value={filter.subject}
            onChange={(v) => onFilter({ ...filter, subject: v, topicId: undefined })}
            allLabel="All subjects"
            options={[...new Map(subjects.filter((s) => !filter.exam || s.exam === filter.exam).map((s) => [s.subject, s])).values()].map((s) => ({ value: s.subject, label: `${s.subject}${filter.exam ? ` (${s.drafts})` : ''}` }))}
          />
          <FilterSelect label="Flags" value={filter.flagged} onChange={(v) => onFilter({ ...filter, flagged: v as ReviewFilter['flagged'] })} allLabel="Flagged or not" options={[{ value: 'yes', label: 'Flagged only' }, { value: 'no', label: 'Unflagged only' }]} className="sm:w-[150px]" />
          <label className="flex items-center gap-2 text-[13px]">
            <Switch checked={!!filter.aiOnly} onCheckedChange={(v) => onFilter({ ...filter, aiOnly: v })} /> AI drafts only
          </label>
          {filter.topicId && (
            <Button variant="ghost" size="sm" onClick={() => onFilter({ ...filter, topicId: undefined })}>
              <X /> Topic filter
            </Button>
          )}
          <div className="flex gap-1 sm:ml-auto">
            <Button size="sm" variant={mode === 'focus' ? 'default' : 'outline'} onClick={() => setMode('focus')}>
              One at a time
            </Button>
            <Button size="sm" variant={mode === 'list' ? 'default' : 'outline'} onClick={() => setMode('list')}>
              List
            </Button>
          </div>
        </Toolbar>
        {queue.error && !queue.data ? (
          <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
        ) : !queue.data ? (
          <Skeleton className="m-4 h-64" />
        ) : items.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="Nothing to review" description="No drafts match. Fill gaps from Coverage to draft more." />
        ) : mode === 'focus' ? (
          current ? (
            <div className={cn('p-4 sm:p-5', queue.isPlaceholderData && 'opacity-60')}>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                <span>
                  {plural(Math.max(0, queue.data.total - skipped.size), 'draft')} left{skipped.size ? ` · ${skipped.size} skipped` : ''}
                </span>
                {skipped.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSkipped(new Set())}>
                    Show skipped
                  </Button>
                )}
                <span className="ml-auto flex items-center gap-1.5">
                  If rejected:
                  <Select value={rejectMode} onValueChange={(v) => setRejectMode(v as 'DELETE' | 'RETIRE')}>
                    <SelectTrigger aria-label="What reject does" className="h-8 w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DELETE">Delete</SelectItem>
                      <SelectItem value="RETIRE">Retire</SelectItem>
                    </SelectContent>
                  </Select>
                </span>
              </div>
              <ReviewCard item={current} />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => doApprove(current)} loading={approve.isPending} disabled={busy}>
                  <Check /> Approve <Kbd className="ml-1 bg-transparent text-current">A</Kbd>
                </Button>
                <Button variant="outline" onClick={() => setEditing(current)} disabled={busy}>
                  <Pencil /> Edit &amp; approve <Kbd className="ml-1">E</Kbd>
                </Button>
                <Button variant="outline" className="text-danger" onClick={() => doReject(current)} loading={reject.isPending} disabled={busy}>
                  <Trash2 /> Reject <Kbd className="ml-1">R</Kbd>
                </Button>
                <Button variant="ghost" onClick={() => doSkip(current)} disabled={busy}>
                  <SkipForward /> Skip <Kbd className="ml-1">S</Kbd>
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState icon={SkipForward} title="You've skipped everything here" description="Show the skipped drafts again, or change the filters." action={<Button variant="outline" onClick={() => setSkipped(new Set())}>Show skipped</Button>} />
          )
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
              <p className="mr-auto text-[13px] text-muted-foreground">
                {plural(queue.data.total, 'draft')} · {queue.data.flagged} flagged{queue.data.total > items.length ? ` · showing the first ${items.length}` : ''}
              </p>
              <Button size="sm" disabled={!unflagged.length} onClick={() => setBulkOpen(true)}>
                <Check /> Approve {plural(unflagged.length, 'unflagged draft')}
              </Button>
            </div>
            <ul className={cn('divide-y divide-border', queue.isPlaceholderData && 'opacity-60')}>
              {items.map((it) => (
                <li key={it.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px]">{it.stem}</p>
                    <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                      {it.exam} · {it.subject}
                      {it.topic ? ` · ${it.topic}` : ''} · {it.type === 'THEORY' ? `${plural(it.marks, 'mark')}` : `Key ${LETTERS[it.answer]}: ${it.options[it.answer] ?? '—'}`} · {it.difficulty.toLowerCase()}
                    </p>
                    {it.flags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {it.flags.map((f) => (
                          <Badge key={f.flag} variant="warning" title={f.detail}>
                            {QUESTION_FLAG_LABELS[f.flag]}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label="Approve" onClick={() => doApprove(it)} disabled={busy}>
                      <Check />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Edit and approve" onClick={() => setEditing(it)} disabled={busy}>
                      <Pencil />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Reject" className="text-danger" onClick={() => doReject(it)} disabled={busy}>
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <EditApproveDialog item={editing} onOpenChange={(o) => !o && setEditing(null)} />
      <ConfirmDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        destructive={false}
        title={`Approve ${plural(unflagged.length, 'draft')}?`}
        description="Only drafts with no flags are approved; they go live for students at once, with you recorded as the reviewer. The server re-checks each one and skips any that are flagged."
        confirmLabel="Approve"
        loading={bulk.isPending}
        onConfirm={() =>
          bulk.mutate(
            unflagged.map((i) => i.id),
            {
              onSuccess: (r) => (toast.success(`${plural(r.approved, 'question')} approved${r.skipped.length ? ` · ${r.skipped.length} skipped (flagged)` : ''}`), setBulkOpen(false)),
              onError: (e) => toast.error(errorMessage(e)),
            },
          )
        }
      />
    </div>
  );
}

function WeekSpark({ daily }: { daily: { day: string; approved: number; rejected: number }[] }) {
  const max = Math.max(1, ...daily.map((d) => d.approved + d.rejected));
  return (
    <span className="flex h-5 items-end gap-0.5" aria-label="Reviews per day, last 7 days">
      {daily.map((d) => (
        <span key={d.day} title={`${d.day}: ${d.approved} approved, ${d.rejected} rejected`} className="w-2 rounded-sm bg-chart-1" style={{ height: `${Math.max(8, ((d.approved + d.rejected) / max) * 100)}%`, opacity: d.approved + d.rejected ? 1 : 0.25 }} />
      ))}
    </span>
  );
}

function ReviewCard({ item }: { item: ReviewItem }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{item.exam}</Badge>
          <Badge variant="outline">{item.subject}</Badge>
          <Badge variant={item.type === 'THEORY' ? 'info' : 'secondary'}>{item.type === 'THEORY' ? `Theory · ${plural(item.marks, 'mark')}` : 'Objective'}</Badge>
          <Badge variant="outline">{item.difficulty.toLowerCase()}</Badge>
          {item.aiDraft && (
            <Badge variant="ai">
              <Bot /> AI draft
            </Badge>
          )}
          <span className="text-[12px] text-muted-foreground">drafted {formatRelative(item.createdAt)}</span>
        </div>
        {item.flags.length > 0 && (
          <ul className="space-y-1 rounded-xl border border-warning/30 bg-warning-soft/50 p-3 text-[12.5px]">
            {item.flags.map((f) => (
              <li key={f.flag} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                <span>
                  <span className="font-medium">{QUESTION_FLAG_LABELS[f.flag]}</span>
                  {f.detail ? <span className="text-muted-foreground"> — {f.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{item.stem}</p>
        {item.type !== 'THEORY' ? (
          <ol className="space-y-1.5">
            {item.options.map((o, i) => (
              <li key={i} className={cn('flex items-start gap-2.5 rounded-xl border px-3 py-2 text-[14px]', i === item.answer ? 'border-success/50 bg-success-soft/60' : 'border-border')}>
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold', i === item.answer ? 'bg-success text-white' : 'bg-muted text-muted-foreground')}>{LETTERS[i]}</span>
                <span className="min-w-0 flex-1 pt-0.5">{o}</span>
                {i === item.answer && <Check className="mt-1 size-4 shrink-0 text-success" aria-label="Correct answer" />}
                {item.check && item.check.answer === i && i !== item.answer && <Badge variant="warning">Self-check chose this</Badge>}
              </li>
            ))}
          </ol>
        ) : (
          <div className="rounded-xl border border-border p-3">
            <p className="mb-1 text-[12px] font-medium text-muted-foreground">Marking guide</p>
            <p className="whitespace-pre-wrap text-[13.5px]">{item.markingGuide ?? '—'}</p>
          </div>
        )}
        <div className="rounded-xl bg-muted/50 p-3">
          <p className="mb-1 text-[12px] font-medium text-muted-foreground">{item.type === 'THEORY' ? 'Model answer' : 'Explanation'}</p>
          <p className="whitespace-pre-wrap text-[13.5px]">{item.explanation || <span className="text-danger">Missing</span>}</p>
        </div>
      </div>
      <aside className="space-y-3 text-[13px]">
        <div className="rounded-xl border border-border p-3">
          <p className="text-[12px] font-medium text-muted-foreground">Topic</p>
          <p className="font-medium">{item.topic ?? 'No topic'}</p>
          {item.parentTopic && <p className="text-[12px] text-muted-foreground">in {item.parentTopic}</p>}
          {item.topicObjectives.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[12.5px] text-muted-foreground">
              {item.topicObjectives.slice(0, 8).map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          )}
        </div>
        <div className={cn('rounded-xl border p-3', item.check ? (item.check.agrees ? 'border-success/30' : 'border-warning/40 bg-warning-soft/40') : 'border-dashed border-border')}>
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
            <Bot className="size-3.5" /> AI self-check
          </p>
          {item.check ? (
            <p className="mt-1">
              {item.check.agrees ? <span className="font-medium text-success">Agrees with the key. </span> : <span className="font-medium text-warning">Disagrees. </span>}
              <span className="text-muted-foreground">{item.check.note}</span>
            </p>
          ) : (
            <p className="mt-1 text-muted-foreground">{item.aiDraft ? 'Not checked (the check failed or was skipped).' : 'Written by a person; no AI check.'}</p>
          )}
        </div>
        <p className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
          <CircleSlash className="mt-0.5 size-3.5 shrink-0" /> Students never see a draft. Approving records you as the reviewer.
        </p>
      </aside>
    </div>
  );
}

function EditApproveDialog({ item, onOpenChange }: { item: ReviewItem | null; onOpenChange: (o: boolean) => void }) {
  const approve = useApprove();
  const [v, setV] = useState<ExamQuestionInput | null>(null);
  useEffect(() => {
    if (item)
      setV({
        exam: item.exam,
        type: item.type ?? 'OBJECTIVE',
        marks: item.marks,
        markingGuide: item.markingGuide,
        subject: item.subject,
        topicId: item.topicId,
        year: item.year,
        stem: item.stem,
        options: item.type === 'THEORY' ? [] : [...item.options, '', '', '', ''].slice(0, 4),
        answer: item.answer,
        explanation: item.explanation,
        difficulty: item.difficulty,
        source: item.source,
        status: 'DRAFT',
      });
  }, [item]);
  const theory = v?.type === 'THEORY';
  return (
    <FormDialog
      open={!!item}
      onOpenChange={onOpenChange}
      icon={<Pencil />}
      size="lg"
      title="Edit & approve"
      description="Fix what's wrong, then approve. It goes live for students with you as the reviewer."
      submitLabel="Save and approve"
      pending={approve.isPending}
      onSubmit={(e) => {
        e?.preventDefault();
        if (!item || !v) return;
        approve.mutate({ id: item.id, edits: { ...v, options: theory ? [] : v.options.map((o) => o.trim()) } }, { onSuccess: () => (toast.success('Edited and approved'), onOpenChange(false)), onError: (err) => toast.error(errorMessage(err)) });
      }}
    >
      {v && (
        <div className="space-y-4">
          <Field label="Question" htmlFor="ea-stem">
            <Textarea id="ea-stem" rows={4} value={v.stem} onChange={(e) => setV({ ...v, stem: e.target.value })} />
          </Field>
          {!theory ? (
            <div className="space-y-2">
              <p className="text-[13px] font-medium">Options (choose the correct one)</p>
              {v.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button type="button" aria-label={`Mark ${LETTERS[i]} correct`} aria-pressed={v.answer === i} onClick={() => setV({ ...v, answer: i })} className={cn('grid size-8 shrink-0 place-items-center rounded-full border text-[12px] font-semibold', v.answer === i ? 'border-success bg-success text-white' : 'border-border text-muted-foreground hover:bg-muted')}>
                    {LETTERS[i]}
                  </button>
                  <Input aria-label={`Option ${LETTERS[i]}`} value={o} onChange={(e) => setV({ ...v, options: v.options.map((x, j) => (j === i ? e.target.value : x)) })} />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[100px_1fr]">
              <Field label="Marks" htmlFor="ea-marks">
                <Input id="ea-marks" inputMode="numeric" value={String(v.marks)} onChange={(e) => setV({ ...v, marks: Math.max(1, Math.min(100, Number(e.target.value.replace(/\D/g, '')) || 1)) })} />
              </Field>
              <Field label="Marking guide" htmlFor="ea-guide" hint="One point per line: “2 marks: …”; the marks should add up to the total">
                <Textarea id="ea-guide" rows={5} value={v.markingGuide ?? ''} onChange={(e) => setV({ ...v, markingGuide: e.target.value })} />
              </Field>
            </div>
          )}
          <Field label={theory ? 'Model answer' : 'Explanation'} htmlFor="ea-exp">
            <Textarea id="ea-exp" rows={3} value={v.explanation ?? ''} onChange={(e) => setV({ ...v, explanation: e.target.value })} />
          </Field>
          <Field label="Difficulty" htmlFor="ea-diff">
            <Select value={v.difficulty} onValueChange={(x) => setV({ ...v, difficulty: x as ExamQuestionInput['difficulty'] })}>
              <SelectTrigger id="ea-diff">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_DIFFICULTIES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d[0] + d.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}
    </FormDialog>
  );
}
