import type { QuestionRow } from '@aischool/shared';
import { Check, CheckCircle2, ChevronDown, FileText, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { AiBadge, AssessmentStatusBadge, DifficultyBadge, LETTERS, QuestionTypeBadge } from '../assessment/ui';

interface Props {
  q: QuestionRow;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  canManage?: boolean;
  onEdit?: () => void;
  onStatus?: (status: QuestionRow['status']) => void;
  onDelete?: () => void;
  /** Show subject/topic context (e.g. in pickers). */
  showTopic?: boolean;
}

export function QuestionOptions({ q, reveal = true }: { q: Pick<QuestionRow, 'options' | 'correctIndex'>; reveal?: boolean }) {
  if (q.options.length === 0) return null;
  return (
    <ol className="grid gap-1.5 sm:grid-cols-2">
      {q.options.map((o, i) => {
        const correct = reveal && q.correctIndex === i;
        return (
          <li
            key={i}
            className={cn(
              'flex items-start gap-2.5 rounded-lg border px-2.5 py-1.5 text-[13px]',
              correct ? 'border-success/40 bg-success-soft/60' : 'border-border bg-muted/30',
            )}
          >
            <span
              className={cn(
                'mt-px grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-semibold',
                correct ? 'bg-success text-white' : 'bg-card text-muted-foreground ring-1 ring-border',
              )}
              aria-hidden
            >
              {correct ? <Check className="size-3" strokeWidth={3} /> : LETTERS[i]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="sr-only">Option {LETTERS[i]}: </span>
              {o}
              {correct && <span className="sr-only"> (correct answer)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function QuestionCard({ q, selected, onSelectedChange, canManage, onEdit, onStatus, onDelete, showTopic }: Props) {
  const [open, setOpen] = useState(false);
  const written = q.type === 'SHORT_ANSWER' || q.type === 'THEORY';
  const hasDetails = !!(q.answer || q.markingGuide);

  return (
    <Card
      className={cn(
        'p-4 transition-[border-color,box-shadow] sm:p-5',
        selected && 'border-brand/50 ring-1 ring-brand/30',
        q.status === 'RETIRED' && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-3">
        {onSelectedChange && (
          <Checkbox
            className="mt-1"
            checked={!!selected}
            onCheckedChange={(v) => onSelectedChange(v === true)}
            aria-label={`Select question: ${q.stem.slice(0, 60)}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <QuestionTypeBadge type={q.type} />
            <DifficultyBadge difficulty={q.difficulty} />
            <AssessmentStatusBadge status={q.status} />
            {q.source === 'AI' && <AiBadge />}
            {q.usedInPapers > 0 && (
              <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
                <FileText className="size-3" /> On {q.usedInPapers} {q.usedInPapers === 1 ? 'paper' : 'papers'}
              </span>
            )}
            <span className="ml-auto whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-[11.5px] font-medium tabular text-muted-foreground">
              {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
            </span>
          </div>
          {showTopic && <p className="mt-2 text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">{q.topic}</p>}
          <p className="mt-2.5 whitespace-pre-line text-[14px] leading-relaxed">{q.stem}</p>
          {q.options.length > 0 && (
            <div className="mt-3">
              <QuestionOptions q={q} />
            </div>
          )}
          {hasDetails && (
            <div className="mt-3">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md text-[12.5px] font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
                {open ? 'Hide' : 'Show'} {written ? 'answer & marking guide' : 'marking guide'}
              </button>
              {open && (
                <div className="mt-2 grid gap-3 rounded-xl border border-border bg-muted/30 p-3 text-[13px] leading-relaxed sm:grid-cols-2">
                  {q.answer && (
                    <div>
                      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Model answer</p>
                      <p className="mt-1 whitespace-pre-line">{q.answer}</p>
                    </div>
                  )}
                  {q.markingGuide && (
                    <div>
                      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Marking guide</p>
                      <p className="mt-1 whitespace-pre-line">{q.markingGuide}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Question actions" className="-mr-1 -mt-1">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil /> Edit
                </DropdownMenuItem>
              )}
              {onStatus && q.status !== 'APPROVED' && (
                <DropdownMenuItem onSelect={() => onStatus('APPROVED')}>
                  <CheckCircle2 /> Approve
                </DropdownMenuItem>
              )}
              {onStatus && q.status !== 'DRAFT' && (
                <DropdownMenuItem onSelect={() => onStatus('DRAFT')}>
                  <RotateCcw /> Move to draft
                </DropdownMenuItem>
              )}
              {onDelete && q.status !== 'RETIRED' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-danger focus:text-danger" onSelect={onDelete}>
                    <Trash2 /> {q.usedInPapers > 0 ? 'Retire' : 'Delete'}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </Card>
  );
}
