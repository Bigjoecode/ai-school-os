import { ADMISSION_NOTIFY_CHANNELS, admissionsSettingsSchema } from '@aischool/shared';
import { Plus, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { koboToInput, MoneyInput, parseNaira } from '../finance/ui';
import { apiFieldErrors, FormError, zodErrors } from '../operations/ui';
import { useAdmissionsMeta, useSaveAdmissionsSettings } from './api';

const CHANNEL_LABEL = { SMS: 'SMS', EMAIL: 'Email' } as const;

export function AdmissionsSettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const meta = useAdmissionsMeta();
  const save = useSaveAdmissionsSettings();
  const base = meta.data?.settings;
  const [fee, setFee] = useState('');
  const [docs, setDocs] = useState<string[]>([]);
  const [newDoc, setNewDoc] = useState('');
  const [channels, setChannels] = useState<string[]>([]);
  const [days, setDays] = useState('14');
  const [instructions, setInstructions] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !base) return;
    setFee(base.applicationFeeKobo ? koboToInput(base.applicationFeeKobo) : '');
    setDocs(base.documentChecklist);
    setNewDoc('');
    setChannels(base.notifyChannels);
    setDays(String(base.offerValidDays));
    setInstructions(base.examInstructions ?? '');
    setErrors({});
  }, [open, base]);

  const addDoc = () => {
    const d = newDoc.trim();
    if (d.length < 2 || docs.some((x) => x.toLowerCase() === d.toLowerCase())) return;
    setDocs((x) => [...x, d].slice(0, 15));
    setNewDoc('');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const naira = fee.trim() ? parseNaira(fee) : 0;
    const parsed = admissionsSettingsSchema.safeParse({
      applicationFeeKobo: naira ? Math.round(naira * 100) : null,
      documentChecklist: docs,
      notifyChannels: channels,
      offerValidDays: Number(days),
      examInstructions: instructions,
    });
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      if (errs.offerValidDays) errs.offerValidDays = 'Between 1 and 90 days';
      setErrors(errs);
      return;
    }
    setErrors({});
    save.mutate(parsed.data, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">Admissions settings</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">Application fee, the documents you ask for, and how parents hear about each step.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          {!base ? (
            <div className="space-y-3" aria-busy>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <form id="adm-settings" onSubmit={submit} noValidate className="grid gap-6">
              <Field label="Application fee" htmlFor="as-fee" optional error={errors.applicationFeeKobo} hint="Leave blank if applying is free. Staff record the payment (with the receipt reference) on each application.">
                <MoneyInput id="as-fee" value={fee} onChange={setFee} currency={meta.data?.currency ?? 'NGN'} placeholder="0" />
              </Field>

              <fieldset className="grid gap-2">
                <legend className="mb-1 text-[13px] font-medium">Documents to collect</legend>
                <ul className="flex flex-wrap gap-1.5">
                  {docs.map((d) => (
                    <li key={d} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-[12.5px]">
                      {d}
                      <button type="button" onClick={() => setDocs((x) => x.filter((y) => y !== d))} className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remove ${d}`}>
                        <X className="size-3" />
                      </button>
                    </li>
                  ))}
                  {docs.length === 0 && <li className="text-[12.5px] italic text-muted-foreground">No documents required</li>}
                </ul>
                <div className="flex gap-2">
                  <Input
                    value={newDoc}
                    onChange={(e) => setNewDoc(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addDoc();
                      }
                    }}
                    placeholder="e.g. Immunisation card"
                    maxLength={80}
                    aria-label="Add a document"
                  />
                  <Button type="button" variant="outline" onClick={addDoc} disabled={newDoc.trim().length < 2}>
                    <Plus /> Add
                  </Button>
                </div>
              </fieldset>

              <fieldset className="grid gap-2">
                <legend className="mb-1 text-[13px] font-medium">Tell parents automatically by</legend>
                <div className="flex flex-wrap gap-4">
                  {ADMISSION_NOTIFY_CHANNELS.map((c) => (
                    <label key={c} htmlFor={`as-ch-${c}`} className="flex cursor-pointer items-center gap-2 text-[13px]">
                      <Checkbox id={`as-ch-${c}`} checked={channels.includes(c)} onCheckedChange={(on) => setChannels((x) => (on === true ? [...new Set([...x, c])] : x.filter((y) => y !== c)))} />
                      {CHANNEL_LABEL[c]}
                    </label>
                  ))}
                </div>
                <p className="text-[12px] text-muted-foreground">Sent when an exam or interview is booked, a place is offered, an applicant is waitlisted or not offered, and on enrolment. Uses your Messages set-up; each message can be skipped when you take the action.</p>
              </fieldset>

              <Field label="Days to accept an offer" htmlFor="as-days" error={errors.offerValidDays} hint="The default deadline on new offers">
                <Input id="as-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 2))} className="w-28 tabular" invalid={!!errors.offerValidDays} />
              </Field>

              <Field label="Entrance exam instructions" htmlFor="as-instr" optional error={errors.examInstructions} hint="Added to every exam invitation">
                <Textarea id="as-instr" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={300} />
              </Field>
              <FormError message={errors.form} />
            </form>
          )}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="adm-settings" loading={save.isPending} disabled={!base}>
            Save settings
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
