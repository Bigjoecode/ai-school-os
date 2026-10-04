import {
  BEHAVIOUR_ACTIONS,
  BEHAVIOUR_CATEGORIES,
  BEHAVIOUR_KINDS,
  BEHAVIOUR_SEVERITIES,
  BEHAVIOUR_SEVERITY_LABELS,
  behaviourSchema,
  type BehaviourKind,
  type BehaviourRow,
  type BehaviourSeverity,
} from '@aischool/shared';
import { Minus, Plus, ThumbsDown, ThumbsUp, TriangleAlert } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { schoolToday } from '../finance/ui';
import { useRecordBehaviour, useUpdateBehaviour } from './api';
import { NotifyParents, type NotifyChannel, type PickedStudent, StudentSearch } from './ui';

const KIND_META: Record<BehaviourKind, { label: string; icon: typeof ThumbsUp; on: string }> = {
  MERIT: { label: 'Merit', icon: ThumbsUp, on: 'border-success bg-success-soft text-success' },
  DEMERIT: { label: 'Demerit', icon: ThumbsDown, on: 'border-warning bg-warning-soft text-warning' },
  INCIDENT: { label: 'Incident', icon: TriangleAlert, on: 'border-danger bg-danger-soft text-danger' },
};

export interface BehaviourPrefill {
  students?: PickedStudent[];
  kind?: BehaviourKind;
}

/** Quick add (one or many students) and edit of a behaviour record. */
export function BehaviourDialog({
  open,
  onOpenChange,
  record,
  prefill,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  record?: BehaviourRow | null;
  prefill?: BehaviourPrefill | null;
}) {
  const create = useRecordBehaviour();
  const update = useUpdateBehaviour();
  const editing = !!record;
  const [students, setStudents] = useState<PickedStudent[]>([]);
  const [kind, setKind] = useState<BehaviourKind>('MERIT');
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState(1);
  const [severity, setSeverity] = useState<BehaviourSeverity>('LOW');
  const [date, setDate] = useState(schoolToday());
  const [description, setDescription] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [visible, setVisible] = useState(true);
  const [resolved, setResolved] = useState(false);
  const [notify, setNotify] = useState(false);
  const [channels, setChannels] = useState<NotifyChannel[]>(['IN_APP', 'PUSH']);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setNotify(false);
    setChannels(['IN_APP', 'PUSH']);
    if (record) {
      setStudents([{ id: record.student.id, name: record.student.name, admissionNumber: record.student.admissionNumber, className: record.student.className }]);
      setKind(record.kind);
      setCategory(record.category);
      setTitle(record.title);
      setPoints(Math.abs(record.points));
      setSeverity(record.severity);
      setDate(record.date);
      setDescription(record.description ?? '');
      setActionTaken(record.actionTaken ?? '');
      setVisible(record.visibleToParents);
      setResolved(record.status === 'RESOLVED');
    } else {
      setStudents(prefill?.students ?? []);
      setKind(prefill?.kind ?? 'MERIT');
      setCategory('');
      setTitle('');
      setPoints(1);
      setSeverity('LOW');
      setDate(schoolToday());
      setDescription('');
      setActionTaken('');
      setVisible(true);
      setResolved(false);
    }
  }, [open, record, prefill]);

  const cats = BEHAVIOUR_CATEGORIES.filter((c) => c.kinds.includes(kind));
  const autoTitle = (key: string) => BEHAVIOUR_CATEGORIES.find((c) => c.key === key)?.label ?? '';

  const pickCategory = (key: string) => {
    const def = BEHAVIOUR_CATEGORIES.find((c) => c.key === key);
    if (!title.trim() || title === autoTitle(category)) setTitle(def && key !== 'OTHER' ? def.label : '');
    if (def) {
      setPoints(def.points);
      if (kind !== 'MERIT') setSeverity(def.severity);
    }
    setCategory(key);
  };

  const changeKind = (k: BehaviourKind) => {
    setKind(k);
    if (category && !BEHAVIOUR_CATEGORIES.find((c) => c.key === category)?.kinds.includes(k)) {
      if (title === autoTitle(category)) setTitle('');
      setCategory('');
    }
    if (k === 'MERIT') setResolved(false);
  };

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const next: Record<string, string> = {};
    if (!students.length) next.studentIds = 'Choose at least one student';
    if (!category) next.category = 'Choose a category';
    const body = {
      studentIds: students.map((s) => s.id),
      date,
      kind,
      category: category || 'OTHER',
      title,
      description: description || null,
      points,
      severity,
      actionTaken: kind === 'MERIT' ? null : actionTaken || null,
      status: kind === 'MERIT' ? undefined : resolved ? ('RESOLVED' as const) : ('OPEN' as const),
      visibleToParents: visible,
      notifyParents: notify,
      channels,
    };
    const parsed = behaviourSchema.safeParse(body);
    if (!parsed.success) for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.message;
    setErrors(next);
    if (Object.keys(next).length) return;
    const onError = (err: Error) => {
      if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
      else toast.error(err.message);
    };
    if (record) {
      const { studentIds: _s, notifyParents: _n, channels: _c, ...rest } = body;
      update.mutate({ id: record.id, ...rest }, { onSuccess: () => onOpenChange(false), onError });
    } else {
      create.mutate(body, { onSuccess: () => onOpenChange(false), onError });
    }
  };

  const sign = kind === 'MERIT' ? '+' : '−';
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit behaviour record' : 'Record behaviour'}
      description={editing ? `${record!.student.name} · ${record!.student.className ?? 'No class'}` : 'Recognise good conduct or log a concern. Merits add points; demerits and incidents take them away.'}
      submitLabel={editing ? 'Save changes' : kind === 'MERIT' ? 'Give merit' : kind === 'DEMERIT' ? 'Record demerit' : 'Log incident'}
      pending={create.isPending || update.isPending}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid gap-4">
        {!editing && (
          <Field label="Students" htmlFor="bh-students" error={errors.studentIds} hint="You can choose several students for the same merit or incident.">
            <StudentSearch id="bh-students" value={students} onChange={setStudents} multiple invalid={!!errors.studentIds} />
          </Field>
        )}

        <div role="radiogroup" aria-label="Kind" className="grid grid-cols-3 gap-2">
          {BEHAVIOUR_KINDS.map((k) => {
            const m = KIND_META[k];
            const on = kind === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => changeKind(k)}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-2 rounded-xl border px-2 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on ? m.on : 'border-border bg-card text-muted-foreground hover:bg-muted/50',
                )}
              >
                <m.icon className="size-4" aria-hidden /> {m.label}
              </button>
            );
          })}
        </div>

        <Field label="Category" error={errors.category}>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
            {cats.map((c) => {
              const on = category === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pickCategory(c.key)}
                  className={cn(
                    'min-h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-card text-foreground hover:bg-muted/60',
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto] [&>*]:min-w-0">
          <Field label="What happened" htmlFor="bh-title" error={errors.title}>
            <Input
              id="bh-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
              placeholder={kind === 'MERIT' ? 'e.g. Top score in the maths test' : 'e.g. Late to assembly three times this week'}
              invalid={!!errors.title}
            />
          </Field>
          <Field label="Points" htmlFor="bh-points" error={errors.points}>
            <div className="flex items-center gap-1.5">
              <button type="button" aria-label="Fewer points" onClick={() => setPoints((p) => Math.max(0, p - 1))} className="grid size-10 place-items-center rounded-lg border border-border hover:bg-muted">
                <Minus className="size-4" />
              </button>
              <div className="flex h-10 w-16 items-center justify-center rounded-lg border border-input bg-card font-display text-[15px] font-semibold tabular">
                <span className={kind === 'MERIT' ? 'text-success' : 'text-danger'}>{points ? `${sign}${points}` : '0'}</span>
                <input id="bh-points" type="number" className="sr-only" value={points} min={0} max={50} onChange={(e) => setPoints(Math.max(0, Math.min(50, Number(e.target.value) || 0)))} />
              </div>
              <button type="button" aria-label="More points" onClick={() => setPoints((p) => Math.min(50, p + 1))} className="grid size-10 place-items-center rounded-lg border border-border hover:bg-muted">
                <Plus className="size-4" />
              </button>
            </div>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Date" htmlFor="bh-date" error={errors.date}>
            <Input id="bh-date" type="date" value={date} max={schoolToday()} onChange={(e) => setDate(e.target.value)} className="tabular [color-scheme:light] dark:[color-scheme:dark]" />
          </Field>
          {kind !== 'MERIT' && (
            <Field label="Severity">
              <div role="radiogroup" aria-label="Severity" className="grid h-10 grid-cols-3 gap-1 rounded-lg border border-border bg-muted/60 p-1">
                {BEHAVIOUR_SEVERITIES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={severity === s}
                    onClick={() => setSeverity(s)}
                    className={cn('rounded-md text-[12.5px] font-medium', severity === s ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {BEHAVIOUR_SEVERITY_LABELS[s]}
                  </button>
                ))}
              </div>
            </Field>
          )}
        </div>

        <Field
          label="Details"
          htmlFor="bh-desc"
          optional
          hint={visible ? 'Parents can read this in the family portal while “Visible to parents” is on. Avoid naming other students.' : 'Staff only.'}
        >
          <Textarea id="bh-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>

        {kind !== 'MERIT' && (
          <Field label="Action taken" htmlFor="bh-action" optional>
            <Input id="bh-action" value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} maxLength={300} placeholder="e.g. Detention on Friday" />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {BEHAVIOUR_ACTIONS.filter((a) => a !== 'Commendation' && a !== 'Certificate of merit').map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setActionTaken(a)}
                  className={cn('rounded-full border px-2.5 py-0.5 text-[11.5px]', actionTaken === a ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted-foreground hover:bg-muted/60')}
                >
                  {a}
                </button>
              ))}
            </div>
          </Field>
        )}

        <SwitchRow label="Visible to parents" description="Shown in the family portal (students see their own records too).">
          <Switch checked={visible} onCheckedChange={setVisible} />
        </SwitchRow>
        {kind !== 'MERIT' && (
          <SwitchRow label="Resolved" description="Leave open while it still needs follow-up.">
            <Switch checked={resolved} onCheckedChange={setResolved} />
          </SwitchRow>
        )}
        {!editing && (
          <NotifyParents
            on={notify}
            onToggle={setNotify}
            channels={channels}
            onChannels={setChannels}
            label={kind === 'MERIT' ? 'Share the good news with parents' : 'Notify parents'}
            emphasise={kind === 'INCIDENT' && severity === 'HIGH'}
          />
        )}
      </div>
    </FormDialog>
  );
}
