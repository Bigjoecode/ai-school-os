import type { CbtAiSuggestion, CbtMarkingQuestion } from '@aischool/shared';
import { Check, ChevronDown, PenLine, Save, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { useAiSuggest, useCbtMarking, useSaveMarks } from './api';

/**
 * Written answers, one question at a time across every student, so the
 * teacher marks consistently. AI suggestions are only suggestions: nothing is
 * saved until the teacher saves.
 */
export function MarkingPanel({ examId }: { examId: string }) {
  const q = useCbtMarking(examId);
  const [qid, setQid] = useState<string | null>(null);
  const questions = q.data?.questions ?? [];
  const current = questions.find((x) => x.questionId === qid) ?? questions[0];

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-80 rounded-2xl" />;
  if (!questions.length || questions.every((x) => !x.answers.length)) {
    return (
      <Card>
        <EmptyState icon={PenLine} title="Nothing to mark yet" description="Written answers appear here as students hand in." />
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2" aria-label="Written questions">
        {questions.map((x) => {
          const done = x.answers.length > 0 && x.marked === x.answers.length;
          const on = x.questionId === current?.questionId;
          return (
            <button
              key={x.questionId}
              type="button"
              onClick={() => setQid(x.questionId)}
              aria-current={on ? 'true' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors',
                on ? 'border-brand bg-brand text-brand-foreground' : 'border-border hover:bg-muted',
              )}
            >
              Q{x.number}
              <span className={cn('tabular text-[12px]', on ? 'opacity-80' : done ? 'text-success' : 'text-muted-foreground')}>
                {done ? <Check className="inline size-3.5" /> : `${x.marked}/${x.answers.length}`}
              </span>
            </button>
          );
        })}
      </nav>
      {current && <QuestionMarker key={current.questionId} examId={examId} q={current} />}
    </div>
  );
}

function QuestionMarker({ examId, q }: { examId: string; q: CbtMarkingQuestion }) {
  const canAi = useCan('ai.use');
  const save = useSaveMarks(examId);
  const ai = useAiSuggest(examId);
  const [showGuide, setShowGuide] = useState(true);
  const [onlyUnmarked, setOnlyUnmarked] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<Record<string, CbtAiSuggestion>>({});

  // Start from the saved marks whenever they change on the server.
  useEffect(() => {
    setDraft(Object.fromEntries(q.answers.map((a) => [a.attemptId, a.score == null ? '' : String(a.score)])));
  }, [q.answers]);

  const saved = useMemo(() => new Map(q.answers.map((a) => [a.attemptId, a.score])), [q.answers]);
  const dirty = q.answers.filter((a) => (draft[a.attemptId] ?? '') !== (a.score == null ? '' : String(a.score)));
  const invalid = dirty.filter((a) => {
    const v = draft[a.attemptId] ?? '';
    if (v === '') return false;
    const n = Number(v);
    return !Number.isFinite(n) || n < 0 || n > q.marks;
  });
  const shown = q.answers.filter((a) => !onlyUnmarked || saved.get(a.attemptId) == null);
  const unmarkedWithAnswer = q.answers.filter((a) => a.answer && saved.get(a.attemptId) == null);

  const suggest = () =>
    ai.mutate(
      { questionId: q.questionId },
      {
        onSuccess: (rows) => {
          setSuggestions((s) => ({ ...s, ...Object.fromEntries(rows.map((r) => [r.attemptId, r])) }));
          toast.success(`${rows.length} suggestion${rows.length === 1 ? '' : 's'} ready — check them, then save`);
        },
      },
    );

  const acceptAll = () =>
    setDraft((d) => {
      const next = { ...d };
      for (const [attemptId, s] of Object.entries(suggestions)) if ((d[attemptId] ?? '') === '') next[attemptId] = String(s.score);
      return next;
    });

  const submit = () => {
    if (invalid.length) {
      toast.error(`Marks must be between 0 and ${q.marks}`);
      return;
    }
    save.mutate(
      { marks: dirty.map((a) => ({ attemptId: a.attemptId, questionId: q.questionId, score: draft[a.attemptId] === '' ? null : Number(draft[a.attemptId]) })) },
      { onSuccess: (r) => toast.success(`${r.saved} mark${r.saved === 1 ? '' : 's'} saved`) },
    );
  };

  return (
    <>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-muted-foreground">
              Question {q.number} · {q.marks} mark{q.marks === 1 ? '' : 's'} · {q.marked} of {q.answers.length} marked
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-[15px] font-medium leading-relaxed">{q.stem}</p>
          </div>
          {canAi && (
            <Button variant="ai" onClick={suggest} loading={ai.isPending} disabled={!unmarkedWithAnswer.length} title={!unmarkedWithAnswer.length ? 'Every written answer is marked' : undefined}>
              <Sparkles /> Suggest marks with AI
            </Button>
          )}
        </div>
        {(q.markingGuide || q.answer) && (
          <div className="mt-4 rounded-xl border border-border bg-muted/40">
            <button type="button" onClick={() => setShowGuide((v) => !v)} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] font-medium" aria-expanded={showGuide}>
              Marking guide and model answer
              <ChevronDown className={cn('size-4 transition-transform', showGuide && 'rotate-180')} />
            </button>
            {showGuide && (
              <div className="grid gap-3 border-t border-border px-4 py-3 text-[13px] sm:grid-cols-2">
                {q.markingGuide && (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Marking guide</p>
                    <p className="whitespace-pre-wrap">{q.markingGuide}</p>
                  </div>
                )}
                {q.answer && (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Model answer</p>
                    <p className="whitespace-pre-wrap">{q.answer}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="sticky top-14 z-10 -mx-1 flex flex-wrap items-center gap-2 bg-background/90 px-1 py-2 backdrop-blur">
        <Button size="sm" variant={onlyUnmarked ? 'default' : 'outline'} onClick={() => setOnlyUnmarked((v) => !v)} aria-pressed={onlyUnmarked}>
          Only unmarked
        </Button>
        {Object.keys(suggestions).length > 0 && (
          <Button size="sm" variant="outline" onClick={acceptAll}>
            <Wand2 /> Use AI marks for empty boxes
          </Button>
        )}
        <span className="ml-auto text-[12.5px] text-muted-foreground tabular">{dirty.length ? `${dirty.length} unsaved` : 'All saved'}</span>
        <Button size="sm" onClick={submit} disabled={!dirty.length} loading={save.isPending}>
          <Save /> Save marks
        </Button>
      </div>

      <ul className="space-y-3">
        {shown.map((a) => {
          const s = suggestions[a.attemptId];
          const v = draft[a.attemptId] ?? '';
          const bad = invalid.some((x) => x.attemptId === a.attemptId);
          return (
            <li key={a.attemptId}>
              <Card className={cn('p-4 sm:p-5', saved.get(a.attemptId) == null && 'border-warning/30')}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">
                      {a.student.name} <span className="font-normal text-muted-foreground">· {a.student.admissionNumber}</span>
                    </p>
                    {a.answer ? <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-relaxed">{a.answer}</p> : <p className="mt-2 text-[13px] italic text-muted-foreground">No answer — given 0 automatically.</p>}
                    {s && (
                      <div className="mt-3 rounded-lg bg-ai-2/[0.06] px-3 py-2 text-[12.5px]">
                        <p className="flex flex-wrap items-center gap-2 font-medium text-ai-2">
                          <Sparkles className="size-3.5" /> AI suggests {s.score}/{s.outOf}
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[12px]" onClick={() => setDraft((d) => ({ ...d, [a.attemptId]: String(s.score) }))}>
                            Use
                          </Button>
                        </p>
                        {s.reasons.length > 0 && (
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                            {s.reasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                    <label className="flex items-center gap-1.5 text-[13px]">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={q.marks}
                        step={0.5}
                        value={v}
                        onChange={(e) => setDraft((d) => ({ ...d, [a.attemptId]: e.target.value }))}
                        className="h-10 w-20 text-right tabular"
                        aria-label={`Mark for ${a.student.name}`}
                        invalid={bad}
                      />
                      <span className="text-muted-foreground tabular">/ {q.marks}</span>
                    </label>
                    {saved.get(a.attemptId) != null ? <Badge variant="success">Marked</Badge> : <Badge variant="warning">To mark</Badge>}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
