import { DIFFICULTIES, QUESTION_TYPE_LABELS, QUESTION_TYPES, type QuestionRow } from '@aischool/shared';
import { CheckCircle2, FileQuestionMark, Filter, Layers, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Pagination } from '@/components/ui/data-table';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/search-input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { useDebounced } from '@/lib/hooks';
import { qk, queryClient } from '@/lib/query-client';
import { cn, titleCase } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { jobNumber, useAiJob, useDeleteQuestion, useQuestions, useQuestionStatus, useQuestionTopics } from '../assessment/api';
import { JobProgressPanel, useStoredState } from '../assessment/ui';
import { LevelSelect, SubjectSelect } from '../planning/pickers';
import { useSearchFlag } from '../planning/ui';
import { QuestionCard } from './question-card';
import { GenerateQuestionsDialog, QuestionDialog } from './question-dialogs';

const PAGE_SIZE = 20;

export default function QuestionsPage() {
  const canManage = useCan('assessment.manage');
  const canAi = useCan('ai.use');
  const structure = useStructure();
  const [pick, setPick] = useStoredState<{ subjectId?: string; classLevelId?: string }>('aischool.questions.pick', {});
  const { subjectId, classLevelId } = pick;

  const [topic, setTopic] = useState<string | undefined>();
  const [type, setType] = useState<string | undefined>();
  const [difficulty, setDifficulty] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [review, setReview] = useState<{ jobId: string; topic: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [genOpen, setGenOpen] = useSearchFlag('new');
  const [editing, setEditing] = useState<QuestionRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<QuestionRow | null>(null);
  const [bulkRetire, setBulkRetire] = useState(false);

  // Background generation job.
  const [jobId, setJobId] = useState<string | undefined>();
  const job = useAiJob(jobId);
  const announced = useRef<string | null>(null);
  const jobTopic = useRef('');

  const ready = !!subjectId && !!classLevelId;
  const topics = useQuestionTopics(subjectId, classLevelId);
  const filters = review
    ? { subjectId, classLevelId, aiJobId: review.jobId, page: 1, pageSize: 50 }
    : { subjectId, classLevelId, topic, type, difficulty, status, q: q || undefined, page, pageSize: PAGE_SIZE };
  const list = useQuestions(filters, ready);
  const rows = list.data?.items;
  const setStatusMut = useQuestionStatus();
  const remove = useDeleteQuestion();

  // Reset paging/selection when the view changes.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [subjectId, classLevelId, topic, type, difficulty, status, q, review?.jobId]);

  // Topic no longer exists after a change of subject/class.
  useEffect(() => {
    setTopic(undefined);
    setReview(null);
  }, [subjectId, classLevelId]);

  // When the AI job finishes, announce it and switch to review mode.
  useEffect(() => {
    const j = job.data;
    if (!j || j.state === 'QUEUED' || j.state === 'RUNNING' || announced.current === j.id) return;
    announced.current = j.id;
    if (j.state === 'DONE') {
      const created = jobNumber(j, 'created');
      const dropped = jobNumber(j, 'dropped');
      void queryClient.invalidateQueries({ queryKey: qk.questions() });
      void queryClient.invalidateQueries({ queryKey: qk.questionTopics() });
      toast.success(`${created} ${created === 1 ? 'question' : 'questions'} ready to review${dropped ? ` (${dropped} dropped)` : ''}`, {
        description: dropped ? 'Some drafts didn’t pass our checks and were left out.' : 'They’re drafts — approve the ones you like.',
      });
      if (created > 0) setReview({ jobId: j.id, topic: jobTopic.current });
    } else {
      toast.error('Question generation failed', { description: j.error ?? undefined });
    }
  }, [job.data]);

  const topicNames = useMemo(() => (topics.data ?? []).map((t) => t.topic), [topics.data]);
  const totals = useMemo(
    () => (topics.data ?? []).reduce((acc, t) => ({ total: acc.total + t.total, approved: acc.approved + t.approved }), { total: 0, approved: 0 }),
    [topics.data],
  );

  const pageIds = rows?.map((r) => r.id) ?? [];
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someSelected = pageIds.some((id) => selected.has(id));
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const bulk = (s: QuestionRow['status'], ids = [...selected]) => {
    if (!ids.length) return;
    setStatusMut.mutate({ ids, status: s }, { onSuccess: () => { setSelected(new Set()); setBulkRetire(false); } });
  };
  const reviewDrafts = review ? (rows ?? []).filter((r) => r.status === 'DRAFT') : [];

  const filtered = !!(topic || type || difficulty || status || q);
  const canGenerate = canManage && canAi;

  const actions = (
    <>
      {canManage && (
        <Button variant="outline" onClick={() => setAddOpen(true)} disabled={!ready}>
          <Plus /> Add question
        </Button>
      )}
      {canGenerate && (
        <Button variant="ai" onClick={() => setGenOpen(true)} disabled={!ready}>
          <Sparkles /> Generate with AI
        </Button>
      )}
    </>
  );

  return (
    <Page>
      <PageHeader
        title="Question Bank"
        description="Reusable, tagged questions for every subject and class — written by you or drafted by AI and approved by you."
        actions={actions}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:flex lg:items-center">
        <SubjectSelect
          structure={structure.data}
          value={subjectId}
          onChange={(v) => setPick({ ...pick, subjectId: v })}
          className="lg:w-56"
          aria-label="Subject"
        />
        <LevelSelect
          structure={structure.data}
          value={classLevelId}
          onChange={(v) => setPick({ ...pick, classLevelId: v })}
          className="lg:w-44"
          aria-label="Class"
        />
        {ready && topics.data && (
          <p className="text-[12.5px] text-muted-foreground tabular sm:col-span-2 lg:ml-auto">
            {totals.total} questions · <span className="text-success">{totals.approved} approved</span>
          </p>
        )}
      </div>

      {jobId && (
        <div className="mb-5">
          <JobProgressPanel
            job={job.data}
            noun="questions"
            doneText={`${jobNumber(job.data, 'created')} new draft questions${jobNumber(job.data, 'dropped') ? ` · ${jobNumber(job.data, 'dropped')} dropped` : ''}`}
            onDismiss={job.data && (job.data.state === 'DONE' || job.data.state === 'FAILED') ? () => setJobId(undefined) : undefined}
          >
            {job.data?.state === 'DONE' && !review && jobNumber(job.data, 'created') > 0 && (
              <Button size="sm" variant="outline" onClick={() => setReview({ jobId: job.data!.id, topic: jobTopic.current })}>
                Review drafts
              </Button>
            )}
          </JobProgressPanel>
        </div>
      )}

      {!ready ? (
        <Card>
          <EmptyState
            icon={FileQuestionMark}
            title="Pick a subject and class"
            description="Your question bank is organised by subject and class level. Choose both above to see and add questions."
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* ---------------------------------------------------- topics rail */}
          <aside aria-label="Topics" className="hidden lg:block">
            <Card className="sticky top-20 p-2">
              <p className="px-2.5 pb-1.5 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Topics</p>
              {topics.isLoading ? (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-7 w-full" />
                  ))}
                </div>
              ) : (
                <nav className="scrollbar-thin max-h-[calc(100dvh-220px)] space-y-0.5 overflow-y-auto">
                  <TopicButton active={!topic && !review} label="All topics" total={totals.total} approved={totals.approved} onClick={() => { setTopic(undefined); setReview(null); }} />
                  {(topics.data ?? []).map((t) => (
                    <TopicButton
                      key={t.topic}
                      active={topic === t.topic && !review}
                      label={t.topic}
                      total={t.total}
                      approved={t.approved}
                      onClick={() => {
                        setTopic(t.topic);
                        setReview(null);
                      }}
                    />
                  ))}
                  {topics.data?.length === 0 && <p className="px-2.5 py-3 text-[12.5px] text-muted-foreground">No topics yet.</p>}
                </nav>
              )}
            </Card>
          </aside>

          <div className="min-w-0 space-y-4">
            {review ? (
              <Card className="ai-border flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold">Reviewing AI drafts{review.topic ? ` · ${review.topic}` : ''}</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    Check each question, edit anything that needs it, then approve. Only approved questions go on papers.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {canManage && reviewDrafts.length > 0 && (
                    <Button size="sm" onClick={() => bulk('APPROVED', reviewDrafts.map((r) => r.id))} loading={setStatusMut.isPending}>
                      <CheckCircle2 /> Approve all {reviewDrafts.length}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setReview(null)}>
                    <X /> Done reviewing
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center">
                <SearchInput value={search} onChange={setSearch} placeholder="Search questions…" className="xl:max-w-xs xl:flex-1" />
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:ml-auto xl:flex">
                  <Select value={topic ?? NONE} onValueChange={(v) => setTopic(v === NONE ? undefined : v)}>
                    <SelectTrigger className="lg:hidden" aria-label="Filter by topic">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>All topics</SelectItem>
                      {topicNames.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FilterSelect label="type" value={type} onChange={setType} all="All types" options={QUESTION_TYPES.map((t) => [t, QUESTION_TYPE_LABELS[t]])} />
                  <FilterSelect label="difficulty" value={difficulty} onChange={setDifficulty} all="Any difficulty" options={DIFFICULTIES.map((d) => [d, titleCase(d)])} />
                  <FilterSelect
                    label="status"
                    value={status}
                    onChange={setStatus}
                    all="Draft & approved"
                    options={[
                      ['DRAFT', 'Draft'],
                      ['APPROVED', 'Approved'],
                      ['RETIRED', 'Retired'],
                    ]}
                  />
                </div>
              </div>
            )}

            {canManage && rows && rows.length > 0 && (
              <div
                className={cn(
                  'flex min-h-11 flex-wrap items-center gap-2 rounded-xl border px-3 py-1.5 transition-colors',
                  selected.size ? 'border-brand/40 bg-brand-soft/50' : 'border-transparent',
                )}
              >
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={(v) => setSelected(v === true ? new Set([...selected, ...pageIds]) : new Set())}
                  aria-label="Select all on this page"
                />
                <span className="text-[12.5px] text-muted-foreground">{selected.size ? `${selected.size} selected` : 'Select all on this page'}</span>
                {selected.size > 0 && (
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => bulk('APPROVED')} loading={setStatusMut.isPending && !bulkRetire}>
                      <CheckCircle2 /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="text-danger" onClick={() => setBulkRetire(true)}>
                      <Trash2 /> Retire
                    </Button>
                  </div>
                )}
              </div>
            )}

            {list.isLoading ? (
              <div className="space-y-3" aria-busy>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i} className="space-y-3 p-5">
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-24 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-4/5" />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Skeleton className="h-8" />
                      <Skeleton className="h-8" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : list.error && !rows ? (
              <Card>
                <ErrorState error={list.error} onRetry={() => void list.refetch()} />
              </Card>
            ) : !rows || rows.length === 0 ? (
              <Card>
                <EmptyState
                  icon={filtered ? Filter : Layers}
                  tone={filtered ? 'default' : 'ai'}
                  title={filtered ? 'No questions match' : 'This bank is empty'}
                  description={
                    filtered
                      ? 'Try another topic, type or status.'
                      : 'Generate a set of draft questions with AI in under a minute, or write your first one yourself.'
                  }
                  action={!filtered ? actions : undefined}
                />
              </Card>
            ) : (
              <>
                <ul className={cn('space-y-3 transition-opacity', list.isPlaceholderData && 'opacity-60')}>
                  {rows.map((r) => (
                    <li key={r.id}>
                      <QuestionCard
                        q={r}
                        showTopic={!topic}
                        canManage={canManage}
                        selected={selected.has(r.id)}
                        onSelectedChange={canManage ? (on) => toggle(r.id, on) : undefined}
                        onEdit={() => setEditing(r)}
                        onStatus={(s) => setStatusMut.mutate({ ids: [r.id], status: s })}
                        onDelete={() => setDeleting(r)}
                      />
                    </li>
                  ))}
                </ul>
                {!review && list.data && list.data.total > PAGE_SIZE && (
                  <Card className="overflow-hidden">
                    <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} noun="questions" />
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {canManage && (
        <QuestionDialog
          open={addOpen || !!editing}
          onOpenChange={(o) => {
            if (!o) {
              setAddOpen(false);
              setEditing(null);
            }
          }}
          question={editing}
          subjectId={subjectId}
          classLevelId={classLevelId}
          defaultTopic={topic}
          topics={topicNames}
        />
      )}
      {canGenerate && (
        <GenerateQuestionsDialog
          open={genOpen && ready}
          onOpenChange={setGenOpen}
          subjectId={subjectId}
          classLevelId={classLevelId}
          defaultTopic={topic}
          onStarted={(j, t) => {
            jobTopic.current = t;
            announced.current = null;
            setReview(null);
            setJobId(j.id);
            queryClient.setQueryData(qk.aiJob(j.id), j);
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting?.usedInPapers ? 'Retire this question?' : 'Delete this question?'}
        description={
          deleting?.usedInPapers
            ? 'It’s on an exam paper, so it will be retired: hidden from the bank but kept on existing papers.'
            : 'It will be permanently removed from the bank.'
        }
        confirmLabel={deleting?.usedInPapers ? 'Retire' : 'Delete'}
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSuccess: () => setDeleting(null) })}
      />
      <ConfirmDialog
        open={bulkRetire}
        onOpenChange={setBulkRetire}
        title={`Retire ${selected.size} ${selected.size === 1 ? 'question' : 'questions'}?`}
        description="Retired questions are hidden from the bank and won’t be picked for new papers. Existing papers keep them."
        confirmLabel="Retire"
        loading={setStatusMut.isPending}
        onConfirm={() => bulk('RETIRED')}
      />
    </Page>
  );
}

function TopicButton({ active, label, total, approved, onClick }: { active: boolean; label: string; total: number; approved: number; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-current={active || undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-brand-soft font-medium text-brand' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <span className="min-w-0 flex-1 truncate" title={label}>
        {label}
      </span>
      <Badge variant={active ? 'brand' : 'outline'} className="tabular" title={`${approved} approved of ${total}`}>
        <span className={cn(approved > 0 && 'text-success')}>{approved}</span>/{total}
      </Badge>
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  all,
  options,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  all: string;
  options: (readonly [string, string])[];
}) {
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? undefined : v)}>
      <SelectTrigger className="xl:w-40" aria-label={`Filter by ${label}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{all}</SelectItem>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
