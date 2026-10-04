import { HOUSE_POINT_CATEGORIES, HOUSE_POINT_CATEGORY_LABELS, type HousePointCategory, type HouseRef } from '@aischool/shared';
import { Minus, Plus, Sparkles } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { schoolToday } from '../finance/ui';
import { Segmented } from '../operations/ui';
import { type PickedStudent, StudentPicker } from '../students/student-picker';
import { useAwardPoints } from './api';
import { inkOn, signed, tint } from './ui';

const QUICK = [1, 5, 10, 20];

/** Award (or deduct) house points: to a house, or to students — each one's house gets them. */
export function AwardDialog({ open, onOpenChange, houses, presetHouseId }: { open: boolean; onOpenChange: (o: boolean) => void; houses: HouseRef[]; presetHouseId?: string | null }) {
  const award = useAwardPoints();
  const [target, setTarget] = useState<'HOUSE' | 'STUDENTS'>('HOUSE');
  const [houseId, setHouseId] = useState<string | null>(null);
  const [students, setStudents] = useState<PickedStudent[]>([]);
  const [deduct, setDeduct] = useState(false);
  const [amount, setAmount] = useState('5');
  const [category, setCategory] = useState<HousePointCategory>('SPORTS');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(schoolToday());
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setTarget('HOUSE');
    setHouseId(presetHouseId ?? null);
    setStudents([]);
    setDeduct(false);
    setAmount('5');
    setReason('');
    setDate(schoolToday());
    setErrors({});
  }, [open, presetHouseId]);

  const n = Math.abs(Math.trunc(Number(amount) || 0));
  const points = deduct ? -n : n;

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (target === 'HOUSE' && !houseId) errs.house = 'Choose a house';
    if (target === 'STUDENTS' && !students.length) errs.students = 'Choose at least one student';
    if (!n) errs.amount = 'Enter the number of points';
    if (n > 500) errs.amount = 'At most 500 points at a time';
    if (reason.trim().length < 2) errs.reason = 'Say what the points are for';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    award.mutate(
      { houseId: target === 'HOUSE' ? houseId : null, studentIds: target === 'STUDENTS' ? students.map((s) => s.id) : [], points, reason: reason.trim(), category, date },
      {
        onSuccess: (r) => {
          const where = target === 'HOUSE' ? (houses.find((h) => h.id === houseId)?.name ?? 'the house') : `${r.entries.length} student${r.entries.length === 1 ? '' : 's'}’ houses`;
          toast.success(`${signed(points)} point${n === 1 ? '' : 's'} for ${where}`, { description: r.notice ?? undefined });
          onOpenChange(false);
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={deduct ? 'Deduct house points' : 'Award house points'}
      description="Points go on the house leaderboard straight away."
      icon={<Sparkles />}
      submitLabel={`${deduct ? 'Deduct' : 'Award'} ${n || ''} point${n === 1 ? '' : 's'}`}
      pending={award.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-5">
        <Segmented
          label="Give points to"
          value={target}
          onChange={setTarget}
          options={[
            { value: 'HOUSE', label: 'A house' },
            { value: 'STUDENTS', label: 'Students' },
          ]}
        />
        {target === 'HOUSE' ? (
          <Field label="House" error={errors.house}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="House">
              {houses.map((h) => {
                const on = h.id === houseId;
                return (
                  <button
                    key={h.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setHouseId(h.id)}
                    className={cn('min-h-12 rounded-xl border-2 px-3 py-2 text-left text-[13px] font-semibold leading-tight transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on ? 'shadow-soft' : 'opacity-80 hover:opacity-100')}
                    style={on ? { backgroundColor: h.colour, borderColor: h.colour, color: inkOn(h.colour) } : { borderColor: tint(h.colour, 0.45), backgroundColor: tint(h.colour, 0.08) }}
                  >
                    {h.name}
                  </button>
                );
              })}
            </div>
          </Field>
        ) : (
          <Field label="Students" error={errors.students} hint="Each student’s house gets the points, and they are credited as a contributor.">
            <StudentPicker value={students} onChange={setStudents} />
          </Field>
        )}

        <Field label="Points" error={errors.amount}>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Award or deduct"
              size="sm"
              value={deduct ? 'DEDUCT' : 'AWARD'}
              onChange={(v) => setDeduct(v === 'DEDUCT')}
              options={[
                { value: 'AWARD', label: <><Plus /> Award</> },
                { value: 'DEDUCT', label: <><Minus /> Deduct</> },
              ]}
            />
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setAmount(String(q))}
                className={cn(
                  'h-9 min-w-12 rounded-lg border px-3 font-display text-[14px] font-semibold tabular transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  n === q ? (deduct ? 'border-danger bg-danger text-white' : 'border-success bg-success text-white') : 'border-border bg-card hover:bg-muted',
                )}
              >
                {deduct ? '−' : '+'}
                {q}
              </button>
            ))}
            <Input aria-label="Number of points" inputMode="numeric" className="w-20" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <Select value={category} onValueChange={(v) => setCategory(v as HousePointCategory)}>
              <SelectTrigger aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOUSE_POINT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {HOUSE_POINT_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date" htmlFor="hp-date">
            <Input id="hp-date" type="date" value={date} max={schoolToday()} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Reason" htmlFor="hp-reason" error={errors.reason}>
          <Input id="hp-reason" value={reason} maxLength={200} placeholder={deduct ? 'e.g. Untidy dormitory at inspection' : 'e.g. Won the 4×100 m relay'} onChange={(e) => setReason(e.target.value)} invalid={!!errors.reason} />
        </Field>
      </div>
    </FormDialog>
  );
}
