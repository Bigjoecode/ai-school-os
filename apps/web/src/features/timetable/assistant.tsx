import type { InterpretResult, TimetableChange } from '@aischool/shared';
import { Ban, CalendarCheck2, CheckCircle2, DoorOpen, HelpCircle, Layers2, ListOrdered, RotateCw, Send } from 'lucide-react';
import type * as React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useApplyChanges, useInterpretRequest } from './api';

const EXAMPLES = [
  'Mrs Eze can’t teach on Friday afternoons',
  'JSS 3 needs 6 maths periods a week',
  'Chemistry should use the lab as a double',
];

const KIND: Record<TimetableChange['kind'], { icon: React.ElementType; label: string }> = {
  teacher_unavailable: { icon: Ban, label: 'Block periods' },
  teacher_available: { icon: CalendarCheck2, label: 'Free up periods' },
  set_periods: { icon: ListOrdered, label: 'Weekly periods' },
  set_room_kind: { icon: DoorOpen, label: 'Room' },
  set_double: { icon: Layers2, label: 'Double lesson' },
};

/**
 * Plain-English constraint editing: the AI proposes changes, nothing is saved
 * until the user ticks and applies them.
 */
export function TimetableAssistant({
  onRebuild,
  rebuildLabel = 'Rebuild the timetable',
  className,
}: {
  /** Offered after applying so the new constraints take effect. */
  onRebuild?: () => void;
  rebuildLabel?: string;
  className?: string;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<InterpretResult | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [applied, setApplied] = useState<string[] | null>(null);
  const interpret = useInterpretRequest();
  const apply = useApplyChanges();

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (t.length < 3 || interpret.isPending) return;
    setApplied(null);
    interpret.mutate(t, {
      onSuccess: (r) => {
        setResult(r);
        setPicked(new Set(r.changes.map((_, i) => i)));
      },
    });
  };

  const onApply = () => {
    if (!result) return;
    const changes = result.changes.filter((_, i) => picked.has(i));
    if (!changes.length) return;
    apply.mutate(changes, {
      onSuccess: (r) => {
        setApplied(r.applied);
        setResult(null);
        setText('');
        toast.success(`Applied ${r.applied.length} ${r.applied.length === 1 ? 'change' : 'changes'}`, {
          description: 'Rebuild the timetable to use these changes.',
        });
      },
    });
  };

  const toggle = (i: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className={cn('space-y-4', className)}>
      <Card className="ai-border ai-glow relative overflow-hidden border-transparent">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-ai-2/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-6 size-56 rounded-full bg-ai-3/10 blur-3xl" />
        <form onSubmit={submit} className="relative p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ai-gradient shadow-[0_6px_20px_-6px_var(--ai-2)]">
              <AiSparkle className="size-[18px] [&_path]:fill-white" animated={false} />
            </span>
            <div className="min-w-0">
              <p className="font-display font-semibold tracking-tight">Timetable assistant</p>
              <p className="text-[12.5px] text-muted-foreground">Tell me what to change. I’ll show you exactly what I understood before anything is saved.</p>
            </div>
          </div>
          <label htmlFor="tt-assistant" className="sr-only">
            Tell the assistant what to change
          </label>
          <Textarea
            id="tt-assistant"
            rows={3}
            value={text}
            maxLength={1500}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
            }}
            placeholder="e.g. ‘Mrs Eze can’t teach on Friday afternoons’, ‘JSS 3 needs 6 maths periods a week’, ‘Chemistry should use the lab as a double’"
            className="mt-4 bg-background/70"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setText(ex)}
                className="rounded-full border border-border bg-card/70 px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                {ex}
              </button>
            ))}
            <Button type="submit" variant="ai" size="sm" className="ml-auto" loading={interpret.isPending} disabled={text.trim().length < 3}>
              {!interpret.isPending && <Send />} {interpret.isPending ? 'Reading…' : 'Suggest changes'}
            </Button>
          </div>
        </form>
      </Card>

      {result && (
        <Card className="p-5" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-display font-semibold tracking-tight">
              {result.changes.length ? `I found ${result.changes.length} ${result.changes.length === 1 ? 'change' : 'changes'}` : 'Nothing to change yet'}
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              {result.provider} · {result.model}
            </p>
          </div>
          {result.changes.length > 0 && (
            <>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">Untick anything that isn’t right, then apply.</p>
              <ul className="mt-3 space-y-2">
                {result.changes.map((c, i) => {
                  const k = KIND[c.kind];
                  const id = `tt-change-${i}`;
                  return (
                    <li key={i}>
                      <label
                        htmlFor={id}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors',
                          picked.has(i) ? 'border-brand/40 bg-brand-soft/40' : 'border-border bg-card hover:bg-muted/40',
                        )}
                      >
                        <Checkbox id={id} checked={picked.has(i)} onCheckedChange={() => toggle(i)} className="mt-0.5" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-medium">{c.summary}</span>
                          <span className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
                            <k.icon className="size-3" aria-hidden /> {k.label}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {result.notUnderstood.trim() && (
            <p className="mt-3 flex gap-2 rounded-xl border border-warning/30 bg-warning-soft/60 px-3.5 py-2.5 text-[12.5px]">
              <HelpCircle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>
                <span className="font-medium">Not sure about: </span>
                {result.notUnderstood}
              </span>
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setResult(null)}>
              Discard
            </Button>
            {result.changes.length > 0 && (
              <Button size="sm" onClick={onApply} loading={apply.isPending} disabled={picked.size === 0}>
                {!apply.isPending && <CheckCircle2 />} Apply {picked.size === result.changes.length ? 'all' : `${picked.size} selected`}
              </Button>
            )}
          </div>
        </Card>
      )}

      {applied && (
        <Card className="flex flex-col gap-3 border-success/30 p-4 sm:flex-row sm:items-center" role="status">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
              <CheckCircle2 className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold">
                {applied.length} {applied.length === 1 ? 'change' : 'changes'} saved — rebuild the timetable to use {applied.length === 1 ? 'it' : 'them'}
              </p>
              {applied.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-[12.5px] text-muted-foreground">
                  {applied.map((a, i) => (
                    <li key={i}>· {a}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {onRebuild && (
            <Button size="sm" variant="outline" onClick={onRebuild}>
              <RotateCw /> {rebuildLabel}
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
