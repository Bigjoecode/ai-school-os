import { BLOOD_GROUPS, GENOTYPES, medicalProfileSchema, type MedicalProfile } from '@aischool/shared';
import { ArrowRight, HeartPulse, Pencil, Plus, Stethoscope, X } from 'lucide-react';
import { type BaseSyntheticEvent, type KeyboardEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { schoolDateTime } from '../finance/ui';
import { useSaveMedical, useStudentWelfare } from './api';
import { KindBadge, MedicalAlertBanner, OutcomeBadge, Points } from './ui';

/** Edit blood group, genotype, allergies, conditions and notes. */
export function MedicalDialog({ open, onOpenChange, profile }: { open: boolean; onOpenChange: (o: boolean) => void; profile: MedicalProfile }) {
  const save = useSaveMedical(profile.studentId);
  const [bloodGroup, setBloodGroup] = useState<string | null>(null);
  const [genotype, setGenotype] = useState<string | null>(null);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [conditions, setConditions] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setBloodGroup(profile.bloodGroup);
    setGenotype(profile.genotype);
    setAllergies(profile.allergies);
    setDraft('');
    setConditions(profile.chronicConditions ?? '');
    setNotes(profile.medicalNotes ?? '');
    setErrors({});
  }, [open, profile]);

  const addAllergy = () => {
    const parts = draft.split(',').map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    setAllergies((a) => [...a, ...parts.filter((p) => !a.some((x) => x.toLowerCase() === p.toLowerCase()))]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addAllergy();
    }
  };

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const pending = draft.split(',').map((x) => x.trim()).filter(Boolean);
    const body = { bloodGroup, genotype, allergies: [...allergies, ...pending], chronicConditions: conditions || null, medicalNotes: notes || null };
    const parsed = medicalProfileSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    save.mutate(body as Parameters<typeof save.mutate>[0], {
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
      title="Medical profile"
      description={`${profile.student.name} · Parents can see this in the family portal.`}
      icon={<HeartPulse />}
      submitLabel="Save profile"
      pending={save.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4 [&>*]:min-w-0">
          <Field label="Blood group" htmlFor="md-blood">
            <Select value={bloodGroup ?? NONE} onValueChange={(v) => setBloodGroup(v === NONE ? null : v)}>
              <SelectTrigger id="md-blood">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not known</SelectItem>
                {BLOOD_GROUPS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b.replace('-', '−')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Genotype" htmlFor="md-geno">
            <Select value={genotype ?? NONE} onValueChange={(v) => setGenotype(v === NONE ? null : v)}>
              <SelectTrigger id="md-geno">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not known</SelectItem>
                {GENOTYPES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Allergies" htmlFor="md-allergy" error={errors.allergies} hint="Press Enter after each one — medicines, foods (e.g. groundnuts), insect stings…">
          <div className="flex gap-2">
            <Input id="md-allergy" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} maxLength={80} placeholder="e.g. Penicillin" />
            <Button type="button" variant="outline" size="icon" onClick={addAllergy} aria-label="Add allergy">
              <Plus />
            </Button>
          </div>
          {allergies.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {allergies.map((a) => (
                <span key={a} className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger-soft py-0.5 pl-2.5 pr-1 text-[12px] text-danger">
                  {a}
                  <button type="button" onClick={() => setAllergies((x) => x.filter((y) => y !== a))} className="rounded-full p-0.5 hover:bg-danger/10" aria-label={`Remove ${a}`}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>
        <Field label="Long-term conditions" htmlFor="md-cond" optional hint="e.g. Asthma (uses inhaler), epilepsy, diabetes.">
          <Textarea id="md-cond" rows={2} value={conditions} onChange={(e) => setConditions(e.target.value)} maxLength={1000} />
        </Field>
        <Field label="Other medical notes" htmlFor="md-notes" optional>
          <Textarea id="md-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Doctor’s contact, regular medication, what to do in an emergency…" />
        </Field>
      </div>
    </FormDialog>
  );
}

/** Health and behaviour at a glance, for the student profile sheet. */
export function StudentWelfarePanel({ studentId, onNavigate }: { studentId: string; onNavigate?: () => void }) {
  const q = useStudentWelfare(studentId);
  const canHealth = useCan('health.manage');
  const [editing, setEditing] = useState(false);
  const d = q.data;
  return (
    <section className="mt-6" aria-labelledby="sheet-welfare">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 id="sheet-welfare" className="flex items-center gap-2 text-[13px] font-semibold">
          <HeartPulse className="size-4 text-muted-foreground" /> Health & behaviour
        </h3>
        {canHealth && d && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil /> Medical profile
          </Button>
        )}
      </div>
      {q.isLoading ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : !d ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">Couldn’t load health and behaviour.</p>
      ) : (
        <div className="space-y-3">
          <MedicalAlertBanner profile={d.medical} />
          {d.medical.medicalNotes && <p className="whitespace-pre-line rounded-xl bg-muted/40 px-3.5 py-2.5 text-[12.5px]">{d.medical.medicalNotes}</p>}
          <div className="rounded-xl border border-border p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12.5px] text-muted-foreground">
                Behaviour {d.behaviour.term ? `· ${d.behaviour.term.name}` : 'this term'}: <Points value={d.behaviour.tally.points} className="text-[13px]" /> ({d.behaviour.tally.merits} merits, {d.behaviour.tally.demerits} demerits, {d.behaviour.tally.incidents} incidents)
              </p>
              <Link to={`/behaviour?student=${studentId}`} onClick={onNavigate} className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
                Timeline <ArrowRight className="size-3.5" />
              </Link>
            </div>
            {d.behaviour.recent.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {d.behaviour.recent.slice(0, 3).map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-[12.5px]">
                    <KindBadge kind={r.kind} />
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    <span className="shrink-0 text-muted-foreground">{formatDate(r.date, { day: 'numeric', month: 'short' })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {d.sickBay.length > 0 && (
            <div className="rounded-xl border border-border p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  <Stethoscope className="size-3.5" /> Recent sick-bay visits
                </p>
                <Link to={`/sick-bay?tab=history&student=${studentId}`} onClick={onNavigate} className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
                  History <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <ul className="mt-2 space-y-1.5">
                {d.sickBay.slice(0, 3).map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <span className="min-w-0 flex-1 truncate">{v.complaint}</span>
                    <OutcomeBadge outcome={v.outcome} />
                    <span className="text-muted-foreground">{schoolDateTime(v.visitedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {d && <MedicalDialog open={editing} onOpenChange={setEditing} profile={d.medical} />}
    </section>
  );
}
