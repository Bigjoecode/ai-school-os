import { LESSON_REVIEW_LABELS, type AiLessonCheck, type LessonReviewStatus, type VettedLessonDetail } from '@aischool/shared';
import { CheckCircle2, ClipboardCheck, Clock, Lightbulb, RotateCcw, Send, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Textarea } from '@/components/ui/textarea';
import { useCan } from '@/lib/auth-store';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { isGenerating } from '../planning/ui';
import { useAiLessonCheck, useReviewLesson, useSubmitLesson, useWithdrawLesson } from './api';

const VARIANT: Record<LessonReviewStatus, BadgeProps['variant']> = {
  NOT_SUBMITTED: 'outline',
  SUBMITTED: 'info',
  APPROVED: 'success',
  RETURNED: 'danger',
};

export function ReviewStatusBadge({ status, late, className }: { status: LessonReviewStatus; late?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Badge variant={VARIANT[status]} dot>
        {LESSON_REVIEW_LABELS[status]}
      </Badge>
      {late && status !== 'NOT_SUBMITTED' && (
        <Badge variant="warning" title="Submitted after its week had started">
          Late
        </Badge>
      )}
    </span>
  );
}

/** Why a plan can't be submitted yet, or null. Mirrors the API's check. */
export function contentProblem(l: VettedLessonDetail): string | null {
  if (isGenerating(l.generation)) return 'It is still being written by AI';
  if (!l.objectives.length) return 'Add learning objectives first';
  if (!l.steps.length) return 'Add the lesson steps first';
  return null;
}

/**
 * The vetting strip on a lesson plan: the teacher sees where their note is
 * (and the reviewer's comments); a reviewer approves it or returns it.
 */
export function VettingPanel({ l }: { l: VettedLessonDetail }) {
  const canManage = useCan('lessons.manage');
  const canAi = useCan('ai.use');
  const submit = useSubmitLesson(l.id);
  const withdraw = useWithdrawLesson(l.id);
  const review = useReviewLesson(l.id);
  const aiCheck = useAiLessonCheck(l.id);
  const [returnOpen, setReturnOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [tried, setTried] = useState(false);

  const status = l.reviewStatus;
  const owner = l.mine && canManage;
  const problem = contentProblem(l);
  const reviewer = l.reviewedBy?.name ?? 'the reviewer';

  if (!owner && !l.canReview && status === 'NOT_SUBMITTED') return null;

  const tone =
    status === 'RETURNED' ? 'border-danger/30 bg-danger-soft/40' : status === 'APPROVED' ? 'border-success/30 bg-success-soft/40' : status === 'SUBMITTED' ? 'border-info/30 bg-info-soft/40' : '';

  const openReturn = (text = '') => {
    setDraft(text);
    setTried(false);
    setReturnOpen(true);
  };

  return (
    <div className="space-y-3 print:hidden">
      <Card className={cn('p-4 sm:p-5', tone)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-card text-muted-foreground shadow-xs">
              {status === 'APPROVED' ? (
                <CheckCircle2 className="size-4 text-success" />
              ) : status === 'RETURNED' ? (
                <RotateCcw className="size-4 text-danger" />
              ) : status === 'SUBMITTED' ? (
                <Clock className="size-4 text-info" />
              ) : (
                <ClipboardCheck className="size-4" />
              )}
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-[14.5px] font-semibold tracking-tight">Lesson note vetting</h2>
                <ReviewStatusBadge status={status} late={l.late} />
              </div>
              <p className="text-[13px] text-muted-foreground">
                {status === 'NOT_SUBMITTED' &&
                  (problem ? `Not submitted yet. ${problem} before submitting.` : 'Not submitted yet. Submit it so your HOD or principal can vet it before the week starts.')}
                {status === 'SUBMITTED' &&
                  `Submitted ${formatDateTime(l.submittedAt)}${l.mine ? ' — waiting to be vetted.' : l.teacher ? ` by ${l.teacher.name}.` : '.'}`}
                {status === 'APPROVED' && `Approved by ${reviewer} on ${formatDate(l.reviewedAt)}.`}
                {status === 'RETURNED' &&
                  `Returned by ${reviewer} on ${formatDate(l.reviewedAt)}${l.mine ? '. Make the corrections below, then resubmit.' : '.'}`}
              </p>
              {l.reviewNote && (status === 'RETURNED' || status === 'APPROVED' || status === 'SUBMITTED') && (
                <blockquote className="mt-2 whitespace-pre-line rounded-lg border-l-2 border-border-strong bg-card px-3 py-2 text-[13px] leading-relaxed">
                  {status === 'SUBMITTED' && <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Earlier corrections</span>}
                  {l.reviewNote}
                </blockquote>
              )}
              {owner && status === 'APPROVED' && (
                <p className="text-[12px] text-muted-foreground">Changing the plan’s content takes it back to “not submitted” — it will need vetting again.</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            {owner && (status === 'NOT_SUBMITTED' || status === 'RETURNED') && (
              <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={!!problem}>
                <Send /> {status === 'RETURNED' ? 'Resubmit for vetting' : 'Submit for vetting'}
              </Button>
            )}
            {owner && status === 'SUBMITTED' && (
              <Button variant="outline" onClick={() => withdraw.mutate()} loading={withdraw.isPending}>
                <Undo2 /> Withdraw
              </Button>
            )}
            {l.canReview && (
              <>
                {canAi && (
                  <Button variant="outline" onClick={() => aiCheck.mutate()} loading={aiCheck.isPending}>
                    <AiSparkle className="size-3.5" animated={false} /> AI check
                  </Button>
                )}
                <Button variant="outline" onClick={() => openReturn()}>
                  <RotateCcw /> Return
                </Button>
                <Button variant="brand" onClick={() => review.mutate({ decision: 'APPROVE' })} loading={review.isPending && review.variables?.decision === 'APPROVE'}>
                  <CheckCircle2 /> Approve
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {l.canReview && aiCheck.data && <AiCheckCard check={aiCheck.data} onUse={(text) => openReturn(text)} />}

      <FormDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        title="Return with corrections"
        description={`${l.teacher?.name ?? 'The teacher'} will be notified and will see your comments on the lesson plan.`}
        icon={<RotateCcw />}
        submitLabel="Return lesson note"
        pending={review.isPending}
        onSubmit={(e) => {
          e?.preventDefault();
          setTried(true);
          if (draft.trim().length < 3) return;
          review.mutate({ decision: 'RETURN', note: draft.trim() }, { onSuccess: () => setReturnOpen(false) });
        }}
      >
        <Field
          label="What needs correcting"
          htmlFor="vet-note"
          error={tried && draft.trim().length < 3 ? 'Say what needs correcting — a note is required to return a lesson note' : undefined}
          hint="Required. Be specific so the teacher can fix it quickly."
        >
          <Textarea id="vet-note" rows={7} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={3000} autoFocus />
        </Field>
      </FormDialog>
    </div>
  );
}

function AiCheckCard({ check, onUse }: { check: AiLessonCheck; onUse: (text: string) => void }) {
  const asNote = check.suggestions.map((s, i) => `${i + 1}. ${s.title}: ${s.detail}`).join('\n');
  return (
    <Card className="relative overflow-hidden p-4 sm:p-5">
      <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-ai-gradient" />
      <div className="flex flex-wrap items-center gap-2">
        <AiSparkle className="size-4" animated={false} />
        <h3 className="font-display text-[14px] font-semibold tracking-tight">AI check</h3>
        <span className="text-[12px] text-muted-foreground">A draft for you — nothing is saved or sent.</span>
        {check.suggestions.length > 0 && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => onUse(asNote)}>
            Use as return note
          </Button>
        )}
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed">{check.summary}</p>
      {check.strengths.length > 0 && (
        <ul className="mt-3 space-y-1 text-[13px]">
          {check.strengths.map((s, i) => (
            <li key={i} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /> <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
      {check.suggestions.length > 0 && (
        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {check.suggestions.map((s, i) => (
            <li key={i} className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                <Lightbulb className="size-3.5 text-warning" /> {s.title}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{s.detail}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
