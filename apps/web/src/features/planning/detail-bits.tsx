import { Check, Pencil, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDocumentTitle } from '@/lib/hooks';

/** A page title that turns into an input on click (when editable). */
export function InlineTitle({
  value,
  editable,
  pending,
  onSave,
  label = 'Title',
}: {
  value: string;
  editable?: boolean;
  pending?: boolean;
  onSave: (value: string) => Promise<unknown>;
  label?: string;
}) {
  useDocumentTitle(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const save = async () => {
    const next = draft.trim();
    if (!next || next === value) {
      setEditing(false);
      return;
    }
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      /* toast shown by the mutation */
    }
  };

  if (editing) {
    return (
      <form
        className="flex max-w-2xl items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input
          ref={inputRef}
          aria-label={label}
          value={draft}
          maxLength={160}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false);
          }}
          className="h-11 font-display text-xl font-semibold"
        />
        <Button type="submit" size="icon" aria-label="Save title" loading={pending}>
          {!pending && <Check />}
        </Button>
        <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditing(false)}>
          <X />
        </Button>
      </form>
    );
  }

  return (
    <div className="group flex min-w-0 items-start gap-2">
      <h1 className="min-w-0 break-words font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{value}</h1>
      {editable && (
        <Button
          size="icon-sm"
          variant="ghost"
          className="mt-1 opacity-60 transition-opacity group-hover:opacity-100 print:hidden"
          aria-label={`Edit ${label.toLowerCase()}`}
          onClick={() => setEditing(true)}
        >
          <Pencil />
        </Button>
      )}
    </div>
  );
}

/** Confirm a regeneration, with optional fresh guidance for the AI. */
export function RegenerateDialog({
  open,
  onOpenChange,
  noun,
  pending,
  defaultGuidance,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noun: string;
  pending?: boolean;
  defaultGuidance?: string | null;
  onConfirm: (guidance: string | undefined) => void;
}) {
  const [guidance, setGuidance] = useState(defaultGuidance ?? '');
  useEffect(() => {
    if (open) setGuidance(defaultGuidance ?? '');
  }, [open, defaultGuidance]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(guidance.trim() || undefined);
          }}
        >
          <DialogHeader>
            <div className="ai-border mb-2 grid size-10 place-items-center rounded-xl bg-card">
              <AiSparkle className="size-5" />
            </div>
            <DialogTitle>Regenerate this {noun}?</DialogTitle>
            <DialogDescription>AI rewrites it from scratch. Any edits you’ve made to the current content will be replaced.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Guidance for the AI" htmlFor="regen-guidance" optional hint="Tell the AI what to do differently this time.">
              <Textarea
                id="regen-guidance"
                rows={4}
                value={guidance}
                maxLength={1500}
                onChange={(e) => setGuidance(e.target.value)}
                placeholder="e.g. Make it more practical, with more group work and local examples…"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="ai" loading={pending}>
              {!pending && <Sparkles />} Regenerate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
