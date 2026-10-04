import { HOUSE_COLOUR_PRESETS, type HouseRow } from '@aischool/shared';
import { Check, Shield } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useSaveHouse } from './api';
import { HouseCrest, inkOn } from './ui';

/** Create or edit a house: name, colour, motto and house master/mistress. */
export function HouseDialog({ open, onOpenChange, house, staff }: { open: boolean; onOpenChange: (o: boolean) => void; house: HouseRow | null; staff: { id: string; name: string }[] }) {
  const save = useSaveHouse(house?.id);
  const [name, setName] = useState('');
  const [colour, setColour] = useState('#dc2626');
  const [motto, setMotto] = useState('');
  const [master, setMaster] = useState<string>(NONE);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(house?.name ?? '');
    setColour(house?.colour ?? '#dc2626');
    setMotto(house?.motto ?? '');
    setMaster(house?.master?.id ?? NONE);
    setErrors({});
  }, [open, house]);

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = 'Give the house a name';
    if (!/^#[0-9a-f]{6}$/i.test(colour)) errs.colour = 'Choose a colour';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate(
      { name: name.trim(), colour, motto: motto.trim() || null, masterStaffId: master === NONE ? null : master },
      {
        onSuccess: (h) => {
          toast.success(house ? `${h.name} updated` : `${h.name} created`);
          onOpenChange(false);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) setErrors({ name: err.message });
          else toast.error(errorMessage(err));
        },
      },
    );
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={house ? `Edit ${house.name}` : 'New house'} icon={<Shield />} submitLabel={house ? 'Save changes' : 'Create house'} pending={save.isPending} onSubmit={submit}>
      <div className="grid gap-5">
        <div className="flex items-center gap-4 rounded-2xl border border-border p-4" style={{ background: `linear-gradient(135deg, ${colour}22, transparent 70%)` }}>
          <HouseCrest colour={colour} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-display text-[17px] font-semibold">{name.trim() || 'House name'}</p>
            <p className="truncate text-[12.5px] italic text-muted-foreground">{motto.trim() || 'Motto'}</p>
          </div>
        </div>
        <Field label="Name" htmlFor="house-name" error={errors.name} hint="e.g. Aggrey House, Red House">
          <Input id="house-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} autoFocus />
        </Field>
        <Field label="Colour" error={errors.colour}>
          <div className="flex flex-wrap items-center gap-2">
            {HOUSE_COLOUR_PRESETS.map((p) => {
              const on = p.hex.toLowerCase() === colour.toLowerCase();
              return (
                <button
                  key={p.hex}
                  type="button"
                  title={p.name}
                  aria-label={p.name}
                  aria-pressed={on}
                  onClick={() => setColour(p.hex)}
                  className={cn('grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on && 'ring-2 ring-foreground')}
                  style={{ backgroundColor: p.hex, color: inkOn(p.hex) }}
                >
                  {on && <Check className="size-4" aria-hidden />}
                </button>
              );
            })}
            <Input type="color" aria-label="Custom colour" value={colour} onChange={(e) => setColour(e.target.value)} />
          </div>
        </Field>
        <Field label="Motto" htmlFor="house-motto" optional>
          <Input id="house-motto" value={motto} maxLength={160} onChange={(e) => setMotto(e.target.value)} placeholder="e.g. Strength and honour" />
        </Field>
        <Field label="House master or mistress" optional>
          <Select value={master} onValueChange={setMaster}>
            <SelectTrigger aria-label="House master">
              <SelectValue placeholder="Choose a member of staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No one yet</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </FormDialog>
  );
}
