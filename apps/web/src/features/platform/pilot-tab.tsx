import {
  PILOT_STATUS_LABELS,
  SCHOOL_TYPE_LABELS,
  type PilotActionInput,
  type PilotCandidate,
  type PilotOverview,
  type PilotSchoolRow,
  type PilotSettings,
  type PilotStatus,
} from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarClock, Download, Gift, MoreHorizontal, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input, inputClass } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { usePlatformRole } from '@/lib/auth-store';
import { formatDate, formatNumber, formatRelative, toDateInput } from '@/lib/format';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { downloadCsv } from '../census/api';
import { naira } from './api';
import { Section } from './ui';

export const PILOT_KEY = ['platform', 'pilot'] as const;
const STATUS_BADGE: Record<PilotStatus, BadgeProps['variant']> = { ACTIVE: 'success', ENDED: 'warning', CONVERTED: 'brand', REMOVED: 'secondary' };
const HEALTH_TONE = (h: number | null) => (h == null ? 'text-muted-foreground' : h >= 70 ? 'text-success' : h >= 40 ? 'text-warning' : 'text-danger');

function refresh() {
  void queryClient.invalidateQueries({ queryKey: PILOT_KEY });
  void queryClient.invalidateQueries({ queryKey: ['platform', 'subscriptions'] });
}

/** The free pilot programme: places, pilot schools with end dates and health, actions, settings and the CSV for reporting. */
export function PilotTab() {
  const role = usePlatformRole();
  const canAct = role === 'SUPER_ADMIN' || role === 'SUPPORT_ADMIN' || role === 'FINANCE_ADMIN';
  const q = useQuery({ queryKey: PILOT_KEY, queryFn: ({ signal }) => api.get<PilotOverview>('/platform/pilot', undefined, signal) });
  const [showRemoved, setShowRemoved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dateFor, setDateFor] = useState<PilotSchoolRow | null>(null);
  const [confirm, setConfirm] = useState<{ row: PilotSchoolRow; action: 'END_NOW' | 'CONVERT' | 'REMOVE' } | null>(null);
  const act = useMutation({
    mutationFn: ({ tenantId, body }: { tenantId: string; body: PilotActionInput }) => api.post(`/platform/pilot/schools/${tenantId}`, body),
    onSuccess: (_r, v) => {
      toast.success(v.body.action === 'SET_END' ? 'Pilot end date saved' : v.body.action === 'END_NOW' ? 'Pilot ended' : v.body.action === 'CONVERT' ? 'Converted: the next term’s invoice is issued' : 'Removed from the pilot; the place is free');
      setConfirm(null);
      setDateFor(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const o = q.data;
  if (q.error && !o) {
    return (
      <Card>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Card>
    );
  }
  if (!o) return <Skeleton className="h-96 rounded-2xl" />;
  const rows = o.schools.filter((r) => showRemoved || r.pilotStatus !== 'REMOVED');
  const pct = o.settings.places ? Math.min(100, Math.round((o.used / o.settings.places) * 100)) : 100;

  const exportCsv = () => {
    const out: unknown[][] = [['School', 'Portal address', 'State', 'Type', 'Students (active)', 'Students (estimate)', 'Joined', 'Pilot started', 'Pilot ends', 'Pilot status', 'Health score', 'Last activity', 'Plan', 'Term price after pilot (NGN)']];
    for (const r of o.schools) {
      out.push([
        r.name,
        r.slug,
        r.state ?? '',
        r.schoolType ? SCHOOL_TYPE_LABELS[r.schoolType] : '',
        r.activeStudents,
        r.approxStudents ?? '',
        r.joinedAt.slice(0, 10),
        r.pilotStartedAt?.slice(0, 10) ?? '',
        r.pilotEndsAt ? toDateInput(r.pilotEndsAt) : '',
        PILOT_STATUS_LABELS[r.pilotStatus],
        r.health ?? '',
        r.lastActivityAt ? r.lastActivityAt.slice(0, 10) : '',
        r.plan ?? '',
        r.termPriceKobo != null ? (r.termPriceKobo / 100).toFixed(2) : '',
      ]);
    }
    downloadCsv(`pilot-schools-${new Date().toISOString().slice(0, 10)}.csv`, out);
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
            <Gift className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[18px] font-semibold tracking-tight">
              Pilot places: {o.used} of {o.settings.places} used
            </p>
            <p className="text-[13px] text-muted-foreground">
              {o.public.open ? `Applications open · ${o.placesLeft} ${o.placesLeft === 1 ? 'place' : 'places'} left` : o.settings.open ? (o.placesLeft === 0 ? 'Full: the offer is hidden on the public site' : 'Closed (sign-up email not available)') : 'Closed: the offer is hidden on the public site'}
              {o.pendingApplications ? ` · ${o.pendingApplications} application${o.pendingApplications === 1 ? '' : 's'} waiting in Sign-ups` : ''}
            </p>
            <div className="mt-2 h-2 max-w-md overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={o.used} aria-valuemin={0} aria-valuemax={o.settings.places} aria-label="Pilot places used">
              <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-warning' : 'bg-success')} style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!o.schools.length}>
              <Download /> CSV
            </Button>
            {canAct && (
              <Button size="sm" onClick={() => setAdding(true)} disabled={o.placesLeft <= 0}>
                <Plus /> Add a school
              </Button>
            )}
          </div>
        </div>
        <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-[12.5px] text-muted-foreground">
          Public line: <span className="font-medium text-foreground">{o.public.termsText}</span>. Shown on the brochure, deck and boards page while applications are open, with “Apply for the free pilot” linking to /pilot.
        </p>
      </Card>

      <Section
        title="Pilot schools"
        description="Free until each school’s pilot end date (the rest of the joining term plus the next full term). Then: reminders, the next term’s invoice, grace, read-only. Nothing is deleted."
        flush
        actions={
          <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <input type="checkbox" className="size-4" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} /> Show removed
          </label>
        }
      >
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">No pilot schools yet. Approve applications from the Sign-ups tab, or add an existing school.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>School</TableHead>
                  <TableHead>Pilot</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right">Health</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead className="text-right">Term after pilot</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.tenantId}>
                    <TableCell>
                      <Link to={`/platform/schools/${r.tenantId}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <p className="text-[12px] text-muted-foreground">
                        {[r.state, r.schoolType ? SCHOOL_TYPE_LABELS[r.schoolType] : null].filter(Boolean).join(' · ') || r.slug}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[r.pilotStatus]}>{PILOT_STATUS_LABELS[r.pilotStatus]}</Badge>
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                        {r.pilotEndsAt ? `${r.daysLeft != null ? 'Ends' : 'Ended'} ${formatDate(r.pilotEndsAt)}${r.daysLeft != null ? ` · ${r.daysLeft}d left` : ''}` : ''}
                        {r.pilotStatus !== 'ACTIVE' && r.billing.state !== 'OK' && r.billing.state !== 'PILOT' ? ` · ${r.billing.state === 'GRACE' ? 'grace' : r.billing.state === 'READ_ONLY' ? 'read-only' : 'trial'}` : ''}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {formatNumber(r.activeStudents)}
                      {r.approxStudents != null && <p className="text-[11.5px] text-muted-foreground">~{formatNumber(r.approxStudents)} est.</p>}
                    </TableCell>
                    <TableCell className={cn('text-right font-semibold tabular', HEALTH_TONE(r.health))}>{r.health ?? '—'}</TableCell>
                    <TableCell className="text-[12.5px] text-muted-foreground">{r.lastActivityAt ? formatRelative(r.lastActivityAt) : 'None yet'}</TableCell>
                    <TableCell className="text-right tabular">
                      {r.termPriceKobo != null ? naira(r.termPriceKobo) : '—'}
                      {r.plan && <p className="text-[11.5px] text-muted-foreground">{r.plan}</p>}
                    </TableCell>
                    <TableCell className="text-right">
                      {canAct && r.pilotStatus !== 'REMOVED' && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" aria-label={`Actions for ${r.name}`}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setDateFor(r)}>
                              <CalendarClock /> {r.pilotStatus === 'ENDED' ? 'Restart / extend pilot' : 'Extend or change end date'}
                            </DropdownMenuItem>
                            {(r.pilotStatus === 'ACTIVE' || r.pilotStatus === 'CONVERTED') && <DropdownMenuItem onSelect={() => setConfirm({ row: r, action: 'END_NOW' })}>End pilot now</DropdownMenuItem>}
                            {r.pilotStatus !== 'CONVERTED' && <DropdownMenuItem onSelect={() => setConfirm({ row: r, action: 'CONVERT' })}>Convert to paid</DropdownMenuItem>}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setConfirm({ row: r, action: 'REMOVE' })}>
                              Remove from pilot
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <PilotSettingsCard settings={o.settings} />

      <SetEndDialog row={dateFor} onClose={() => setDateFor(null)} pending={act.isPending} onSave={(endsOn) => dateFor && act.mutate({ tenantId: dateFor.tenantId, body: { action: 'SET_END', endsOn } })} />
      <AddDialog open={adding} onClose={() => setAdding(false)} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        destructive={confirm?.action !== 'CONVERT'}
        loading={act.isPending}
        title={confirm?.action === 'END_NOW' ? `End ${confirm.row.name}’s pilot now?` : confirm?.action === 'CONVERT' ? `Convert ${confirm?.row.name} to paid?` : `Remove ${confirm?.row.name ?? ''} from the pilot?`}
        confirmLabel={confirm?.action === 'END_NOW' ? 'End pilot' : confirm?.action === 'CONVERT' ? 'Convert and invoice' : 'Remove'}
        description={
          confirm?.action === 'END_NOW'
            ? 'Free use stops today. The school gets the “pilot ended” notice and its next term’s invoice, then the normal grace period and read-only mode if unpaid. The place stays used.'
            : confirm?.action === 'CONVERT'
              ? 'Issues the next term’s invoice now (starting when the pilot ends) on the school’s plan for its students. The pilot stays free until its end date; the place stays used.'
              : 'Frees the place. The school goes back to a normal trial (whatever is left of the usual trial from when it joined; otherwise the trial-ended grace period starts now). No data is deleted.'
        }
        onConfirm={() => confirm && act.mutate({ tenantId: confirm.row.tenantId, body: { action: confirm.action } as PilotActionInput })}
      />
    </div>
  );
}

function SetEndDialog({ row, onClose, onSave, pending }: { row: PilotSchoolRow | null; onClose: () => void; onSave: (endsOn: string) => void; pending: boolean }) {
  const [date, setDate] = useState('');
  useEffect(() => {
    if (row) setDate(row.pilotEndsAt ? toDateInput(row.pilotEndsAt) : '');
  }, [row]);
  return (
    <FormDialog
      open={!!row}
      onOpenChange={(v) => !v && onClose()}
      title={`Pilot end date for ${row?.name ?? ''}`}
      description="Free until the end of this day (Lagos time). Reminders go 14, 7, 3 and 1 days before."
      submitLabel="Save date"
      pending={pending}
      onSubmit={(e) => {
        e?.preventDefault();
        if (date) onSave(date);
      }}
    >
      <Field label="Pilot ends on" htmlFor="pilot-end">
        <Input id="pilot-end" type="date" value={date} min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

function AddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const q = useQuery({ queryKey: [...PILOT_KEY, 'candidates'], queryFn: ({ signal }) => api.get<PilotCandidate[]>('/platform/pilot/candidates', undefined, signal), enabled: open });
  const [tenantId, setTenantId] = useState('');
  const [date, setDate] = useState('');
  const pick = q.data?.find((c) => c.tenantId === tenantId);
  useEffect(() => {
    if (open) {
      setTenantId('');
      setDate('');
    }
  }, [open]);
  useEffect(() => setDate(pick?.proposedEndsOn ?? ''), [pick]);
  const add = useMutation({
    mutationFn: () => api.post('/platform/pilot/schools', { tenantId, ...(date && date !== pick?.proposedEndsOn ? { endsOn: date } : {}) }),
    onSuccess: () => {
      toast.success('Added to the pilot; the school’s admins have been told');
      refresh();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Add a school to the pilot"
      description="For schools you set up in the console (or that joined on a normal trial). Uses one place. Demo schools and schools that already pay are not listed."
      submitLabel="Add to pilot"
      pending={add.isPending}
      onSubmit={(e) => {
        e?.preventDefault();
        if (tenantId) add.mutate();
      }}
    >
      <div className="space-y-4">
        <Field label="School" htmlFor="pilot-school">
          {q.isLoading ? (
            <Skeleton className="h-10 rounded-lg" />
          ) : (
            <select id="pilot-school" className={inputClass} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">Choose a school…</option>
              {(q.data ?? []).map((c) => (
                <option key={c.tenantId} value={c.tenantId}>
                  {c.name} ({c.slug})
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Pilot ends on"
          htmlFor="pilot-add-end"
          hint={pick ? (pick.basis === 'SCHOOL_CALENDAR' ? 'Calculated from the school’s own term dates.' : 'Calculated from typical Nigerian term dates (the school has not set up its terms). Check with the school and adjust.') : undefined}
        >
          <Input id="pilot-add-end" type="date" value={date} disabled={!pick} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </FormDialog>
  );
}

function PilotSettingsCard({ settings }: { settings: PilotSettings }) {
  const canEdit = usePlatformRole() === 'SUPER_ADMIN';
  const [v, setV] = useState(settings);
  useEffect(() => setV(settings), [settings]);
  const save = useMutation({
    mutationFn: () => api.put<PilotSettings>('/platform/pilot/settings', v),
    onSuccess: () => {
      toast.success('Pilot settings saved');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const dirty = v.open !== settings.open || v.places !== settings.places;
  return (
    <Section title="Pilot settings" description="Applications come in through /pilot (or the box on /signup) and always wait for your review, even with auto-approve on.">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-end">
        <SwitchRow label="Accept pilot applications" description="Off, or when every place is used, the offer disappears from the brochure, deck and boards page and /pilot says it is full.">
          <Switch checked={v.open} disabled={!canEdit} onCheckedChange={(c) => setV({ ...v, open: c })} />
        </SwitchRow>
        <Field label="Pilot places" htmlFor="pilot-places">
          <Input id="pilot-places" type="number" min={0} max={1000} value={v.places} disabled={!canEdit} onChange={(e) => setV({ ...v, places: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) })} />
        </Field>
      </div>
      {canEdit && (
        <div className="mt-4 flex justify-end">
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
            Save pilot settings
          </Button>
        </div>
      )}
    </Section>
  );
}
