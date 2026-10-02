import { featureFlagSchema, type FeatureFlagRow } from '@aischool/shared';
import { Check, Flag, FlaskConical, Minus, MoreHorizontal, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useDebounced } from '@/lib/hooks';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { apiFieldErrors, FormError, zodErrors } from '../operations/ui';
import { useCreateFlag, useDeleteFlag, useFlagPreview, useFlags, useUpdateFlag } from './api';
import { Section } from './ui';

const bodyOf = (f: FeatureFlagRow) => ({ name: f.name, description: f.description, enabled: f.enabled, rolloutPercent: f.rolloutPercent });

export default function FlagsPage() {
  const q = useFlags();
  const update = useUpdateFlag();
  const del = useDeleteFlag();
  const [creating, setCreating] = useState(false);
  const [rollout, setRollout] = useState<FeatureFlagRow | null>(null);
  const [masterOff, setMasterOff] = useState<FeatureFlagRow | null>(null);
  const [deleting, setDeleting] = useState<FeatureFlagRow | null>(null);
  const modules = q.data?.filter((f) => f.kind === 'MODULE') ?? [];
  const betas = q.data?.filter((f) => f.kind === 'BETA') ?? [];

  const setEnabled = (f: FeatureFlagRow, enabled: boolean) => {
    if (!enabled) return setMasterOff(f);
    update.mutate({ key: f.key, body: { ...bodyOf(f), enabled: true } }, { onSuccess: () => toast.success(`${f.name} switched on`) });
  };

  const master = (f: FeatureFlagRow) => (
    <label className="flex shrink-0 items-center gap-2 text-[12.5px] font-medium">
      <Switch checked={f.enabled} onCheckedChange={(c) => setEnabled(f, c)} aria-label={`${f.name} master switch`} disabled={update.isPending && update.variables?.key === f.key} />
      <span className={f.enabled ? '' : 'text-danger'}>{f.enabled ? 'On' : 'Off everywhere'}</span>
    </label>
  );

  const overrides = (f: FeatureFlagRow) =>
    f.overrides.length > 0 && (
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11.5px] text-muted-foreground">Overrides:</span>
        {f.overrides.map((o) => (
          <Link
            key={o.tenantId}
            to={`/platform/schools/${o.tenantId}?tab=features`}
            title={o.note ?? undefined}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium transition-colors hover:bg-muted',
              o.enabled ? 'border-success/40 text-success' : 'border-danger/40 text-danger',
            )}
          >
            {o.enabled ? <Check className="size-3" /> : <Minus className="size-3" />} {o.tenantName}
          </Link>
        ))}
      </div>
    );

  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Feature flags"
        description="Master switches for modules, and beta features rolled out to a share of schools."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New beta flag
          </Button>
        }
      />
      {q.error && !q.data ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : !q.data ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <div className="space-y-5">
          <Section
            title={
              <>
                <FlaskConical className="size-4 text-muted-foreground" /> Beta flags
              </>
            }
            description="On for the rollout percentage of active and trial schools, plus any overrides"
            flush
          >
            {betas.length === 0 ? (
              <EmptyState compact icon={FlaskConical} title="No beta flags" description="Create one to trial a feature with a few schools." />
            ) : (
              <ul className="divide-y divide-border">
                {betas.map((f) => (
                  <li key={f.key} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                        {f.name} <span className="font-mono text-[11.5px] font-normal text-muted-foreground">{f.key}</span>
                      </p>
                      {f.description && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{f.description}</p>}
                      {overrides(f)}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-40">
                        <div className="flex items-baseline justify-between text-[12px]">
                          <span className="font-semibold tabular">{f.rolloutPercent}%</span>
                          <span className="text-muted-foreground tabular">on for {f.enabledFor}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <div className={cn('h-full rounded-full', f.enabled ? 'bg-chart-3' : 'bg-muted-foreground/30')} style={{ width: `${f.rolloutPercent}%` }} />
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setRollout(f)}>
                        <SlidersHorizontal /> Rollout
                      </Button>
                      {master(f)}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`More for ${f.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDeleting(f)} className="text-danger focus:text-danger">
                            <Trash2 /> Delete flag
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title={
              <>
                <Flag className="size-4 text-muted-foreground" /> Modules
              </>
            }
            description="Plans decide who gets each module. Switching one off here turns it off for every school."
            flush
          >
            <ul className="divide-y divide-border">
              {modules.map((f) => (
                <li key={f.key} className={cn('flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center', !f.enabled && 'bg-danger-soft/20')}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
                      {f.name} <span className="font-mono text-[11.5px] font-normal text-muted-foreground">{f.key}</span>
                    </p>
                    {f.description && <p className="mt-0.5 text-[12px] text-muted-foreground">{f.description}</p>}
                    {overrides(f)}
                  </div>
                  <span className="shrink-0 text-[12.5px] text-muted-foreground tabular">On for {f.enabledFor} {f.enabledFor === 1 ? 'school' : 'schools'}</span>
                  <span className="hidden shrink-0 text-[11.5px] text-muted-foreground lg:block">Updated {formatRelative(f.updatedAt)}</span>
                  {master(f)}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      <RolloutDialog flag={rollout} onOpenChange={(o) => !o && setRollout(null)} />
      <CreateFlagDialog open={creating} onOpenChange={setCreating} />
      <ConfirmDialog
        open={!!masterOff}
        onOpenChange={(o) => !o && setMasterOff(null)}
        title={`Switch ${masterOff?.name} off for every school?`}
        description={`It disappears for all ${masterOff?.enabledFor ?? 0} schools that have it now, whatever their plan or overrides say. You can switch it back on at any time.`}
        confirmLabel="Switch off everywhere"
        loading={update.isPending}
        onConfirm={() =>
          masterOff &&
          update.mutate(
            { key: masterOff.key, body: { ...bodyOf(masterOff), enabled: false } },
            {
              onSuccess: () => {
                toast.success(`${masterOff.name} switched off everywhere`);
                setMasterOff(null);
              },
            },
          )
        }
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.key}?`}
        description="The flag and its per-school overrides are removed. Code that checks it will see it as off."
        confirmLabel="Delete flag"
        loading={del.isPending}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.key, {
            onSuccess: () => {
              toast.success(`${deleting.key} deleted`);
              setDeleting(null);
            },
          })
        }
      />
    </Page>
  );
}

function RolloutDialog({ flag, onOpenChange }: { flag: FeatureFlagRow | null; onOpenChange: (o: boolean) => void }) {
  const update = useUpdateFlag();
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (flag) setPct(flag.rolloutPercent);
  }, [flag]);
  const debounced = useDebounced(pct, 200);
  const preview = useFlagPreview(flag?.key ?? null, debounced);
  const included = preview.data?.filter((s) => s.included) ?? [];
  const excluded = preview.data?.filter((s) => !s.included) ?? [];
  const overrides = new Map(flag?.overrides.map((o) => [o.tenantId, o.enabled]) ?? []);

  return (
    <Dialog open={!!flag} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Roll out {flag?.name}</DialogTitle>
          <DialogDescription>Each school lands in a fixed bucket, so raising the percentage only ever adds schools. Overrides still win.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <label htmlFor="rollout" className="text-[13px] font-medium">
                Rollout
              </label>
              <span className="font-display text-[24px] font-semibold tabular">{pct}%</span>
            </div>
            <input
              id="rollout"
              type="range"
              min={0}
              max={100}
              step={5}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              className="w-full accent-[var(--brand)]"
            />
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
            {!flag?.enabled && <p className="mt-2 text-[12.5px] text-danger">The master switch is off, so nobody gets this until you switch it on.</p>}
          </div>
          <div className={cn('grid gap-4 sm:grid-cols-2 transition-opacity', preview.isPlaceholderData && 'opacity-60')}>
            <PreviewList title="Included" tone="text-success" rows={included} overrides={overrides} loading={!preview.data} />
            <PreviewList title="Not yet" tone="text-muted-foreground" rows={excluded} overrides={overrides} loading={!preview.data} />
          </div>
          <p className="text-[12px] text-muted-foreground">Preview covers active and trial schools.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={update.isPending}
            disabled={!flag || pct === flag.rolloutPercent}
            onClick={() =>
              flag &&
              update.mutate(
                { key: flag.key, body: { ...bodyOf(flag), rolloutPercent: pct } },
                {
                  onSuccess: () => {
                    toast.success(`${flag.name} rolled out to ${pct}%`);
                    onOpenChange(false);
                  },
                },
              )
            }
          >
            Save rollout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewList({ title, tone, rows, overrides, loading }: { title: string; tone: string; rows: { id: string; name: string }[]; overrides: Map<string, boolean>; loading: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-border">
      <p className={cn('flex items-center justify-between border-b border-border px-3 py-2 text-[12.5px] font-semibold', tone)}>
        {title} <span className="tabular">{loading ? '…' : rows.length}</span>
      </p>
      <ul className="scrollbar-thin max-h-56 overflow-y-auto p-1.5 text-[13px]">
        {loading ? (
          <li className="p-2">
            <Skeleton className="h-4 w-2/3" />
          </li>
        ) : rows.length === 0 ? (
          <li className="px-2 py-3 text-center text-[12px] text-muted-foreground">None</li>
        ) : (
          rows.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-md px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {overrides.has(s.id) && <Badge variant={overrides.get(s.id) ? 'success' : 'danger'}>Forced {overrides.get(s.id) ? 'on' : 'off'}</Badge>}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function CreateFlagDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateFlag();
  const [v, setV] = useState({ key: '', name: '', description: '', enabled: true, rolloutPercent: 0 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setV({ key: '', name: '', description: '', enabled: true, rolloutPercent: 0 });
      setErrors({});
    }
  }, [open]);
  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = featureFlagSchema.safeParse(v);
    if (!parsed.success) return setErrors(zodErrors(parsed.error.issues));
    create.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(`${parsed.data.key} created`);
        onOpenChange(false);
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="New beta flag" description="Starts at 0% — roll it out once it’s ready, or force it on for a pilot school." icon={<FlaskConical />} submitLabel="Create flag" pending={create.isPending} onSubmit={submit}>
      <div className="grid gap-4">
        <Field label="Name" htmlFor="fl-name" error={errors.name}>
          <Input
            id="fl-name"
            value={v.name}
            onChange={(e) => {
              const name = e.target.value;
              setV((p) => ({ ...p, name, key: p.key && p.key !== autoKey(p.name) ? p.key : autoKey(name) }));
            }}
            placeholder="New report card designer"
            invalid={!!errors.name}
          />
        </Field>
        <Field label="Key" htmlFor="fl-key" error={errors.key} hint="What the code checks. Lowercase letters, numbers and underscores.">
          <Input id="fl-key" className="font-mono" value={v.key} onChange={(e) => setV((p) => ({ ...p, key: e.target.value }))} invalid={!!errors.key} />
        </Field>
        <Field label="Description" htmlFor="fl-desc" optional error={errors.description}>
          <Textarea id="fl-desc" rows={2} value={v.description} onChange={(e) => setV((p) => ({ ...p, description: e.target.value }))} maxLength={300} />
        </Field>
        <SwitchRow label="Master switch" description="Off keeps it off everywhere, even for overrides">
          <Switch checked={v.enabled} onCheckedChange={(enabled) => setV((p) => ({ ...p, enabled }))} />
        </SwitchRow>
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}

function autoKey(name: string) {
  const k = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return /^[a-z]/.test(k) ? k : k ? `f_${k}` : '';
}
