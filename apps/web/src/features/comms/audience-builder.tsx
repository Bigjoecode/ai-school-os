import type { Audience, AudienceType, GuardianRow, Paginated } from '@aischool/shared';
import { useQuery } from '@tanstack/react-query';
import { BedDouble, Briefcase, Building2, Bus, Contact, GraduationCap, Plus, Receipt, Trash2, UserCheck, Users, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { useDebounced } from '@/lib/hooks';
import { qk } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { classLabel } from '@/lib/format';
import { useStructure } from '../academics/api';
import { MoneyInput, koboToInput, parseNaira, useCurrency } from '../finance/ui';
import { useDepartments } from '../hr/api';
import { useHostelOverview, useTransportOverview } from '../operations/api';
import { Combo, type PickedPerson, Segmented, StaffCombo } from '../operations/ui';
import type { ComposePrefill } from './ui';

export interface ContactDraft {
  name: string;
  email: string;
  phone: string;
}

export interface AudienceDraft {
  type: AudienceType;
  primaryOnly: boolean;
  classLevelIds: string[];
  classArmIds: string[];
  minBalance: string;
  overdueOnly: boolean;
  routeIds: string[];
  hostelIds: string[];
  departmentIds: string[];
  staffType: 'ANY' | 'TEACHING' | 'NON_TEACHING';
  guardians: PickedPerson[];
  staff: PickedPerson[];
  contacts: ContactDraft[];
}

export const EMPTY_AUDIENCE: AudienceDraft = {
  type: 'ALL_PARENTS',
  primaryOnly: true,
  classLevelIds: [],
  classArmIds: [],
  minBalance: '',
  overdueOnly: false,
  routeIds: [],
  hostelIds: [],
  departmentIds: [],
  staffType: 'ANY',
  guardians: [],
  staff: [],
  contacts: [{ name: '', email: '', phone: '' }],
};

/** Rebuild the editable draft from a saved audience (and any names the caller knows). */
export function draftFromAudience(a: Audience | undefined, people?: ComposePrefill['people']): AudienceDraft {
  const d: AudienceDraft = { ...EMPTY_AUDIENCE, contacts: [...EMPTY_AUDIENCE.contacts] };
  if (!a) return d;
  d.type = a.type;
  if ('primaryOnly' in a) d.primaryOnly = a.primaryOnly;
  switch (a.type) {
    case 'CLASS_PARENTS':
      d.classArmIds = a.classArmIds;
      d.classLevelIds = a.classLevelIds;
      break;
    case 'FEE_DEBTORS':
      d.minBalance = a.minBalanceKobo ? koboToInput(a.minBalanceKobo) : '';
      d.overdueOnly = a.overdueOnly;
      break;
    case 'ROUTE_PARENTS':
      d.routeIds = a.routeIds;
      break;
    case 'HOSTEL_PARENTS':
      d.hostelIds = a.hostelIds;
      break;
    case 'STAFF_GROUP':
      d.departmentIds = a.departmentIds;
      d.staffType = a.staffType ?? 'ANY';
      break;
    case 'PEOPLE': {
      const named = (ids: string[], list?: { id: string; name: string; detail?: string | null }[], fallback = 'Selected person') =>
        ids.map((id) => {
          const p = list?.find((x) => x.id === id);
          return { id, name: p?.name ?? fallback, detail: p?.detail ?? null };
        });
      d.guardians = named(a.guardianIds, people?.guardians, 'Parent');
      d.staff = named(a.staffIds, people?.staff, 'Staff member');
      break;
    }
    case 'CONTACTS':
      d.contacts = a.contacts.map((c) => ({ name: c.name, email: c.email ?? '', phone: c.phone ?? '' }));
      break;
  }
  return d;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The audience to send, or why it isn't ready yet. */
export function toAudience(d: AudienceDraft): { audience: Audience | null; problem?: string } {
  const primaryOnly = d.primaryOnly;
  switch (d.type) {
    case 'ALL_PARENTS':
      return { audience: { type: 'ALL_PARENTS', primaryOnly } };
    case 'CLASS_PARENTS':
      if (!d.classArmIds.length && !d.classLevelIds.length) return { audience: null, problem: 'Choose at least one class' };
      return { audience: { type: 'CLASS_PARENTS', classArmIds: d.classArmIds, classLevelIds: d.classLevelIds, primaryOnly } };
    case 'FEE_DEBTORS': {
      const naira = parseNaira(d.minBalance) ?? 0;
      return { audience: { type: 'FEE_DEBTORS', minBalanceKobo: Math.round(naira * 100), overdueOnly: d.overdueOnly, primaryOnly } };
    }
    case 'ROUTE_PARENTS':
      if (!d.routeIds.length) return { audience: null, problem: 'Choose at least one route' };
      return { audience: { type: 'ROUTE_PARENTS', routeIds: d.routeIds, primaryOnly } };
    case 'HOSTEL_PARENTS':
      return { audience: { type: 'HOSTEL_PARENTS', hostelIds: d.hostelIds, primaryOnly } };
    case 'ALL_STAFF':
      return { audience: { type: 'ALL_STAFF' } };
    case 'STAFF_GROUP':
      if (!d.departmentIds.length && d.staffType === 'ANY') return { audience: null, problem: 'Choose a department or a type of staff' };
      return { audience: { type: 'STAFF_GROUP', departmentIds: d.departmentIds, staffType: d.staffType === 'ANY' ? undefined : d.staffType } };
    case 'PEOPLE':
      if (!d.guardians.length && !d.staff.length) return { audience: null, problem: 'Add at least one person' };
      return { audience: { type: 'PEOPLE', guardianIds: d.guardians.map((g) => g.id), staffIds: d.staff.map((s) => s.id) } };
    case 'CONTACTS': {
      const rows = d.contacts.filter((c) => c.name.trim() || c.email.trim() || c.phone.trim());
      if (!rows.length) return { audience: null, problem: 'Add at least one contact' };
      for (const c of rows) {
        if (!c.name.trim()) return { audience: null, problem: 'Give every contact a name' };
        if (!c.email.trim() && !c.phone.trim()) return { audience: null, problem: `Add an email or phone number for ${c.name.trim()}` };
        if (c.email.trim() && !EMAIL.test(c.email.trim())) return { audience: null, problem: `${c.email.trim()} doesn’t look like an email address` };
      }
      return { audience: { type: 'CONTACTS', contacts: rows.map((c) => ({ name: c.name.trim(), email: c.email.trim() || null, phone: c.phone.trim() || null })) } };
    }
  }
}

export const isParentAudience = (t: AudienceType) => ['ALL_PARENTS', 'CLASS_PARENTS', 'FEE_DEBTORS', 'ROUTE_PARENTS', 'HOSTEL_PARENTS'].includes(t);

// ------------------------------------------------------------------ builder

export function AudienceBuilder({ value, onChange, problem }: { value: AudienceDraft; onChange: (d: AudienceDraft) => void; problem?: string }) {
  const canTransport = useCan('transport.read');
  const canHostel = useCan('hostel.read');
  const set = (patch: Partial<AudienceDraft>) => onChange({ ...value, ...patch });

  const options: { type: AudienceType; label: string; hint: string; icon: React.ComponentType<{ className?: string }>; show: boolean }[] = [
    { type: 'ALL_PARENTS', label: 'All parents', hint: 'Every family', icon: Users, show: true },
    { type: 'CLASS_PARENTS', label: 'Parents of classes', hint: 'By class or arm', icon: GraduationCap, show: true },
    { type: 'FEE_DEBTORS', label: 'Parents owing fees', hint: 'This term', icon: Receipt, show: true },
    { type: 'ROUTE_PARENTS', label: 'Bus route parents', hint: 'Riders’ families', icon: Bus, show: canTransport || value.type === 'ROUTE_PARENTS' },
    { type: 'HOSTEL_PARENTS', label: 'Parents of boarders', hint: 'By hostel', icon: BedDouble, show: canHostel || value.type === 'HOSTEL_PARENTS' },
    { type: 'ALL_STAFF', label: 'All staff', hint: 'Everyone on staff', icon: Briefcase, show: true },
    { type: 'STAFF_GROUP', label: 'Some staff', hint: 'Department or type', icon: Building2, show: true },
    { type: 'PEOPLE', label: 'Specific people', hint: 'Pick parents or staff', icon: UserCheck, show: true },
    { type: 'CONTACTS', label: 'Other contacts', hint: 'Not on record', icon: Contact, show: true },
  ];

  return (
    <div className="grid gap-4">
      <div role="radiogroup" aria-label="Who to send to" className="grid grid-cols-2 gap-2 sm:grid-cols-3 [&>*]:min-w-0">
        {options
          .filter((o) => o.show)
          .map((o) => {
            const on = value.type === o.type;
            return (
              <button
                key={o.type}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set({ type: o.type })}
                className={cn(
                  'flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on ? 'border-brand bg-brand-soft/60 shadow-soft' : 'border-border bg-card hover:border-border-strong hover:bg-muted/40',
                )}
              >
                <o.icon className={cn('mt-0.5 size-4 shrink-0', on ? 'text-brand' : 'text-muted-foreground')} aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{o.label}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">{o.hint}</span>
                </span>
              </button>
            );
          })}
      </div>

      {value.type === 'CLASS_PARENTS' && <ClassPicker value={value} set={set} />}
      {value.type === 'FEE_DEBTORS' && <DebtorOptions value={value} set={set} />}
      {value.type === 'ROUTE_PARENTS' && <RoutePicker value={value} set={set} />}
      {value.type === 'HOSTEL_PARENTS' && <HostelPicker value={value} set={set} />}
      {value.type === 'STAFF_GROUP' && <StaffGroupPicker value={value} set={set} />}
      {value.type === 'PEOPLE' && <PeoplePicker value={value} set={set} />}
      {value.type === 'CONTACTS' && <ContactRows value={value} set={set} />}

      {isParentAudience(value.type) && (
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5">
          <span className="min-w-0">
            <span className="block text-[13px] font-medium">Main contact per child only</span>
            <span className="block text-[12px] text-muted-foreground">{value.primaryOnly ? 'One parent per child — usually the one who pays.' : 'Every parent and guardian on record.'}</span>
          </span>
          <Switch checked={value.primaryOnly} onCheckedChange={(v) => set({ primaryOnly: v })} aria-label="Main contact per child only" />
        </label>
      )}

      {problem && (
        <p className="text-[12.5px] font-medium text-warning" role="status">
          {problem}
        </p>
      )}
    </div>
  );
}

type Setter = (patch: Partial<AudienceDraft>) => void;

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
        on ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-card text-foreground hover:border-border-strong hover:bg-muted/50',
        disabled && on && 'opacity-70',
      )}
    >
      {children}
    </button>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border px-3.5 py-3 text-[12.5px] text-muted-foreground">{children}</p>;
}

function ClassPicker({ value, set }: { value: AudienceDraft; set: Setter }) {
  const can = useCan('academics.read');
  const s = useStructure();
  if (!can) return <Hint>You need access to Academic Setup to choose classes. Ask an admin, or pick “Specific people” instead.</Hint>;
  if (s.isLoading) return <Hint>Loading classes…</Hint>;
  const levels = [...(s.data?.classLevels ?? [])].sort((a, b) => a.order - b.order);
  if (!levels.length) return <Hint>No classes yet — add them in Academic Setup.</Hint>;
  return (
    <fieldset className="grid gap-2.5 rounded-xl border border-border p-3.5">
      <legend className="px-1 text-[12.5px] font-medium text-muted-foreground">Classes · tap a level for all its arms</legend>
      {levels.map((l) => {
        const whole = value.classLevelIds.includes(l.id);
        return (
          <div key={l.id} className="flex flex-wrap items-center gap-1.5">
            <Chip
              on={whole}
              onClick={() =>
                set({
                  classLevelIds: toggle(value.classLevelIds, l.id),
                  // Picking a whole level supersedes its single arms.
                  classArmIds: whole ? value.classArmIds : value.classArmIds.filter((a) => !l.arms.some((x) => x.id === a)),
                })
              }
            >
              {l.name}
            </Chip>
            {l.arms.length > 1 &&
              l.arms.map((a) => (
                <Chip key={a.id} on={whole || value.classArmIds.includes(a.id)} disabled={whole} onClick={() => set({ classArmIds: toggle(value.classArmIds, a.id) })}>
                  {classLabel(l.name, a.name)}
                </Chip>
              ))}
          </div>
        );
      })}
    </fieldset>
  );
}

function DebtorOptions({ value, set }: { value: AudienceDraft; set: Setter }) {
  const currency = useCurrency();
  return (
    <div className="grid gap-3 rounded-xl border border-border p-3.5 sm:grid-cols-2 sm:items-end [&>*]:min-w-0">
      <Field label="Owing at least" htmlFor="aud-min" optional hint="Leave empty for anyone with a balance.">
        <MoneyInput id="aud-min" value={value.minBalance} onChange={(v) => set({ minBalance: v })} currency={currency} placeholder="0" />
      </Field>
      <label className="flex h-10 cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 sm:mb-[22px]">
        <span className="text-[13px] font-medium">Past the due date only</span>
        <Switch checked={value.overdueOnly} onCheckedChange={(v) => set({ overdueOnly: v })} aria-label="Past the due date only" />
      </label>
    </div>
  );
}

function CheckList({ items, selected, onToggle, label }: { items: { id: string; name: string; detail?: string }[]; selected: string[]; onToggle: (id: string) => void; label: string }) {
  return (
    <fieldset className="grid gap-1 rounded-xl border border-border p-2">
      <legend className="sr-only">{label}</legend>
      {items.map((i) => (
        <label key={i.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50">
          <Checkbox checked={selected.includes(i.id)} onCheckedChange={() => onToggle(i.id)} />
          <span className="min-w-0 flex-1 truncate text-[13px]">{i.name}</span>
          {i.detail && <span className="shrink-0 text-[12px] text-muted-foreground">{i.detail}</span>}
        </label>
      ))}
    </fieldset>
  );
}

function RoutePicker({ value, set }: { value: AudienceDraft; set: Setter }) {
  const can = useCan('transport.read');
  const q = useTransportOverview();
  if (!can) return <Hint>{value.routeIds.length} route{value.routeIds.length === 1 ? '' : 's'} chosen.</Hint>;
  if (q.isLoading) return <Hint>Loading routes…</Hint>;
  const routes = (q.data?.routeList ?? []).filter((r) => r.active || value.routeIds.includes(r.id));
  if (!routes.length) return <Hint>No bus routes yet — add them in Transport.</Hint>;
  return <CheckList label="Routes" items={routes.map((r) => ({ id: r.id, name: r.name, detail: `${r.riders} rider${r.riders === 1 ? '' : 's'}` }))} selected={value.routeIds} onToggle={(id) => set({ routeIds: toggle(value.routeIds, id) })} />;
}

function HostelPicker({ value, set }: { value: AudienceDraft; set: Setter }) {
  const q = useHostelOverview();
  if (q.isLoading) return <Hint>Loading hostels…</Hint>;
  const hostels = q.data?.hostels ?? [];
  if (!hostels.length) return <Hint>Every boarder’s parents will get this.</Hint>;
  return (
    <div className="grid gap-1.5">
      <p className="text-[12.5px] text-muted-foreground">{value.hostelIds.length ? 'Only these hostels:' : 'All boarders — or narrow it to some hostels:'}</p>
      <CheckList label="Hostels" items={hostels.map((h) => ({ id: h.id, name: h.name }))} selected={value.hostelIds} onToggle={(id) => set({ hostelIds: toggle(value.hostelIds, id) })} />
    </div>
  );
}

function StaffGroupPicker({ value, set }: { value: AudienceDraft; set: Setter }) {
  const canHr = useCan('hr.read');
  const depts = useDepartments();
  return (
    <div className="grid gap-3 rounded-xl border border-border p-3.5">
      <div className="grid gap-1.5">
        <Label>Type of staff</Label>
        <Segmented
          size="sm"
          label="Type of staff"
          value={value.staffType}
          onChange={(v) => set({ staffType: v })}
          options={[
            { value: 'ANY', label: 'Any' },
            { value: 'TEACHING', label: 'Teaching' },
            { value: 'NON_TEACHING', label: 'Non-teaching' },
          ]}
          className="self-start"
        />
      </div>
      {canHr && (
        <div className="grid gap-1.5">
          <Label>Departments</Label>
          {depts.isLoading ? (
            <p className="text-[12.5px] text-muted-foreground">Loading departments…</p>
          ) : (depts.data ?? []).length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">No departments yet — set them up in HR.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(depts.data ?? []).map((d) => (
                <Chip key={d.id} on={value.departmentIds.includes(d.id)} onClick={() => set({ departmentIds: toggle(value.departmentIds, d.id) })}>
                  {d.name} <span className="opacity-70 tabular">{d.headcount}</span>
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One parent, searched by name or phone (needs guardians.read). */
function GuardianCombo({ onPick }: { onPick: (p: PickedPerson) => void }) {
  const [q, setQ] = React.useState('');
  const term = useDebounced(q.trim(), 250);
  const query = { q: term || undefined, page: 1, pageSize: 20 };
  const list = useQuery({
    queryKey: qk.guardians(query),
    queryFn: ({ signal }) => api.get<Paginated<GuardianRow>>('/guardians', query, signal),
  });
  const options = (list.data?.items ?? []).map((g) => ({
    id: g.id,
    name: `${g.firstName} ${g.lastName}`,
    detail: g.students.length ? `Parent of ${g.students.map((s) => s.firstName).join(', ')}` : g.phone,
  }));
  return (
    <Combo
      id="aud-guardian"
      value={null}
      onChange={(p) => p && onPick(p)}
      options={options}
      loading={list.isFetching}
      onSearch={setQ}
      placeholder="Add a parent…"
      searchPlaceholder="Name or phone…"
      emptyText="No parents found."
      icon={<Users />}
    />
  );
}

function PeoplePicker({ value, set }: { value: AudienceDraft; set: Setter }) {
  const canGuardians = useCan('guardians.read');
  const canStaff = useCan('staff.read');
  const people = [...value.guardians.map((p) => ({ ...p, kind: 'guardian' as const })), ...value.staff.map((p) => ({ ...p, kind: 'staff' as const }))];
  return (
    <div className="grid gap-3 rounded-xl border border-border p-3.5">
      <div className="grid gap-2 sm:grid-cols-2 [&>*]:min-w-0">
        {canGuardians && <GuardianCombo onPick={(p) => !value.guardians.some((g) => g.id === p.id) && set({ guardians: [...value.guardians, p] })} />}
        {canStaff && <StaffCombo value={null} onChange={(p) => p && !value.staff.some((s) => s.id === p.id) && set({ staff: [...value.staff, p] })} placeholder="Add a member of staff…" />}
      </div>
      {!canGuardians && !canStaff && <p className="text-[12.5px] text-muted-foreground">You need access to the parent or staff list to pick people. Use “Other contacts” instead.</p>}
      {people.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen people">
          {people.map((p) => (
            <li key={`${p.kind}-${p.id}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/40 py-0.5 pl-2.5 pr-1 text-[12.5px]">
              {p.kind === 'staff' ? <Briefcase className="size-3 shrink-0 text-muted-foreground" aria-hidden /> : <Users className="size-3 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="truncate">{p.name}</span>
              <button
                type="button"
                className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Remove ${p.name}`}
                onClick={() => (p.kind === 'staff' ? set({ staff: value.staff.filter((s) => s.id !== p.id) }) : set({ guardians: value.guardians.filter((g) => g.id !== p.id) }))}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">Nobody chosen yet.</p>
      )}
    </div>
  );
}

function ContactRows({ value, set }: { value: AudienceDraft; set: Setter }) {
  const update = (i: number, patch: Partial<ContactDraft>) => set({ contacts: value.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <div className="grid gap-2.5 rounded-xl border border-border p-3.5">
      {value.contacts.map((c, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_0.8fr_auto] sm:items-center [&>*]:min-w-0">
          <Input value={c.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Name" aria-label={`Contact ${i + 1} name`} maxLength={120} />
          <Input type="email" value={c.email} onChange={(e) => update(i, { email: e.target.value })} placeholder="Email" aria-label={`Contact ${i + 1} email`} />
          <Input type="tel" value={c.phone} onChange={(e) => update(i, { phone: e.target.value })} placeholder="Phone" aria-label={`Contact ${i + 1} phone`} maxLength={20} />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove contact ${i + 1}`}
            disabled={value.contacts.length === 1}
            onClick={() => set({ contacts: value.contacts.filter((_, j) => j !== i) })}
            className="justify-self-end"
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={value.contacts.length >= 50} onClick={() => set({ contacts: [...value.contacts, { name: '', email: '', phone: '' }] })}>
        <Plus /> Add contact
      </Button>
    </div>
  );
}
