import {
  SICK_BAY_COMPLAINTS,
  SICK_BAY_OUTCOME_LABELS,
  SICK_BAY_OUTCOMES,
  SICK_BAY_SERIOUS,
  sickBayVisitSchema,
  type SickBayOutcome,
  type SickBayRow,
} from '@aischool/shared';
import { AlertOctagon, Stethoscope, Thermometer } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useMedical, useRecordVisit, useUpdateVisit } from './api';
import { fromSchoolInput, MedicalAlertBanner, NotifyParents, type NotifyChannel, type PickedStudent, StudentSearch, toSchoolInput } from './ui';


export function VisitDialog({ open, onOpenChange, visit, student: preset }: { open: boolean; onOpenChange: (o: boolean) => void; visit?: SickBayRow | null; student?: PickedStudent | null }) {
  const create = useRecordVisit();
  const update = useUpdateVisit();
  const editing = !!visit;
  const [students, setStudents] = useState<PickedStudent[]>([]);
  const [visitedAt, setVisitedAt] = useState(toSchoolInput(new Date()));
  const [complaint, setComplaint] = useState('');
  const [temperature, setTemperature] = useState('');
  const [assessment, setAssessment] = useState('');
  const [treatment, setTreatment] = useState('');
  const [medication, setMedication] = useState('');
  const [outcome, setOutcome] = useState<SickBayOutcome>('RETURNED_TO_CLASS');
  const [followUp, setFollowUp] = useState('');
  const [notify, setNotify] = useState(false);
  const [channels, setChannels] = useState<NotifyChannel[]>(['IN_APP', 'PUSH']);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const studentId = students[0]?.id ?? null;
  const medical = useMedical(open ? studentId : null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setNotify(false);
    setChannels(['IN_APP', 'PUSH']);
    if (visit) {
      setStudents([{ id: visit.student.id, name: visit.student.name, admissionNumber: visit.student.admissionNumber, className: visit.student.className }]);
      setVisitedAt(toSchoolInput(new Date(visit.visitedAt)));
      setComplaint(visit.complaint);
      setTemperature(visit.temperature?.toString() ?? '');
      setAssessment(visit.assessment ?? '');
      setTreatment(visit.treatment ?? '');
      setMedication(visit.medication ?? '');
      setOutcome(visit.outcome);
      setFollowUp(visit.followUp ?? '');
    } else {
      setStudents(preset ? [preset] : []);
      setVisitedAt(toSchoolInput(new Date()));
      setComplaint('');
      setTemperature('');
      setAssessment('');
      setTreatment('');
      setMedication('');
      setOutcome('RETURNED_TO_CLASS');
      setFollowUp('');
    }
  }, [open, visit, preset]);

  const chooseOutcome = (o: SickBayOutcome) => {
    setOutcome(o);
    // Parents must hear when a child goes home, is referred or goes to hospital.
    if (!editing && SICK_BAY_SERIOUS.includes(o)) setNotify(true);
  };

  const temp = temperature.trim() ? Number(temperature) : null;
  const fever = temp != null && temp >= 37.5;
  const allergies = medical.data?.allergies ?? [];
  const clash = medication.trim() ? allergies.filter((a) => medication.toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(medication.trim().toLowerCase())) : [];

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const body = {
      studentId: studentId ?? '',
      visitedAt: visitedAt ? fromSchoolInput(visitedAt) : undefined,
      complaint,
      temperature: temp,
      assessment: assessment || null,
      treatment: treatment || null,
      medication: medication || null,
      outcome,
      followUp: followUp || null,
      notifyParents: notify,
      channels,
    };
    const parsed = sickBayVisitSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    const onError = (err: Error) => {
      if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
      else toast.error(err.message);
    };
    if (visit) {
      const { studentId: _s, notifyParents: _n, channels: _c, ...rest } = body;
      update.mutate({ id: visit.id, ...rest }, { onSuccess: () => onOpenChange(false), onError });
    } else {
      create.mutate(body, { onSuccess: () => onOpenChange(false), onError });
    }
  };

  const serious = SICK_BAY_SERIOUS.includes(outcome);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Update sick-bay visit' : 'Record a sick-bay visit'}
      description={editing ? `${visit!.student.name} · ${visit!.student.className ?? 'No class'}` : 'Check the medical alert before giving any medication.'}
      icon={<Stethoscope />}
      submitLabel={editing ? 'Save changes' : 'Record visit'}
      pending={create.isPending || update.isPending}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid gap-4">
        {!editing && (
          <Field label="Student" htmlFor="sb-student" error={errors.studentId}>
            <StudentSearch id="sb-student" value={students} onChange={setStudents} invalid={!!errors.studentId} />
          </Field>
        )}
        {studentId && (medical.isLoading ? <Skeleton className="h-14 rounded-xl" /> : medical.data ? <MedicalAlertBanner profile={medical.data} /> : null)}

        <div className="grid gap-4 sm:grid-cols-[1fr_9rem] [&>*]:min-w-0">
          <Field label="Time" htmlFor="sb-time">
            <Input id="sb-time" type="datetime-local" value={visitedAt} onChange={(e) => setVisitedAt(e.target.value)} className="tabular [color-scheme:light] dark:[color-scheme:dark]" />
          </Field>
          <Field label="Temperature" htmlFor="sb-temp" optional error={errors.temperature} hint={fever ? <span className="font-medium text-danger">Fever</span> : '°C'}>
            <div className="relative">
              <Thermometer className={cn('pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2', fever ? 'text-danger' : 'text-muted-foreground')} />
              <Input id="sb-temp" inputMode="decimal" value={temperature} onChange={(e) => setTemperature(e.target.value.replace(/[^\d.]/g, ''))} placeholder="36.8" className="pl-8 tabular" invalid={!!errors.temperature} />
            </div>
          </Field>
        </div>

        <Field label="Complaint" htmlFor="sb-complaint" error={errors.complaint}>
          <Input id="sb-complaint" value={complaint} onChange={(e) => setComplaint(e.target.value)} maxLength={300} placeholder="What brought them in?" invalid={!!errors.complaint} />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SICK_BAY_COMPLAINTS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setComplaint(c)}
                className={cn('rounded-full border px-2.5 py-0.5 text-[11.5px]', complaint === c ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted-foreground hover:bg-muted/60')}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Assessment" htmlFor="sb-assess" optional>
          <Textarea id="sb-assess" rows={2} value={assessment} onChange={(e) => setAssessment(e.target.value)} maxLength={1000} placeholder="What you observed" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Treatment / care given" htmlFor="sb-treat" optional>
            <Textarea id="sb-treat" rows={2} value={treatment} onChange={(e) => setTreatment(e.target.value)} maxLength={1000} placeholder="e.g. Rested, tepid sponging" />
          </Field>
          <Field label="Medication" htmlFor="sb-med" optional hint="Name, dose and time.">
            <Textarea id="sb-med" rows={2} value={medication} onChange={(e) => setMedication(e.target.value)} maxLength={500} placeholder="e.g. Paracetamol 500mg at 10:15" invalid={clash.length > 0} />
          </Field>
        </div>
        {clash.length > 0 && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-soft/60 px-3.5 py-2.5 text-[13px] text-danger">
            <AlertOctagon className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>Possible allergy:</strong> this student is recorded as allergic to {clash.join(', ')}. Do not give this medication without checking.
            </span>
          </div>
        )}

        <Field label="Outcome">
          <div role="radiogroup" aria-label="Outcome" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SICK_BAY_OUTCOMES.map((o) => {
              const on = outcome === o;
              const bad = SICK_BAY_SERIOUS.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => chooseOutcome(o)}
                  className={cn(
                    'min-h-10 rounded-xl border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on ? (bad ? 'border-warning bg-warning-soft text-warning' : 'border-brand bg-brand-soft text-brand') : 'border-border bg-card text-foreground hover:bg-muted/50',
                  )}
                >
                  {SICK_BAY_OUTCOME_LABELS[o]}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Follow-up" htmlFor="sb-follow" optional>
          <Input id="sb-follow" value={followUp} onChange={(e) => setFollowUp(e.target.value)} maxLength={500} placeholder="e.g. Check temperature again after lunch" />
        </Field>
        {!editing && (
          <NotifyParents
            on={notify}
            onToggle={setNotify}
            channels={channels}
            onChannels={setChannels}
            emphasise={serious}
            description={serious ? 'Recommended: parents should know straight away.' : 'Optional for minor visits.'}
          />
        )}
      </div>
    </FormDialog>
  );
}
