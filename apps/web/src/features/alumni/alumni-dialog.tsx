import { alumniSchema, type AlumniRow } from '@aischool/shared';
import { GraduationCap } from 'lucide-react';
import { type BaseSyntheticEvent, type ChangeEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, errorMessage } from '@/lib/api';
import { useSaveAlumnus } from './api';

const blank = {
  firstName: '',
  lastName: '',
  graduationYear: '',
  finalClass: '',
  email: '',
  phone: '',
  currentInstitution: '',
  course: '',
  occupation: '',
  employer: '',
  city: '',
  country: '',
  notes: '',
  consentToContact: true,
};
type Form = typeof blank;

function fromRow(r: AlumniRow): Form {
  const s = (v: string | number | null) => (v === null ? '' : String(v));
  return {
    firstName: r.firstName,
    lastName: r.lastName,
    graduationYear: s(r.graduationYear),
    finalClass: s(r.finalClass),
    email: s(r.email),
    phone: s(r.phone),
    currentInstitution: s(r.currentInstitution),
    course: s(r.course),
    occupation: s(r.occupation),
    employer: s(r.employer),
    city: s(r.city),
    country: s(r.country),
    notes: s(r.notes),
    consentToContact: r.consentToContact,
  };
}

/** Add an old student by hand, or edit any alumni record. */
export function AlumniDialog({ open, onOpenChange, row }: { open: boolean; onOpenChange: (o: boolean) => void; row: AlumniRow | null }) {
  const save = useSaveAlumnus(row?.id);
  const [v, setV] = useState<Form>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setV(row ? fromRow(row) : blank);
      setErrors({});
    }
  }, [open, row]);

  const set = (k: keyof Form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = alumniSchema.safeParse({ ...v, graduationYear: v.graduationYear.trim() || null });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: (r) => {
        toast.success(row ? `${r.name} updated` : `${r.name} added to the alumni directory`);
        onOpenChange(false);
      },
      onError: (err) => {
        if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
        else toast.error(errorMessage(err));
      },
    });
  };
  const field = (k: keyof Form, label: string, opts: { optional?: boolean; type?: string; placeholder?: string } = {}) => (
    <Field label={label} htmlFor={`alum-${k}`} optional={opts.optional} error={errors[k]}>
      <Input id={`alum-${k}`} type={opts.type} value={v[k] as string} placeholder={opts.placeholder} onChange={set(k)} invalid={!!errors[k]} />
    </Field>
  );

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} size="lg" title={row ? `Edit ${row.name}` : 'Add an old student'} icon={<GraduationCap />} submitLabel={row ? 'Save changes' : 'Add to directory'} pending={save.isPending} onSubmit={submit}>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {field('firstName', 'First name')}
          {field('lastName', 'Surname')}
          {field('graduationYear', 'Graduation year', { optional: true, placeholder: '2018' })}
          {field('finalClass', 'Final class', { optional: true, placeholder: 'SS 3 A' })}
          {field('email', 'Email', { optional: true, type: 'email' })}
          {field('phone', 'Phone', { optional: true, type: 'tel' })}
        </div>
        <p className="pt-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Where they are now</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('currentInstitution', 'University or school', { optional: true })}
          {field('course', 'Course', { optional: true })}
          {field('occupation', 'Occupation', { optional: true })}
          {field('employer', 'Employer', { optional: true })}
          {field('city', 'City', { optional: true })}
          {field('country', 'Country', { optional: true })}
        </div>
        <Field label="Notes" htmlFor="alum-notes" optional>
          <Textarea id="alum-notes" rows={3} value={v.notes} onChange={set('notes')} />
        </Field>
        <SwitchRow label="Happy to be contacted" description="Events, mentoring and fundraising messages">
          <Switch checked={v.consentToContact} onCheckedChange={(c) => setV((x) => ({ ...x, consentToContact: c }))} />
        </SwitchRow>
      </div>
    </FormDialog>
  );
}
