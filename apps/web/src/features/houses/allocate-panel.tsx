import type { HouseAllocateResult, HouseRow } from '@aischool/shared';
import { Check, Shuffle, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { SwitchRow } from '@/components/ui/form-dialog';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useClassOptions } from '../attendance/classes';
import { type PickedStudent, StudentPicker } from '../students/student-picker';
import { useAllocate } from './api';
import { HouseBadge, inkOn, SectionTitle, tint } from './ui';

function ClassChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { options, loading } = useClassOptions();
  if (loading) return <p className="text-[13px] text-muted-foreground">Loading classes…</p>;
  const all = value.length === 0;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const chip = 'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" aria-pressed={all} onClick={() => onChange([])} className={cn(chip, all ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-card hover:bg-muted')}>
        {all && <Check className="size-3.5" />} Every class
      </button>
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button key={o.id} type="button" aria-pressed={on} onClick={() => toggle(o.id)} className={cn(chip, on ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-card hover:bg-muted')}>
            {on && <Check className="size-3.5" />} {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ResultCard({ r }: { r: HouseAllocateResult }) {
  return (
    <div className="mt-4 rounded-xl border border-success/30 bg-success-soft/40 p-4">
      <p className="text-[13.5px] font-medium">
        {formatNumber(r.assigned)} student{r.assigned === 1 ? '' : 's'} placed{r.unchanged ? `, ${formatNumber(r.unchanged)} left where they were` : ''}.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {r.byHouse.map((b) => (
          <li key={b.house.id} className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 text-[13px]">
            <HouseBadge house={b.house} />
            <span className="tabular text-muted-foreground">
              +{b.added} → <span className="font-semibold text-foreground">{b.members}</span> members
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Balanced allocation across houses, and putting chosen students or classes in one house. */
export function AllocatePanel({ houses, unassigned }: { houses: HouseRow[]; unassigned: number }) {
  const allocate = useAllocate();
  // Balanced
  const [classIds, setClassIds] = useState<string[]>([]);
  const [houseIds, setHouseIds] = useState<string[]>([]);
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [balanced, setBalanced] = useState<HouseAllocateResult | null>(null);
  // Manual
  const [target, setTarget] = useState<string>(houses[0]?.id ?? NONE);
  const [students, setStudents] = useState<PickedStudent[]>([]);
  const [manualClasses, setManualClasses] = useState<string[]>([]);
  const [byClass, setByClass] = useState(false);
  const [manual, setManual] = useState<HouseAllocateResult | null>(null);

  const chosenHouses = houseIds.length ? houses.filter((h) => houseIds.includes(h.id)) : houses;
  const runBalanced = () =>
    allocate.mutate(
      { mode: 'BALANCED', classArmIds: classIds, houseIds, onlyUnassigned },
      {
        onSuccess: (r) => {
          setBalanced(r);
          setConfirm(false);
          toast.success(`${r.assigned} student${r.assigned === 1 ? '' : 's'} allocated`);
        },
        onError: (err) => (setConfirm(false), toast.error(errorMessage(err))),
      },
    );
  const runManual = () => {
    if (byClass ? !manualClasses.length : !students.length) {
      toast.error(byClass ? 'Choose at least one class' : 'Choose at least one student');
      return;
    }
    allocate.mutate(
      { mode: 'SET', houseId: target === NONE ? null : target, studentIds: byClass ? [] : students.map((s) => s.id), classArmIds: byClass ? manualClasses : [] },
      {
        onSuccess: (r) => {
          setManual(r);
          setStudents([]);
          toast.success(target === NONE ? `${r.assigned} student${r.assigned === 1 ? '' : 's'} taken out of their houses` : `${r.assigned} student${r.assigned === 1 ? '' : 's'} moved`);
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <Card className="p-4 sm:p-6">
        <SectionTitle icon={<Shuffle />}>Share students out evenly</SectionTitle>
        <p className="-mt-1 mb-4 text-[13px] text-muted-foreground">
          Students are dealt across the houses class by class, boys and girls separately, so every house gets a fair mix. {unassigned > 0 && `${formatNumber(unassigned)} active students have no house yet.`}
        </p>
        <div className="grid gap-5">
          <Field label="Classes">
            <ClassChips value={classIds} onChange={setClassIds} />
          </Field>
          <Field label="Houses">
            <div className="flex flex-wrap gap-1.5">
              {houses.map((h) => {
                const on = houseIds.length === 0 || houseIds.includes(h.id);
                return (
                  <button
                    key={h.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const current = houseIds.length ? houseIds : houses.map((x) => x.id);
                      const next = current.includes(h.id) ? current.filter((x) => x !== h.id) : [...current, h.id];
                      setHouseIds(next.length === houses.length ? [] : next);
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-full border-2 px-3 text-[12.5px] font-semibold transition-all"
                    style={on ? { backgroundColor: h.colour, borderColor: h.colour, color: inkOn(h.colour) } : { borderColor: tint(h.colour, 0.4), opacity: 0.6 }}
                  >
                    {on && <Check className="size-3.5" />} {h.name}
                  </button>
                );
              })}
            </div>
          </Field>
          <SwitchRow label="Only students without a house" description="Turn off to reshuffle everyone in the chosen classes">
            <Switch checked={onlyUnassigned} onCheckedChange={setOnlyUnassigned} />
          </SwitchRow>
          <Button onClick={() => setConfirm(true)} disabled={chosenHouses.length < 2} className="justify-self-start">
            <Shuffle /> Allocate across {chosenHouses.length} houses
          </Button>
        </div>
        {balanced && <ResultCard r={balanced} />}
      </Card>

      <Card className="p-4 sm:p-6">
        <SectionTitle icon={<UserPlus />}>Put students in a house</SectionTitle>
        <p className="-mt-1 mb-4 text-[13px] text-muted-foreground">Move chosen students, or whole classes, into one house — or take them out of their house.</p>
        <div className="grid gap-5">
          <Field label="House">
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger aria-label="House">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {houses.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
                  </SelectItem>
                ))}
                <SelectItem value={NONE}>No house (take them out)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <SwitchRow label="Whole classes" description="Instead of picking students one by one">
            <Switch checked={byClass} onCheckedChange={setByClass} />
          </SwitchRow>
          {byClass ? (
            <Field label="Classes">
              <ManualClasses value={manualClasses} onChange={setManualClasses} />
            </Field>
          ) : (
            <Field label="Students">
              <StudentPicker value={students} onChange={setStudents} />
            </Field>
          )}
          <Button onClick={runManual} loading={allocate.isPending && !confirm} className="justify-self-start">
            <Check /> {target === NONE ? 'Take out of house' : `Put in ${houses.find((h) => h.id === target)?.name ?? 'house'}`}
          </Button>
        </div>
        {manual && <ResultCard r={manual} />}
      </Card>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive={!onlyUnassigned}
        title={onlyUnassigned ? 'Allocate students without a house?' : 'Reshuffle these students?'}
        description={
          onlyUnassigned
            ? `Students in ${classIds.length ? `${classIds.length} class(es)` : 'every class'} who have no house will be shared across ${chosenHouses.map((h) => h.name).join(', ')}.`
            : `Everyone in ${classIds.length ? `${classIds.length} class(es)` : 'the whole school'} will be re-allocated, including students already in a house. Points they earned stay with their old house.`
        }
        confirmLabel="Allocate"
        loading={allocate.isPending}
        onConfirm={runBalanced}
      />
    </div>
  );
}

function ManualClasses({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { options, loading } = useClassOptions();
  if (loading) return <p className="text-[13px] text-muted-foreground">Loading classes…</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
            className={cn('inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[12.5px] font-medium transition-colors', on ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-card hover:bg-muted')}
          >
            {on && <Check className="size-3.5" />} {o.label}
          </button>
        );
      })}
    </div>
  );
}
