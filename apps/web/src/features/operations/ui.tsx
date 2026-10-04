import type { AssetCondition, Paginated, StaffRow, VehicleStatus } from '@aischool/shared';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { AlertTriangle, Briefcase, Check, ChevronsUpDown, GraduationCap, Loader2, X } from 'lucide-react';
import QRCode from 'qrcode';
import * as React from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api, ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { useDebounced } from '@/lib/hooks';
import { qk } from '@/lib/query-client';
import { cn, fullName, initialsFromName } from '@/lib/utils';
import { classLabel } from '@/lib/format';
import { useStudents } from '../students/api';
import { CopyButton } from '../finance/ui';

export const dateInput = 'tabular [color-scheme:light] dark:[color-scheme:dark]';

/** Map an API error onto field errors, or a form-level message. */
export function apiFieldErrors(err: unknown): Record<string, string> {
  if (err instanceof ApiError && err.errors.length) return Object.fromEntries(err.errors.map((x) => [x.path, x.message]));
  return { form: err instanceof Error ? err.message : 'Something went wrong. Please try again.' };
}

/** First zod issue per top-level field. */
export function zodErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0] ?? 'form')] ??= i.message;
  return out;
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft/50 px-3.5 py-2.5 text-[13px] text-danger">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {message}
    </p>
  );
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** "2026-10-01T08:30" in local time, for <input type="datetime-local">. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Time of day in the viewer's locale, e.g. "08:42". */
export function timeOf(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d);
}

// ------------------------------------------------------------------ segmented control

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = 'default',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; count?: number }[];
  label: string;
  className?: string;
  size?: 'default' | 'sm';
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-muted/60 p-1', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5',
              size === 'sm' ? 'h-7 text-[12.5px]' : 'h-8 text-[13px]',
              on ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
            {o.count != null && o.count > 0 && (
              <span className={cn('rounded-full px-1.5 text-[10.5px] tabular', on ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground')}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ combo

export interface PickedPerson {
  id: string;
  name: string;
  detail: string | null;
}

interface ComboProps {
  id?: string;
  value: PickedPerson | null;
  onChange: (v: PickedPerson | null) => void;
  options: PickedPerson[];
  loading?: boolean;
  /** Server-side search: when given, typing calls this and the list isn't filtered locally. */
  onSearch?: (q: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  invalid?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}

/** A searchable single-select with avatars. */
export function Combo({ id, value, onChange, options, loading, onSearch, placeholder, searchPlaceholder = 'Type to search…', emptyText = 'No matches.', invalid, disabled, icon }: ComboProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  React.useEffect(() => {
    if (!open) {
      setSearch('');
      onSearch?.('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className="flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm shadow-xs transition-colors hover:border-border-strong focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger"
        >
          {value ? (
            <>
              <Avatar name={value.name} initials={initialsFromName(value.name)} size="xs" />
              <span className="min-w-0 flex-1 truncate">
                {value.name}
                {value.detail && <span className="text-muted-foreground"> · {value.detail}</span>}
              </span>
            </>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-muted-foreground/80 [&_svg]:size-4">
              {icon}
              {placeholder}
            </span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0">
        <Command shouldFilter={!onSearch} label={placeholder}>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Command.Input
              value={search}
              onValueChange={(v) => {
                setSearch(v);
                onSearch?.(v);
              }}
              placeholder={searchPlaceholder}
              className="h-10 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/70"
            />
            {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
          </div>
          <Command.List className="scrollbar-thin max-h-64 overflow-y-auto p-1.5">
            {!loading && <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted-foreground">{emptyText}</Command.Empty>}
            {value && (
              <Command.Item
                value="__clear__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-muted-foreground outline-none data-[selected=true]:bg-muted"
              >
                <X className="size-3.5" aria-hidden /> Clear selection
              </Command.Item>
            )}
            {options.map((o) => (
              <Command.Item
                key={o.id}
                value={onSearch ? o.id : `${o.name} ${o.detail ?? ''} ${o.id}`}
                onSelect={() => {
                  onChange(o);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[selected=true]:bg-muted"
              >
                <Avatar name={o.name} initials={initialsFromName(o.name)} size="xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{o.name}</span>
                  {o.detail && <span className="block truncate text-[11.5px] text-muted-foreground">{o.detail}</span>}
                </span>
                <Check className={cn('size-4 text-brand', value?.id === o.id ? 'opacity-100' : 'opacity-0')} aria-hidden />
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type PickerProps = Omit<ComboProps, 'options' | 'loading' | 'onSearch' | 'placeholder'> & { placeholder?: string };

/** One student, searched by name or admission number. */
export function StudentCombo({ placeholder = 'Search for a student…', ...props }: PickerProps) {
  const [q, setQ] = React.useState('');
  const term = useDebounced(q.trim(), 250);
  const list = useStudents({ q: term || undefined, page: 1, pageSize: 20, status: 'ACTIVE' });
  const options = (list.data?.items ?? []).map((s) => ({
    id: s.id,
    name: fullName(s),
    detail: [s.classArm ? classLabel(s.classArm.classLevel.name, s.classArm.name) : null, s.admissionNumber].filter(Boolean).join(' · '),
  }));
  return <Combo {...props} options={options} loading={list.isFetching} onSearch={setQ} placeholder={placeholder} searchPlaceholder="Name or admission number…" emptyText="No students found." icon={<GraduationCap />} />;
}

/** One member of staff (needs staff.read). */
export function StaffCombo({ placeholder = 'Search for a member of staff…', ...props }: PickerProps) {
  const [q, setQ] = React.useState('');
  const term = useDebounced(q.trim(), 250);
  const query = { q: term || undefined, page: 1, pageSize: 25 };
  const list = useQuery({
    queryKey: qk.staff(query),
    queryFn: ({ signal }) => api.get<Paginated<StaffRow>>('/staff', query, signal),
  });
  const options = (list.data?.items ?? []).filter((s) => s.status !== 'EXITED').map((s) => ({ id: s.id, name: fullName(s), detail: s.jobTitle }));
  return <Combo {...props} options={options} loading={list.isFetching} onSearch={setQ} placeholder={placeholder} searchPlaceholder="Name or staff number…" emptyText="No staff found." icon={<Briefcase />} />;
}

/** Student or staff toggle plus the right picker. */
export function PersonPicker({
  id,
  kind,
  onKind,
  value,
  onChange,
  invalid,
}: {
  id: string;
  kind: 'STUDENT' | 'STAFF';
  onKind: (k: 'STUDENT' | 'STAFF') => void;
  value: PickedPerson | null;
  onChange: (v: PickedPerson | null) => void;
  invalid?: boolean;
}) {
  const canStudents = useCan('students.read');
  const canStaff = useCan('staff.read');
  React.useEffect(() => {
    if (kind === 'STUDENT' && !canStudents && canStaff) onKind('STAFF');
    if (kind === 'STAFF' && !canStaff && canStudents) onKind('STUDENT');
  }, [kind, canStudents, canStaff, onKind]);
  return (
    <div className="grid gap-2">
      {canStudents && canStaff && (
        <Segmented
          size="sm"
          label="Who for"
          value={kind}
          onChange={(k) => {
            onKind(k);
            onChange(null);
          }}
          options={[
            { value: 'STUDENT', label: <><GraduationCap /> Student</> },
            { value: 'STAFF', label: <><Briefcase /> Staff</> },
          ]}
          className="self-start"
        />
      )}
      {kind === 'STUDENT' && canStudents ? (
        <StudentCombo id={id} value={value} onChange={onChange} invalid={invalid} />
      ) : kind === 'STAFF' && canStaff ? (
        <StaffCombo id={id} value={value} onChange={onChange} invalid={invalid} />
      ) : (
        <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-[12.5px] text-muted-foreground">You need access to the {kind === 'STUDENT' ? 'student' : 'staff'} list to choose someone.</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ badges

const CONDITION: Record<AssetCondition, { label: string; variant: 'success' | 'info' | 'warning' | 'danger' }> = {
  NEW: { label: 'New', variant: 'success' },
  GOOD: { label: 'Good', variant: 'success' },
  FAIR: { label: 'Fair', variant: 'info' },
  POOR: { label: 'Poor', variant: 'warning' },
  BROKEN: { label: 'Broken', variant: 'danger' },
};
export const CONDITION_LABEL: Record<AssetCondition, string> = Object.fromEntries(Object.entries(CONDITION).map(([k, v]) => [k, v.label])) as Record<AssetCondition, string>;

export function ConditionBadge({ condition }: { condition: AssetCondition | null }) {
  if (!condition) return null;
  const c = CONDITION[condition];
  return (
    <Badge variant={c.variant} dot>
      {c.label}
    </Badge>
  );
}

const VEHICLE: Record<VehicleStatus, { label: string; variant: 'success' | 'warning' | 'outline' }> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  MAINTENANCE: { label: 'In maintenance', variant: 'warning' },
  RETIRED: { label: 'Retired', variant: 'outline' },
};
export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = { ACTIVE: 'Active', MAINTENANCE: 'In maintenance', RETIRED: 'Retired' };

export function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  const v = VEHICLE[status];
  return (
    <Badge variant={v.variant} dot={status !== 'RETIRED'}>
      {v.label}
    </Badge>
  );
}

// ------------------------------------------------------------------ QR

/** A QR code as a PNG data URL (prints crisply and works in <img>). */
export function useQrDataUrl(text: string | null | undefined, width = 240): string | null {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!text) {
      setUrl(null);
      return;
    }
    let alive = true;
    void QRCode.toDataURL(text, { margin: 0, width, errorCorrectionLevel: 'M', color: { dark: '#0a1024', light: '#ffffff' } }).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [text, width]);
  return url;
}

export function QrImage({ text, size, className, label }: { text: string; size: number | string; className?: string; label: string }) {
  const url = useQrDataUrl(text, 320);
  return url ? (
    <img src={url} alt={label} className={cn('block bg-white', className)} style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className={cn('block animate-pulse rounded bg-muted', className)} style={{ width: size, height: size }} />
  );
}

// ------------------------------------------------------------------ copy blocks

/** A drafted message with a Copy button. */
export function CopyBlock({ title, text, hint }: { title: string; text: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2">
        <p className="min-w-0 truncate text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
          {hint && <span className="ml-2 font-normal normal-case tracking-normal">{hint}</span>}
        </p>
        <CopyButton text={text} label={title.toLowerCase()} />
      </div>
      <p className="whitespace-pre-wrap break-words px-3.5 py-3 text-[13.5px] leading-relaxed">{text}</p>
    </div>
  );
}

// ------------------------------------------------------------------ capacity bar

export function CapacityBar({ used, total, label, className }: { used: number; total: number; label: string; className?: string }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : used > 0 ? 100 : 0;
  const over = total > 0 && used > total;
  const tone = over ? 'bg-danger' : pct >= 90 ? 'bg-warning' : 'bg-brand';
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={used}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-700', tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}
