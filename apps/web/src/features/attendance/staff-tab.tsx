import { type AttendanceSettings, STAFF_ATTENDANCE_STATUSES, type StaffAttendanceDay, type StaffAttendanceStatus } from '@aischool/shared';
import { Briefcase, MonitorSmartphone, QrCode, Save, Settings2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAttendanceSettings, useSaveAttendanceSettings, useSaveStaffAttendance, useStaffAttendance } from './api';
import { clockTime, DateStepper, longDate, plural, STAFF_STATUS_LABEL, STAFF_STATUS_SOFT } from './ui';

interface Edit {
  status: StaffAttendanceStatus | null;
  note: string;
}

type Row = StaffAttendanceDay['staff'][number];

export function StaffTab({ date, onDateChange }: { date: string | undefined; onDateChange: (d: string | undefined) => void }) {
  const q = useStaffAttendance(date);
  const d = q.data;
  const save = useSaveStaffAttendance();
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [search, setSearch] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // A new day (or a fresh save) starts clean.
  useEffect(() => setEdits({}), [d?.date]);

  const current = (s: Row): Edit => edits[s.id] ?? { status: s.status, note: s.note ?? '' };
  const isChanged = (s: Row) => {
    const e = edits[s.id];
    return !!e && (e.status !== s.status || (e.note.trim() || null) !== (s.note ?? null));
  };
  const changedRows = useMemo(() => (d?.staff ?? []).filter((s) => isChanged(s) && current(s).status), [d, edits]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (d?.staff ?? []).filter((s) => !t || s.name.toLowerCase().includes(t) || s.jobTitle.toLowerCase().includes(t));
  }, [d, search]);

  const summary = useMemo(() => {
    const c = { in: 0, late: 0, absent: 0, leave: 0, none: 0 };
    for (const s of d?.staff ?? []) {
      const st = current(s).status;
      if (st === 'PRESENT') c.in++;
      else if (st === 'LATE') c.late++;
      else if (st === 'ABSENT') c.absent++;
      else if (st === 'ON_LEAVE') c.leave++;
      else c.none++;
    }
    return c;
  }, [d, edits]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (s: Row, patch: Partial<Edit>) => setEdits((prev) => ({ ...prev, [s.id]: { ...current(s), ...patch } }));

  const submit = () => {
    if (!d || !changedRows.length) return;
    save.mutate(
      { date: d.date, marks: changedRows.map((s) => ({ staffId: s.id, status: current(s).status!, note: current(s).note.trim() || undefined })) },
      { onSuccess: () => setEdits({}) },
    );
  };

  const value = date ?? d?.date ?? todayIso();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DateStepper value={value} max={todayIso()} onChange={(v) => onDateChange(v === todayIso() ? undefined : v)} className="sm:w-[240px]" />
          <SearchInput value={search} onChange={setSearch} placeholder="Search staff…" className="sm:w-60" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setSettingsOpen(true)}>
            <Settings2 /> Settings
          </Button>
          <Button asChild>
            <Link to="/attendance/kiosk" target="_blank" rel="noopener">
              <QrCode /> Open check-in kiosk
            </Link>
          </Button>
        </div>
      </div>

      {q.error && !d ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : !d ? (
        <Card className="space-y-3 p-5" aria-busy>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </Card>
      ) : d.staff.length === 0 ? (
        <Card>
          <EmptyState icon={Briefcase} title="No staff yet" description="Add teachers and staff to track their attendance." />
        </Card>
      ) : (
        <Card className={cn('relative transition-opacity', q.isPlaceholderData && 'opacity-60')}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-5 py-3 text-[12.5px] text-muted-foreground">
            <span className="font-medium text-foreground">{longDate(d.date)}</span>
            <span>
              <span className="font-semibold text-success tabular">{summary.in}</span> present
            </span>
            <span>
              <span className="font-semibold text-warning tabular">{summary.late}</span> late
            </span>
            <span>
              <span className="font-semibold text-danger tabular">{summary.absent}</span> absent
            </span>
            <span>
              <span className="font-semibold text-info tabular">{summary.leave}</span> on leave
            </span>
            <span>
              <span className="font-semibold text-foreground tabular">{summary.none}</span> not marked
            </span>
            <span className="ml-auto text-[12px]">Late after {d.settings.staffLateAfter}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff member</TableHead>
                <TableHead className="w-[160px]">Status</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
                <TableHead className="hidden md:table-cell">Method</TableHead>
                <TableHead className="hidden min-w-[200px] lg:table-cell">Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const e = current(s);
                const changed = isChanged(s);
                return (
                  <TableRow key={s.id} className={cn(changed && 'bg-brand-soft/30')}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        {changed && <span className="size-1.5 rounded-full bg-brand" aria-label="Unsaved change" />}
                      </div>
                      <span className="text-[12px] text-muted-foreground">
                        {s.jobTitle}
                        {s.type === 'NON_TEACHING' && ' · support'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Select value={e.status ?? ''} onValueChange={(v) => update(s, { status: v as StaffAttendanceStatus })}>
                        <SelectTrigger aria-label={`Status for ${s.name}`} className={cn('h-9', e.status && STAFF_STATUS_SOFT[e.status], e.status && 'border-transparent font-medium')}>
                          <SelectValue placeholder="Not marked" />
                        </SelectTrigger>
                        <SelectContent>
                          {STAFF_ATTENDANCE_STATUSES.map((st) => (
                            <SelectItem key={st} value={st}>
                              {STAFF_STATUS_LABEL[st]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className={cn('tabular', s.status === 'LATE' && 'text-warning')}>{clockTime(s.checkInAt)}</TableCell>
                    <TableCell className="tabular text-muted-foreground">{clockTime(s.checkOutAt)}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {s.method ? (
                        <Badge variant={s.method === 'KIOSK' ? 'brand' : 'outline'} className="gap-1">
                          {s.method === 'KIOSK' && <MonitorSmartphone />}
                          {s.method === 'KIOSK' ? 'Kiosk' : 'Manual'}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <input
                        value={e.note}
                        maxLength={200}
                        onChange={(ev) => update(s, { note: ev.target.value })}
                        placeholder="Add a note"
                        aria-label={`Note for ${s.name}`}
                        className="h-9 w-full rounded-lg border border-transparent bg-transparent px-2 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-input focus-visible:border-ring focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-ring/15"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No staff match “{search}”.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-b-2xl border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
            <span className="text-[12.5px] text-muted-foreground">
              {changedRows.length ? `${plural(changedRows.length, 'unsaved change')}` : 'Kiosk check-ins appear here automatically.'}
            </span>
            <div className="flex items-center gap-2">
              {changedRows.length > 0 && (
                <Button variant="ghost" onClick={() => setEdits({})}>
                  <Undo2 /> Discard
                </Button>
              )}
              <Button onClick={submit} loading={save.isPending} disabled={!changedRows.length}>
                {!save.isPending && <Save />} Save changes
              </Button>
            </div>
          </div>
        </Card>
      )}

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

// ------------------------------------------------------------------ settings

function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const settings = useAttendanceSettings(open);
  const save = useSaveAttendanceSettings();
  const [form, setForm] = useState<AttendanceSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && settings.data) setForm(settings.data);
    if (!open) setError(null);
  }, [open, settings.data]);

  const submit = () => {
    if (!form) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.staffLateAfter)) return setError('Use a time like 07:45');
    if (!Number.isInteger(form.editWindowDays) || form.editWindowDays < 0 || form.editWindowDays > 60) return setError('Use 0–60 days');
    setError(null);
    save.mutate(form, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Attendance settings</DialogTitle>
          <DialogDescription>Applies to the whole school.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="contents"
        >
          <DialogBody className="space-y-4">
            {!form ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : (
              <>
                <Field label="Staff are late after" htmlFor="late-after" hint="Kiosk check-ins after this school time are marked late.">
                  <Input id="late-after" type="time" value={form.staffLateAfter} onChange={(e) => setForm({ ...form, staffLateAfter: e.target.value })} className="w-36" />
                </Field>
                <Field
                  label="Register edit window"
                  htmlFor="edit-window"
                  hint="How many days back class teachers may still correct a register. Administrators can always correct."
                  error={error ?? undefined}
                >
                  <div className="flex items-center gap-2">
                    <Input
                      id="edit-window"
                      type="number"
                      min={0}
                      max={60}
                      value={Number.isNaN(form.editWindowDays) ? '' : form.editWindowDays}
                      onChange={(e) => setForm({ ...form, editWindowDays: e.target.valueAsNumber })}
                      className="w-24"
                    />
                    <span className="text-[13px] text-muted-foreground">days</span>
                  </div>
                </Field>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!form}>
              Save settings
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
