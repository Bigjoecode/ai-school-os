import { AWARD_CATEGORIES, AWARD_CATEGORY_LABELS, type AwardCategory, awardSchema } from '@aischool/shared';
import { Medal, Sparkles } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { schoolToday } from '../finance/ui';
import { useDraftCitation, useGiveAward } from './api';
import { StaffSelect } from './ui';

export interface AwardPrefill {
  staffId?: string;
  title?: string;
  category?: AwardCategory;
  notes?: string;
}

const DEFAULT_TITLES: Record<AwardCategory, string> = {
  EXCELLENCE: 'Award for Excellence',
  TEACHER_OF_TERM: 'Teacher of the Term',
  PUNCTUALITY: 'Punctuality Award',
  LONG_SERVICE: 'Long Service Award',
  INNOVATION: 'Innovation Award',
  SERVICE: 'Outstanding Service Award',
  OTHER: '',
};

export function GiveAwardDialog({ open, onOpenChange, prefill }: { open: boolean; onOpenChange: (o: boolean) => void; prefill?: AwardPrefill | null }) {
  const canAi = useCan('ai.use');
  const give = useGiveAward();
  const draft = useDraftCitation();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [category, setCategory] = useState<AwardCategory>('EXCELLENCE');
  const [title, setTitle] = useState('');
  const [awardedOn, setAwardedOn] = useState(schoolToday());
  const [prize, setPrize] = useState('');
  const [citation, setCitation] = useState('');
  const [notes, setNotes] = useState('');
  const [shortVersion, setShortVersion] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const cat = prefill?.category ?? 'EXCELLENCE';
    setStaffId(prefill?.staffId ?? null);
    setCategory(cat);
    setTitle(prefill?.title ?? DEFAULT_TITLES[cat]);
    setAwardedOn(schoolToday());
    setPrize('');
    setCitation('');
    setNotes(prefill?.notes ?? '');
    setShortVersion(null);
    setErrors({});
    draft.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill]);

  const changeCategory = (c: AwardCategory) => {
    if (!title.trim() || Object.values(DEFAULT_TITLES).includes(title)) setTitle(DEFAULT_TITLES[c]);
    setCategory(c);
  };

  const runDraft = () => {
    const next: Record<string, string> = {};
    if (!staffId) next.staffId = 'Choose who the award is for first';
    if (title.trim().length < 2) next.title = 'Give the award a title first';
    setErrors(next);
    if (Object.keys(next).length || !staffId) return;
    draft.mutate(
      { staffId, title: title.trim(), category, notes: notes.trim() || undefined },
      {
        onSuccess: (r) => {
          setCitation(r.citation);
          setShortVersion(r.shortVersion);
        },
      },
    );
  };

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = awardSchema.safeParse({ staffId: staffId ?? '', title, category, citation, prize, awardedOn });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.path[0] === 'staffId' ? 'Choose a staff member' : i.message])));
      return;
    }
    setErrors({});
    give.mutate(parsed.data, {
      onSuccess: () => onOpenChange(false),
      onError: (err) => {
        if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
        else toast.error(err.message);
      },
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Give an award"
      description="Recognise a colleague. The award appears on their record and in My HR."
      icon={<Medal />}
      submitLabel="Give award"
      pending={give.isPending}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid gap-4">
        <Field label="Awarded to" htmlFor="aw-staff" error={errors.staffId}>
          <StaffSelect id="aw-staff" value={staffId} onChange={setStaffId} invalid={!!errors.staffId} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Category" htmlFor="aw-cat">
            <Select value={category} onValueChange={(v) => changeCategory(v as AwardCategory)}>
              <SelectTrigger id="aw-cat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AWARD_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {AWARD_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date" htmlFor="aw-date" error={errors.awardedOn}>
            <Input id="aw-date" type="date" value={awardedOn} onChange={(e) => setAwardedOn(e.target.value)} className="tabular [color-scheme:light] dark:[color-scheme:dark]" invalid={!!errors.awardedOn} />
          </Field>
        </div>
        <Field label="Title" htmlFor="aw-title" error={errors.title}>
          <Input id="aw-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Teacher of the Term — First Term 2026/27" invalid={!!errors.title} />
        </Field>
        <Field label="Prize" htmlFor="aw-prize" optional>
          <Input id="aw-prize" value={prize} onChange={(e) => setPrize(e.target.value)} maxLength={120} placeholder="e.g. Certificate and ₦50,000 shopping voucher" />
        </Field>

        {canAi && (
          <div className="rounded-xl border border-border bg-muted/30 p-3.5">
            <Field label="Notes for the AI" htmlFor="aw-notes" optional hint="A line or two on why — the AI also reads their record (years of service, punctuality, classes).">
              <Textarea id="aw-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={600} placeholder="e.g. Ran the inter-house science fair and coached JSS 3 to first place" />
            </Field>
            <Button type="button" variant="ai" size="sm" className="mt-3" onClick={runDraft} loading={draft.isPending}>
              {!draft.isPending && <Sparkles />} {draft.isPending ? 'Drafting…' : citation ? 'Redraft with AI' : 'Draft with AI'}
            </Button>
          </div>
        )}

        <Field
          label="Citation"
          htmlFor="aw-cit"
          optional
          error={errors.citation}
          hint={
            shortVersion ? (
              <span className="flex items-start gap-1.5">
                <AiSparkle className="mt-0.5 size-3 shrink-0" animated={false} />
                <span>
                  <span className="font-medium text-foreground">For the certificate:</span> {shortVersion}
                </span>
              </span>
            ) : (
              'Read out at the presentation.'
            )
          }
        >
          <Textarea id="aw-cit" rows={6} value={citation} onChange={(e) => setCitation(e.target.value)} maxLength={2000} className={draft.isPending ? 'opacity-60' : undefined} />
        </Field>
      </div>
    </FormDialog>
  );
}
