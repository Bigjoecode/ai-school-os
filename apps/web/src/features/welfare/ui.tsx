import {
  BEHAVIOUR_KIND_LABELS,
  SICK_BAY_OUTCOME_LABELS,
  medicalAlerts,
  type BehaviourKind,
  type MedicalProfile,
  type SickBayOutcome,
  type StudentRow,
} from '@aischool/shared';
import { Command } from 'cmdk';
import { AlertTriangle, ChevronsUpDown, Loader2, ThumbsDown, ThumbsUp, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { useCan } from '@/lib/auth-store';
import { classLabel } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { cn, fullName, initials, initialsFromName } from '@/lib/utils';
import { schoolTimeZone } from '../finance/ui';
import { useStudents } from '../students/api';

export const KIND_TONE: Record<BehaviourKind, 'success' | 'warning' | 'danger'> = { MERIT: 'success', DEMERIT: 'warning', INCIDENT: 'danger' };

export function KindBadge({ kind }: { kind: BehaviourKind }) {
  const Icon = kind === 'MERIT' ? ThumbsUp : kind === 'DEMERIT' ? ThumbsDown : TriangleAlert;
  return (
    <Badge variant={KIND_TONE[kind]}>
      <Icon /> {BEHAVIOUR_KIND_LABELS[kind]}
    </Badge>
  );
}

/** "+3" in green, "−2" in red, "0" muted. */
export function Points({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('font-display font-semibold tabular', value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-muted-foreground', className)}>
      {value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0'}
    </span>
  );
}

const OUTCOME_TONE: Record<SickBayOutcome, 'success' | 'info' | 'warning' | 'danger'> = {
  RETURNED_TO_CLASS: 'success',
  OBSERVATION: 'info',
  SENT_HOME: 'warning',
  REFERRED: 'warning',
  HOSPITAL: 'danger',
};

export function OutcomeBadge({ outcome }: { outcome: SickBayOutcome }) {
  return (
    <Badge variant={OUTCOME_TONE[outcome]} dot>
      {SICK_BAY_OUTCOME_LABELS[outcome]}
    </Badge>
  );
}

/** Allergies, sickle cell and long-term conditions, impossible to miss. */
export function MedicalAlertBanner({ profile, className }: { profile: Pick<MedicalProfile, 'allergies' | 'genotype' | 'chronicConditions' | 'bloodGroup'>; className?: string }) {
  const alerts = medicalAlerts(profile);
  const facts = [profile.bloodGroup && `Blood group ${profile.bloodGroup}`, profile.genotype && `Genotype ${profile.genotype}`].filter(Boolean).join(' · ');
  if (!alerts.length) {
    return (
      <div className={cn('rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-[12.5px] text-muted-foreground', className)}>
        No allergies or conditions on record{facts ? ` · ${facts}` : ''}.
      </div>
    );
  }
  const allergic = profile.allergies.length > 0;
  return (
    <div role="alert" className={cn('flex gap-3 rounded-xl border px-3.5 py-3', allergic ? 'border-danger/40 bg-danger-soft/60 text-danger' : 'border-warning/40 bg-warning-soft/60 text-warning', className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-[13px]">
        <p className="font-semibold">{allergic ? 'Medical alert — check before giving any medication' : 'Medical alert'}</p>
        <ul className="mt-1 space-y-0.5 text-foreground">
          {alerts.map((a) => (
            <li key={a} className="break-words">
              {a}
            </li>
          ))}
        </ul>
        {facts && <p className="mt-1 text-[12px] text-muted-foreground">{facts}</p>}
      </div>
    </div>
  );
}

export interface PickedStudent {
  id: string;
  name: string;
  admissionNumber: string;
  className: string | null;
}

function picked(s: StudentRow): PickedStudent {
  return { id: s.id, name: fullName(s), admissionNumber: s.admissionNumber, className: s.classArm ? classLabel(s.classArm.classLevel.name, s.classArm.name) : null };
}

/** Search the school's students; single or multiple selection. */
export function StudentSearch({
  value,
  onChange,
  multiple,
  id,
  invalid,
}: {
  value: PickedStudent[];
  onChange: (v: PickedStudent[]) => void;
  multiple?: boolean;
  id?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 250);
  const list = useStudents({ q: q || undefined, page: 1, pageSize: 20, status: 'ACTIVE' }, open);
  const ids = new Set(value.map((v) => v.id));
  const pick = (s: StudentRow) => {
    if (!multiple) {
      onChange([picked(s)]);
      setOpen(false);
      setSearch('');
      return;
    }
    onChange(ids.has(s.id) ? value.filter((v) => v.id !== s.id) : [...value, picked(s)]);
  };
  const single = !multiple ? value[0] : undefined;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-invalid={invalid || undefined}
            className={cn(
              'flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 py-1.5 text-left text-sm shadow-xs transition-colors hover:border-border-strong focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15',
              invalid ? 'border-danger' : 'border-input',
            )}
          >
            {single ? (
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={single.name} initials={initialsFromName(single.name)} size="xs" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{single.name}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {single.admissionNumber}
                    {single.className && ` · ${single.className}`}
                  </span>
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">
                {multiple && value.length ? `${value.length} student${value.length === 1 ? '' : 's'} selected` : 'Search by name or admission no…'}
              </span>
            )}
            <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0">
          <Command shouldFilter={false} label="Students">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Type a name or admission no…"
                className="h-10 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/70"
              />
              {list.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            </div>
            <Command.List className="scrollbar-thin max-h-64 overflow-y-auto p-1.5">
              {!list.isFetching && <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted-foreground">No students found.</Command.Empty>}
              {list.data?.items.map((s) => (
                <Command.Item
                  key={s.id}
                  value={s.id}
                  onSelect={() => pick(s)}
                  className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[selected=true]:bg-muted', ids.has(s.id) && 'bg-brand-soft/60')}
                >
                  <Avatar name={fullName(s)} initials={initials(s.firstName, s.lastName)} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{fullName(s)}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {s.admissionNumber}
                      {s.classArm && ` · ${classLabel(s.classArm.classLevel.name, s.classArm.name)}`}
                    </span>
                  </span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </PopoverContent>
      </Popover>
      {multiple && value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-[12px]">
              {s.name}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v.id !== s.id))}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-border hover:text-foreground"
                aria-label={`Remove ${s.name}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export type NotifyChannel = 'IN_APP' | 'PUSH' | 'SMS' | 'EMAIL';

/** "Tell the parents" with a choice of channels; SMS and email only for staff who may send them. */
export function NotifyParents({
  on,
  onToggle,
  channels,
  onChannels,
  label = 'Notify parents',
  description,
  emphasise,
  fixed,
}: {
  /** Always on: just the channel choice (no switch). */
  fixed?: boolean;
  on: boolean;
  onToggle: (v: boolean) => void;
  channels: NotifyChannel[];
  onChannels: (c: NotifyChannel[]) => void;
  label?: string;
  description?: string;
  emphasise?: boolean;
}) {
  const canPaid = useCan('comms.send');
  const opts: { key: NotifyChannel; label: string }[] = [
    { key: 'IN_APP', label: 'App' },
    { key: 'PUSH', label: 'Push' },
    ...(canPaid ? ([{ key: 'SMS', label: 'SMS' }, { key: 'EMAIL', label: 'Email' }] as const) : []),
  ];
  const toggle = (c: NotifyChannel, v: boolean) => onChannels(v ? [...new Set([...channels, c])] : channels.filter((x) => x !== c));
  return (
    <div className={cn('rounded-xl border px-4 py-3', emphasise ? 'border-warning/50 bg-warning-soft/40' : 'border-border bg-muted/30')}>
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span>
          <span className="block text-[13.5px] font-medium">{label}</span>
          <span className="block text-[12px] text-muted-foreground">{description ?? 'A respectful message goes to every parent and guardian on record.'}</span>
        </span>
        {!fixed && <Switch checked={on} onCheckedChange={onToggle} />}
      </label>
      {on && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2" role="group" aria-label="Channels">
          {opts.map((o) => (
            <label key={o.key} className="flex cursor-pointer items-center gap-2 text-[13px]">
              <Checkbox checked={channels.includes(o.key)} onCheckedChange={(v) => toggle(o.key, v === true)} />
              {o.label}
            </label>
          ))}
          {!canPaid && <span className="text-[12px] text-muted-foreground">SMS and email need messaging permission.</span>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ school-time helpers

function parts(at: Date, tz: string | undefined) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
}

/** "14:05" in the school's time zone. */
export function schoolTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: schoolTimeZone(), hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
}

/** A datetime-local value ("2026-10-04T09:30") showing an instant in school time. */
export function toSchoolInput(at: Date): string {
  const p = parts(at, schoolTimeZone());
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

/** The instant a school-time datetime-local value refers to, as ISO. */
export function fromSchoolInput(value: string): string {
  const guess = Date.parse(`${value}:00Z`);
  const p = parts(new Date(guess), schoolTimeZone());
  const shown = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour! % 24, +p.minute!);
  return new Date(guess - (shown - guess)).toISOString();
}
