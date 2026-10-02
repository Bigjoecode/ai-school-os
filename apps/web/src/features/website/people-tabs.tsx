import { CalendarDays, Info, Lock, MapPin, Pencil, Users } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/format';
import { cn, initialsFromName, titleCase } from '@/lib/utils';
import { Segmented } from '../operations/ui';
import { type WebsiteTeacherRow, useSaveTeacher, useToggleEvent, useWebsiteEvents, useWebsiteTeachers } from './api';
import { ImageUpload } from './ui';

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <Card className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-9 rounded-full" />
        </div>
      ))}
    </Card>
  );
}

// ------------------------------------------------------------------ teachers

export function WebsiteTeachersTab() {
  const q = useWebsiteTeachers();
  const save = useSaveTeacher();
  const [filter, setFilter] = React.useState<'all' | 'shown' | 'teaching'>('all');
  const [search, setSearch] = React.useState('');
  const [editing, setEditing] = React.useState<WebsiteTeacherRow | null>(null);
  const rows = (q.data ?? []).filter((t) => (filter === 'shown' ? t.showOnWebsite : filter === 'teaching' ? t.type === 'TEACHING' : true)).filter((t) => !search || `${t.name} ${t.jobTitle} ${t.department ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const shown = q.data?.filter((t) => t.showOnWebsite).length ?? 0;

  const toggle = (t: WebsiteTeacherRow, showOnWebsite: boolean) =>
    save.mutate({ id: t.id, body: { showOnWebsite, websiteBio: t.websiteBio, photoUrl: t.photoUrl } }, { onSuccess: () => toast.success(showOnWebsite ? `${t.name} is on the Teachers page` : `${t.name} is hidden from the website`) });

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <>
      <Note>Choose who appears on the public Teachers page. Their subjects come from the timetable; add a short bio and a photo to make the page feel personal. Only name, role, department, subjects, bio and photo are shown.</Note>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          label="Filter staff"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All staff' },
            { value: 'teaching', label: 'Teaching' },
            { value: 'shown', label: 'On the website', count: shown },
          ]}
        />
        <SearchInput value={search} onChange={setSearch} placeholder="Search staff" className="sm:w-64" />
      </div>
      {!q.data ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title={q.data.length ? 'No staff match' : 'No staff yet'} description={q.data.length ? 'Try another filter or search.' : 'Add staff in Teachers & Staff, then choose who to show here.'} />
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {rows.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar name={t.name} initials={initialsFromName(t.name)} src={t.photoUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{t.name}</p>
                <p className="truncate text-[12.5px] text-muted-foreground">{[t.jobTitle, t.department].filter(Boolean).join(' · ')}</p>
                {t.showOnWebsite && !t.websiteBio && <p className="mt-0.5 text-[12px] text-warning">No bio yet</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditing(t)} aria-label={`Edit website profile for ${t.name}`}>
                <Pencil /> <span className="hidden sm:inline">Profile</span>
              </Button>
              <Switch checked={t.showOnWebsite} onCheckedChange={(v) => toggle(t, v)} aria-label={`Show ${t.name} on the website`} />
            </div>
          ))}
        </Card>
      )}
      <TeacherDialog teacher={editing} onOpenChange={(o) => !o && setEditing(null)} />
    </>
  );
}

function TeacherDialog({ teacher, onOpenChange }: { teacher: WebsiteTeacherRow | null; onOpenChange: (o: boolean) => void }) {
  const [v, setV] = React.useState({ showOnWebsite: true, websiteBio: '', photoUrl: null as string | null });
  const save = useSaveTeacher();
  React.useEffect(() => {
    if (teacher) setV({ showOnWebsite: teacher.showOnWebsite, websiteBio: teacher.websiteBio ?? '', photoUrl: teacher.photoUrl });
  }, [teacher]);
  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    if (!teacher) return;
    save.mutate(
      { id: teacher.id, body: { showOnWebsite: v.showOnWebsite, websiteBio: v.websiteBio.trim() || null, photoUrl: v.photoUrl } },
      {
        onSuccess: () => {
          toast.success('Profile saved');
          onOpenChange(false);
        },
      },
    );
  };
  return (
    <FormDialog open={!!teacher} onOpenChange={onOpenChange} title={teacher ? `${teacher.name}` : 'Profile'} description={teacher ? `${teacher.jobTitle}${teacher.department ? ` · ${teacher.department}` : ''}` : undefined} icon={<Users />} submitLabel="Save profile" pending={save.isPending} onSubmit={submit}>
      <div className="grid gap-5">
        <ImageUpload round label="Photo" value={v.photoUrl} onChange={(photoUrl) => setV((x) => ({ ...x, photoUrl }))} />
        <Field label="Short bio" htmlFor="t-bio" optional hint={`${v.websiteBio.length}/800 — a sentence or two families will enjoy reading.`}>
          <Textarea className="h-auto" id="t-bio" rows={4} maxLength={800} value={v.websiteBio} onChange={(e) => setV((x) => ({ ...x, websiteBio: e.target.value }))} />
        </Field>
        <SwitchRow label="Show on the website">
          <Switch checked={v.showOnWebsite} onCheckedChange={(showOnWebsite) => setV((x) => ({ ...x, showOnWebsite }))} />
        </SwitchRow>
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ events

export function WebsiteEventsTab() {
  const q = useWebsiteEvents();
  const toggle = useToggleEvent();
  const today = new Date().toISOString().slice(0, 10);
  const [filter, setFilter] = React.useState<'upcoming' | 'shown' | 'all'>('upcoming');
  const rows = (q.data ?? []).filter((e) => (filter === 'shown' ? e.showOnWebsite : filter === 'upcoming' ? (e.endDate ?? e.startDate) >= today : true));
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <>
      <Note>
        Events come from the school <span className="font-medium text-foreground">Calendar</span>. Switch on the ones families should see on the website. Staff-only events never appear here, and events for particular classes stay private to those classes.
      </Note>
      <div className="mb-4">
        <Segmented
          label="Filter events"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'shown', label: 'On the website', count: q.data?.filter((e) => e.showOnWebsite).length },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      {!q.data ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarDays} title="No events here" description="Add events in the Calendar (Communication → Calendar), then choose which to publish." />
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {rows.map((e) => {
            const locked = e.classSpecific;
            return (
              <div key={e.id} className={cn('flex items-center gap-3 px-4 py-3 sm:px-5', (e.endDate ?? e.startDate) < today && 'opacity-60')}>
                <div className="grid w-12 shrink-0 text-center">
                  <span className="text-[10.5px] font-semibold uppercase text-muted-foreground">{formatDate(e.startDate, { month: 'short', day: undefined, year: undefined })}</span>
                  <span className="font-display text-lg font-semibold leading-none tabular">{Number(e.startDate.slice(8, 10))}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{e.title}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted-foreground">
                    <span>{titleCase(e.category)}</span>
                    {e.time && <span>· {e.time}</span>}
                    {e.location && (
                      <span className="inline-flex items-center gap-1">
                        · <MapPin className="size-3" aria-hidden /> {e.location}
                      </span>
                    )}
                  </p>
                </div>
                {locked ? (
                  <Badge variant="outline" className="shrink-0">
                    <Lock /> Class event · private
                  </Badge>
                ) : (
                  <Switch checked={e.showOnWebsite} onCheckedChange={(showOnWebsite) => toggle.mutate({ id: e.id, showOnWebsite })} aria-label={`Show ${e.title} on the website`} />
                )}
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}
