import type { UploadedFile } from '@aischool/shared';
import { FileUp, GripVertical, ImagePlus, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { type DraftKind, UPLOAD_ACCEPT, useUpload, useWebsiteDraft } from './api';

// ------------------------------------------------------------------ section card

export function SectionCard({ id, title, description, actions, children, className }: { id?: string; title: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card id={id} className={cn('scroll-mt-24', className)}>
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="space-y-5 p-5 sm:p-6">{children}</div>
    </Card>
  );
}

// ------------------------------------------------------------------ uploads

/** An image slot: preview, upload/replace and remove. */
export function ImageUpload({ value, onChange, label, aspect = 'aspect-[16/9]', className, round }: { value: string | null; onChange: (url: string | null) => void; label: string; aspect?: string; className?: string; round?: boolean }) {
  const upload = useUpload(true);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const pick = (file: File | undefined) => {
    if (!file) return;
    upload.mutate(file, {
      onSuccess: (f) => {
        onChange(f.url);
        toast.success('Image uploaded');
      },
    });
  };
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files[0]);
        }}
        aria-label={value ? `Replace ${label}` : `Upload ${label}`}
        className={cn(
          'group relative grid shrink-0 place-items-center overflow-hidden border border-dashed border-border-strong bg-muted/40 text-muted-foreground transition-colors hover:border-brand/50 hover:text-brand',
          round ? 'size-20 rounded-full' : cn('w-40 rounded-xl sm:w-48', aspect),
          value && 'border-solid',
        )}
      >
        {value ? <img src={value} alt="" className="absolute inset-0 size-full object-cover" /> : <ImagePlus className="size-5" aria-hidden />}
        {upload.isPending && (
          <span className="absolute inset-0 grid place-items-center bg-background/70">
            <Loader2 className="size-5 animate-spin text-brand" aria-hidden />
          </span>
        )}
      </button>
      <div className="min-w-0 space-y-2">
        <p className="text-[13px] font-medium">{label}</p>
        <p className="text-[12px] text-muted-foreground">JPG, PNG, WebP or GIF, up to 10 MB.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} loading={upload.isPending}>
            {value ? <RefreshCw /> : <FileUp />} {value ? 'Replace' : 'Upload'}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X /> Remove
            </Button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT.image}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** A plain file picker that uploads and reports the result. */
export function FileUploadButton({ onUploaded, accept = UPLOAD_ACCEPT.document, children, multiple, variant = 'outline', size = 'sm' }: { onUploaded: (f: UploadedFile, file: File) => void; accept?: string; children: React.ReactNode; multiple?: boolean; variant?: 'outline' | 'default' | 'brand'; size?: 'sm' | 'default' }) {
  const upload = useUpload(true);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(0);
  const run = async (files: File[]) => {
    setBusy(files.length);
    for (const file of files) {
      try {
        const f = await upload.mutateAsync(file);
        onUploaded(f, file);
      } catch (err) {
        toast.error(`${file.name}: ${errorMessage(err)}`);
      }
      setBusy((n) => n - 1);
    }
  };
  return (
    <>
      <Button type="button" variant={variant} size={size} loading={busy > 0} onClick={() => inputRef.current?.click()}>
        {busy === 0 && <FileUp />}
        {busy > 1 ? `Uploading ${busy}…` : children}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) void run(files);
        }}
      />
    </>
  );
}

// ------------------------------------------------------------------ list editors

export function StringListEditor({ items, onChange, placeholder, max, addLabel = 'Add', id }: { items: string[]; onChange: (v: string[]) => void; placeholder?: string; max: number; addLabel?: string; id?: string }) {
  return (
    <div className="space-y-2" id={id}>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <GripVertical className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
          <Input value={it} placeholder={placeholder} aria-label={`${placeholder ?? 'Item'} ${i + 1}`} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      {items.length < max && (
        <Button type="button" variant="ghost" size="sm" className="text-brand hover:text-brand" onClick={() => onChange([...items, ''])}>
          <Plus /> {addLabel}
        </Button>
      )}
    </div>
  );
}

export function PairListEditor<K1 extends string, K2 extends string>({
  items,
  onChange,
  keys,
  labels,
  max,
  addLabel = 'Add',
  multiline = true,
}: {
  items: Record<K1 | K2, string>[];
  onChange: (v: Record<K1 | K2, string>[]) => void;
  keys: [K1, K2];
  labels: [string, string];
  max: number;
  addLabel?: string;
  multiline?: boolean;
}) {
  const [a, b] = keys;
  const update = (i: number, k: K1 | K2, val: string) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="group relative rounded-xl border border-border bg-muted/25 p-3 pr-11">
          <div className="grid gap-2">
            <Input value={it[a]} placeholder={labels[0]} aria-label={`${labels[0]} ${i + 1}`} onChange={(e) => update(i, a, e.target.value)} className="font-medium" />
            {multiline ? (
              <Textarea value={it[b]} placeholder={labels[1]} aria-label={`${labels[1]} ${i + 1}`} rows={2} className="h-auto min-h-[64px]" onChange={(e) => update(i, b, e.target.value)} />
            ) : (
              <Input value={it[b]} placeholder={labels[1]} aria-label={`${labels[1]} ${i + 1}`} onChange={(e) => update(i, b, e.target.value)} />
            )}
          </div>
          <Button type="button" variant="ghost" size="icon-sm" className="absolute right-1.5 top-1.5" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      {items.length < max && (
        <Button type="button" variant="ghost" size="sm" className="text-brand hover:text-brand" onClick={() => onChange([...items, { [a]: '', [b]: '' } as Record<K1 | K2, string>])}>
          <Plus /> {addLabel}
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ AI drafts

const KIND_COPY: Record<DraftKind, { title: string; placeholder: string }> = {
  HERO: { title: 'Write the home page headline', placeholder: 'e.g. Warm, ambitious, mention small classes and our two campuses in Lekki and Ikeja.' },
  ABOUT: { title: 'Write the About page', placeholder: 'e.g. Founded in 2009 with 46 pupils. Emphasise character, close parent partnership and clubs.' },
  ACADEMICS: { title: 'Write the Academics page', placeholder: 'e.g. Nigerian curriculum plus coding, French and project work. BECE, WAEC and NECO.' },
  ADMISSIONS: { title: 'Write the Admissions page', placeholder: 'e.g. Year-round admission, entrance test in English and maths, parents get a call within 2 days.' },
  FAQ: { title: 'Write frequently asked questions', placeholder: 'e.g. Ages admitted, school bus, uniforms, school hours, fees and how to check results.' },
  NEWS: { title: 'Draft a news post', placeholder: 'e.g. Our JSS 3 debate team won the Lagos State final on Friday. Thank the coach Mrs Okafor.' },
};

function DraftPreview({ draft }: { draft: Record<string, unknown> }) {
  const entries = Object.entries(draft).filter(([k]) => !['text', 'provider', 'model'].includes(k));
  return (
    <div className="space-y-4">
      {entries.map(([k, v]) => (
        <div key={k}>
          <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">{k.replace(/([A-Z])/g, ' $1')}</p>
          {Array.isArray(v) ? (
            <ul className="space-y-1.5 text-[13.5px]">
              {v.map((item, i) => (
                <li key={i} className="rounded-lg bg-muted/50 px-3 py-2">
                  {typeof item === 'string' ? (
                    item
                  ) : (
                    <>
                      <span className="font-medium">{String((item as Record<string, unknown>).title ?? (item as Record<string, unknown>).question ?? '')}</span>
                      <span className="block text-muted-foreground">{String((item as Record<string, unknown>).description ?? (item as Record<string, unknown>).answer ?? '')}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="whitespace-pre-wrap rounded-lg bg-muted/50 px-3 py-2 text-[13.5px] leading-relaxed">{String(v ?? '')}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** "Write with AI": a brief → a reviewed draft → applied into the form. Hidden without ai.use. */
export function AiDraftButton({ kind, onApply, size = 'sm', label = 'Write with AI' }: { kind: DraftKind; onApply: (draft: Record<string, unknown>) => void; size?: 'sm' | 'default'; label?: string }) {
  const canAi = useCan('ai.use');
  const [open, setOpen] = React.useState(false);
  const [brief, setBrief] = React.useState('');
  const draft = useWebsiteDraft();
  if (!canAi) return null;
  const copy = KIND_COPY[kind];
  const result = draft.data;
  return (
    <>
      <Button type="button" variant="outline" size={size} onClick={() => setOpen(true)} className="ai-border">
        <AiSparkle /> {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) draft.reset();
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-xl bg-ai-gradient text-white">
              <AiSparkle animated={false} className="size-5 [&_path]:fill-white" />
            </div>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>Describe what you want. The AI writes from your school’s real details — review the draft before it goes into the form. Nothing is published until you save.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label="Brief" htmlFor={`brief-${kind}`} hint="A sentence or two is plenty.">
              <Textarea className="h-auto" id={`brief-${kind}`} rows={3} value={brief} placeholder={copy.placeholder} onChange={(e) => setBrief(e.target.value)} />
            </Field>
            {draft.isPending && (
              <div className="space-y-2 rounded-xl border border-border p-4" aria-live="polite">
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <AiSparkle /> Writing your draft…
                </p>
                {[0, 1, 2].map((i) => (
                  <div key={i} className={cn('h-3 animate-pulse rounded bg-muted', i === 2 ? 'w-2/3' : 'w-full')} />
                ))}
              </div>
            )}
            {result && !draft.isPending && (
              <div className="rounded-xl border border-border p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold">Draft</p>
                  <Badge variant="outline">{result.model}</Badge>
                </div>
                <DraftPreview draft={result} />
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {result ? (
              <>
                <Button type="button" variant="outline" loading={draft.isPending} disabled={brief.trim().length < 3} onClick={() => draft.mutate({ kind, brief: brief.trim() })}>
                  <RefreshCw /> Try again
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    onApply(result);
                    setOpen(false);
                    draft.reset();
                    toast.success('Draft added to the form — review it, then save');
                  }}
                >
                  Use this draft
                </Button>
              </>
            ) : (
              <Button type="button" variant="ai" loading={draft.isPending} disabled={brief.trim().length < 3} onClick={() => draft.mutate({ kind, brief: brief.trim() })}>
                Write draft
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ------------------------------------------------------------------ helpers

export const str = (v: unknown) => (typeof v === 'string' ? v : '');
export const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
export function pairList<A extends string, B extends string>(v: unknown, a: A, b: B): Record<A | B, string>[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x && typeof x === 'object').map((x) => ({ [a]: str((x as Record<string, unknown>)[a]), [b]: str((x as Record<string, unknown>)[b]) }) as Record<A | B, string>);
}
