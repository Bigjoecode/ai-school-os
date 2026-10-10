import {
  CENSUS_DISCLAIMER,
  OWNERSHIP_LABELS,
  POWER_SOURCES,
  POWER_SOURCE_LABELS,
  SCHOOL_OWNERSHIPS,
  SPECIAL_NEEDS_SUGGESTIONS,
  WATER_SOURCES,
  WATER_SOURCE_LABELS,
  type CensusProfile,
} from '@aischool/shared';
import { useQuery } from '@tanstack/react-query';
import { FileBarChart, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { SectionHeader } from '../settings/settings-layout';
import { useCensusProfile, useRemoveBranchProfile, useSaveCensusProfile } from './api';

const MAIN = '__main__';
const UNSET = '__unset__';

type Form = {
  [K in keyof CensusProfile]: CensusProfile[K] extends number | null ? string : CensusProfile[K] extends boolean | null ? 'yes' | 'no' | '' : CensusProfile[K];
};

const NUM_KEYS = [
  'yearEstablished',
  'gpsLatitude',
  'gpsLongitude',
  'classroomsGood',
  'classroomsMinorRepairs',
  'classroomsMajorRepairs',
  'toiletsBoys',
  'toiletsGirls',
  'toiletsStaff',
  'toiletsShared',
  'scienceLabs',
  'computerLabs',
  'computersForPupils',
] as const;
const BOOL_KEYS = ['playground', 'library', 'sickBay', 'fence', 'handWashing'] as const;

function toForm(p: CensusProfile | undefined): Form {
  const base = (p ?? {}) as Partial<CensusProfile>;
  const f: Record<string, unknown> = {
    ownership: base.ownership ?? null,
    registrationNumber: base.registrationNumber ?? '',
    state: base.state ?? '',
    lga: base.lga ?? '',
    ward: base.ward ?? '',
    locality: base.locality ?? null,
    headName: base.headName ?? '',
    headPhone: base.headPhone ?? '',
    waterSources: base.waterSources ?? [],
    powerSources: base.powerSources ?? [],
    specialNeeds: base.specialNeeds ?? [],
    notes: base.notes ?? '',
  };
  for (const k of NUM_KEYS) f[k] = base[k] == null ? '' : String(base[k]);
  for (const k of BOOL_KEYS) f[k] = base[k] == null ? '' : base[k] ? 'yes' : 'no';
  return f as Form;
}

function fromForm(f: Form): Record<string, unknown> {
  const out: Record<string, unknown> = { ...f };
  for (const k of NUM_KEYS) out[k] = f[k] === '' ? null : Number(f[k]);
  for (const k of BOOL_KEYS) out[k] = f[k] === '' ? null : f[k] === 'yes';
  return out;
}

/** Settings → Returns profile: the facts the census asks for that the rest of the app doesn't keep. */
export default function CensusProfilePage() {
  const canManage = useCan('school.manage');
  const q = useCensusProfile();
  const branches = useQuery({
    queryKey: ['census', 'branches'],
    queryFn: ({ signal }) => api.get<{ id: string; name: string }[]>('/census/branches', undefined, signal),
  });
  const [scope, setScope] = useState(MAIN);
  const [form, setForm] = useState<Form>(() => toForm(undefined));
  const [share, setShare] = useState(false);
  const save = useSaveCensusProfile();
  const remove = useRemoveBranchProfile();

  const stored = scope === MAIN ? q.data?.main : q.data?.branches[scope];
  useEffect(() => {
    if (!q.data) return;
    // A campus without its own profile starts from the whole-school one.
    setForm(toForm(scope === MAIN ? q.data.main : (q.data.branches[scope] ?? q.data.main)));
    setShare(q.data.shareAggregates);
  }, [q.data, scope]);

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-[600px] rounded-2xl" />;

  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const branchList = branches.data ?? [];
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const submit = () =>
    save.mutate(
      { branchId: scope === MAIN ? null : scope, profile: fromForm(form) as never, shareAggregates: share },
      {
        onSuccess: () => toast.success('Returns profile saved'),
        onError: (e) => toast.error(e.message),
      },
    );

  const numInput = (k: (typeof NUM_KEYS)[number], label: string, opts: { step?: string; placeholder?: string } = {}) => (
    <Field label={label} htmlFor={`cp-${k}`} optional>
      <Input id={`cp-${k}`} type="number" inputMode="decimal" min={k.startsWith('gps') ? undefined : 0} step={opts.step ?? '1'} value={form[k]} placeholder={opts.placeholder} onChange={(e) => set({ [k]: e.target.value } as Partial<Form>)} />
    </Field>
  );
  const boolInput = (k: (typeof BOOL_KEYS)[number], label: string) => (
    <Field label={label} htmlFor={`cp-${k}`} optional>
      <Select value={form[k] || UNSET} onValueChange={(v) => set({ [k]: v === UNSET ? '' : v } as Partial<Form>)}>
        <SelectTrigger id={`cp-${k}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET}>Not recorded</SelectItem>
          <SelectItem value="yes">Yes</SelectItem>
          <SelectItem value="no">No</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );

  return (
    <div className="space-y-5">
      <SectionHeader
        title="School profile for returns"
        description={`Facilities and identity details for the Annual School Census and other state returns. ${CENSUS_DISCLAIMER}`}
        actions={
          <Button variant="outline" asChild>
            <Link to="/returns">
              <FileBarChart /> Open Returns & census
            </Link>
          </Button>
        }
      />

      {branchList.length > 1 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="sm:w-72" aria-label="Which campus">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={MAIN}>Whole school</SelectItem>
              {branchList.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                  {q.data?.branches[b.id] ? '' : ' (uses whole-school profile)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {scope !== MAIN && stored && canManage && (
            <Button
              variant="ghost"
              size="sm"
              loading={remove.isPending}
              onClick={() => remove.mutate(scope, { onSuccess: () => toast.success('This campus now uses the whole-school profile') })}
            >
              <Trash2 /> Use whole-school profile instead
            </Button>
          )}
          {scope !== MAIN && !stored && <p className="text-[12.5px] text-muted-foreground">Saving creates a separate profile for this campus.</p>}
        </div>
      )}

      <fieldset disabled={!canManage} className="space-y-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Identity and location</CardTitle>
              <CardDescription>As shown on your approval letter from the state ministry or SUBEB.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Ownership" htmlFor="cp-own" optional>
              <Select value={form.ownership ?? UNSET} onValueChange={(v) => set({ ownership: v === UNSET ? null : (v as Form['ownership']) })}>
                <SelectTrigger id="cp-own">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Not recorded</SelectItem>
                  {SCHOOL_OWNERSHIPS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {OWNERSHIP_LABELS[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Registration / approval number" htmlFor="cp-reg" optional>
              <Input id="cp-reg" value={form.registrationNumber ?? ''} maxLength={60} onChange={(e) => set({ registrationNumber: e.target.value })} />
            </Field>
            {numInput('yearEstablished', 'Year established', { placeholder: 'e.g. 2008' })}
            <Field label="State" htmlFor="cp-state" optional>
              <Input id="cp-state" value={form.state ?? ''} maxLength={40} placeholder="e.g. Lagos" onChange={(e) => set({ state: e.target.value })} />
            </Field>
            <Field label="Local Government Area (LGA)" htmlFor="cp-lga" optional>
              <Input id="cp-lga" value={form.lga ?? ''} maxLength={80} onChange={(e) => set({ lga: e.target.value })} />
            </Field>
            <Field label="Ward" htmlFor="cp-ward" optional>
              <Input id="cp-ward" value={form.ward ?? ''} maxLength={80} onChange={(e) => set({ ward: e.target.value })} />
            </Field>
            <Field label="Location" htmlFor="cp-loc" optional>
              <Select value={form.locality ?? UNSET} onValueChange={(v) => set({ locality: v === UNSET ? null : (v as Form['locality']) })}>
                <SelectTrigger id="cp-loc">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Not recorded</SelectItem>
                  <SelectItem value="URBAN">Urban</SelectItem>
                  <SelectItem value="RURAL">Rural</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {numInput('gpsLatitude', 'GPS latitude', { step: 'any', placeholder: 'e.g. 6.4474' })}
            {numInput('gpsLongitude', 'GPS longitude', { step: 'any', placeholder: 'e.g. 3.4700' })}
            <Field label="Head of school (for sign-off)" htmlFor="cp-head" optional>
              <Input id="cp-head" value={form.headName ?? ''} maxLength={120} onChange={(e) => set({ headName: e.target.value })} />
            </Field>
            <Field label="Head's phone" htmlFor="cp-headphone" optional>
              <Input id="cp-headphone" type="tel" value={form.headPhone ?? ''} maxLength={20} placeholder="0803 123 4567" onChange={(e) => set({ headPhone: e.target.value })} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Classrooms and toilets</CardTitle>
              <CardDescription>Count rooms used for teaching. Leave a box empty if you don't know yet.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {numInput('classroomsGood', 'Classrooms in good condition')}
            {numInput('classroomsMinorRepairs', 'Needing minor repairs')}
            {numInput('classroomsMajorRepairs', 'Needing major repairs')}
            {numInput('toiletsBoys', 'Toilets for boys only')}
            {numInput('toiletsGirls', 'Toilets for girls only')}
            {numInput('toiletsStaff', 'Toilets for staff only')}
            {numInput('toiletsShared', 'Shared toilets')}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Water, power and facilities</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-2 text-[13px] font-medium">Water source(s)</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {WATER_SOURCES.map((w) => (
                  <label key={w} className="flex items-center gap-2 text-[13.5px]">
                    <Checkbox checked={form.waterSources.includes(w)} onCheckedChange={() => set({ waterSources: toggle(form.waterSources, w) })} />
                    {WATER_SOURCE_LABELS[w]}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[13px] font-medium">Power source(s)</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {POWER_SOURCES.map((w) => (
                  <label key={w} className="flex items-center gap-2 text-[13.5px]">
                    <Checkbox checked={form.powerSources.includes(w)} onCheckedChange={() => set({ powerSources: toggle(form.powerSources, w) })} />
                    {POWER_SOURCE_LABELS[w]}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {boolInput('handWashing', 'Hand-washing facility')}
              {boolInput('playground', 'Playground / sports field')}
              {boolInput('library', 'Library')}
              {boolInput('sickBay', 'Sick bay / first aid room')}
              {boolInput('fence', 'Perimeter fence')}
              {numInput('scienceLabs', 'Science laboratories')}
              {numInput('computerLabs', 'Computer / ICT laboratories')}
              {numInput('computersForPupils', 'Computers for pupils')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pupils with special needs</CardTitle>
              <CardDescription>
                Enter counts only. The app does not keep a special-needs flag on pupil records, so no names are stored here. Use the categories on your state's form — the suggestions are examples.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {form.specialNeeds.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_5rem_auto] items-end gap-2">
                <Field label={i === 0 ? 'Category' : ''} htmlFor={`sn-c-${i}`}>
                  <Input id={`sn-c-${i}`} value={r.category} maxLength={60} list="sn-suggestions" onChange={(e) => set({ specialNeeds: form.specialNeeds.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)) })} />
                </Field>
                <Field label={i === 0 ? 'Male' : ''} htmlFor={`sn-m-${i}`}>
                  <Input id={`sn-m-${i}`} type="number" min={0} value={r.male} onChange={(e) => set({ specialNeeds: form.specialNeeds.map((x, j) => (j === i ? { ...x, male: Math.max(0, Number(e.target.value) || 0) } : x)) })} />
                </Field>
                <Field label={i === 0 ? 'Female' : ''} htmlFor={`sn-f-${i}`}>
                  <Input id={`sn-f-${i}`} type="number" min={0} value={r.female} onChange={(e) => set({ specialNeeds: form.specialNeeds.map((x, j) => (j === i ? { ...x, female: Math.max(0, Number(e.target.value) || 0) } : x)) })} />
                </Field>
                <Button variant="ghost" size="icon" aria-label="Remove row" onClick={() => set({ specialNeeds: form.specialNeeds.filter((_, j) => j !== i) })}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <datalist id="sn-suggestions">
              {SPECIAL_NEEDS_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <Button
              variant="outline"
              size="sm"
              disabled={form.specialNeeds.length >= 20}
              onClick={() => set({ specialNeeds: [...form.specialNeeds, { category: SPECIAL_NEEDS_SUGGESTIONS[form.specialNeeds.length] ?? '', male: 0, female: 0 }] })}
            >
              <Plus /> Add a category
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Notes and sharing</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Notes for whoever prepares the return" htmlFor="cp-notes" optional>
              <Textarea id="cp-notes" rows={3} value={form.notes ?? ''} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} />
            </Field>
            <label className="flex items-start gap-3 rounded-xl border border-border p-3">
              <Switch checked={share} onCheckedChange={setShare} className="mt-0.5" />
              <span className="text-[13.5px]">
                <span className="font-medium">Include our anonymous totals in state and LGA summaries</span>
                <span className="block text-[12.5px] text-muted-foreground">
                  Optional. Shares only counts (pupils and teachers by sex, classrooms) with the AI School OS team, grouped by state and LGA. No names or pupil records. You can turn this off at any time.
                </span>
              </span>
            </label>
          </CardContent>
          {canManage && (
            <CardFooter className="justify-end">
              <Button onClick={submit} loading={save.isPending}>
                <Save /> Save {scope === MAIN ? 'profile' : 'campus profile'}
              </Button>
            </CardFooter>
          )}
        </Card>
      </fieldset>
    </div>
  );
}
