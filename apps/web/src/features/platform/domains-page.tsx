import { domainSchema, type DomainRow } from '@aischool/shared';
import { CheckCircle2, Globe2, Info, MoreHorizontal, Plus, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable } from '@/components/ui/data-table';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CopyButton } from '../finance/ui';
import { apiFieldErrors, FormError, Segmented, zodErrors } from '../operations/ui';
import { type DomainVerifyResult, useAddDomain, useDomains, useRemoveDomain, useSchools, useVerifyDomain } from './api';
import { Muted, SchoolCell, Toolbar } from './ui';

export default function DomainsPage() {
  const q = useDomains();
  const verify = useVerifyDomain();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<DomainRow | null>(null);
  const [result, setResult] = useState<{ domain: DomainRow; r: DomainVerifyResult } | null>(null);
  const remove = useRemoveDomain();
  const target = q.data?.target ?? '';

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return q.data?.rows.filter((d) => !s || `${d.hostname} ${d.tenant.name}`.toLowerCase().includes(s));
  }, [q.data, search]);

  const runVerify = (d: DomainRow) =>
    verify.mutate(d.id, {
      onSuccess: (r) => {
        setResult({ domain: d, r });
        if (r.verified) toast.success(`${d.hostname} is verified`);
      },
    });

  const columns: Column<DomainRow>[] = [
    {
      key: 'host',
      header: 'Hostname',
      cell: (d) => (
        <div className="flex items-center gap-2">
          <a href={`https://${d.hostname}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[13px] font-medium hover:underline">
            {d.hostname}
          </a>
          {d.isPrimary && <Badge variant="brand">Primary</Badge>}
        </div>
      ),
    },
    { key: 'school', header: 'School', cell: (d) => <SchoolCell school={d.tenant} /> },
    { key: 'kind', header: 'Opens', cell: (d) => <Badge variant="outline">{d.kind === 'PORTAL' ? 'Portal' : 'Website'}</Badge> },
    {
      key: 'dns',
      header: 'DNS',
      cell: (d) =>
        d.verifiedAt ? (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-success">
            <CheckCircle2 className="size-3.5" /> Verified {formatDate(d.verifiedAt, { year: undefined })}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-warning">
            <XCircle className="size-3.5" /> Not verified
          </span>
        ),
    },
    { key: 'added', header: 'Added', cell: (d) => <Muted>{formatDate(d.createdAt)}</Muted> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-[150px] text-right',
      cell: (d) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="outline" loading={verify.isPending && verify.variables === d.id} onClick={() => runVerify(d)}>
            {!(verify.isPending && verify.variables === d.id) && <RefreshCw />} Verify
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`More for ${d.hostname}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setResult({ domain: d, r: { verified: !!d.verifiedAt, detail: d.verifiedAt ? 'Verified when last checked.' : 'Not checked yet, or DNS isn’t pointing here.', target } })}>
                <Info /> DNS instructions
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setRemoving(d)} className="text-danger focus:text-danger">
                <Trash2 /> Remove domain
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Domains"
        description="Custom hostnames for school portals and websites."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add domain
          </Button>
        }
      />
      {target && (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          Schools point their hostname at <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">{target}</code>
          <CopyButton text={target} label="platform host" />
        </p>
      )}
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search hostname or school…" className="sm:w-72" />
        </Toolbar>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(d) => d.id}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => void q.refetch()}
          renderMobile={(d) => (
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[13px] font-medium">{d.hostname}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {d.tenant.name} · {d.kind === 'PORTAL' ? 'Portal' : 'Website'}
                    {d.isPrimary ? ' · primary' : ''}
                  </p>
                </div>
                {d.verifiedAt ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">Not verified</Badge>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" loading={verify.isPending && verify.variables === d.id} onClick={() => runVerify(d)}>
                  Verify DNS
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRemoving(d)}>
                  Remove
                </Button>
              </div>
            </div>
          )}
          empty={{ icon: Globe2, title: search ? 'No domains match' : 'No custom domains yet', description: 'Schools use their AI School OS address until you connect one.' }}
        />
      </Card>
      <AddDomainDialog open={adding} onOpenChange={setAdding} target={target} onAdded={(hostname) => setResult({ domain: { hostname } as DomainRow, r: { verified: false, detail: 'Added. Ask the school to create this DNS record, then verify.', target } })} />
      <VerifyDialog result={result} onOpenChange={(o) => !o && setResult(null)} onAgain={(d) => runVerify(d)} again={verify.isPending} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.hostname}?`}
        description={`${removing?.tenant.name} stops opening on this hostname straight away. Their AI School OS address keeps working.`}
        confirmLabel="Remove domain"
        loading={remove.isPending}
        onConfirm={() =>
          removing &&
          remove.mutate(removing.id, {
            onSuccess: () => {
              toast.success(`${removing.hostname} removed`);
              setRemoving(null);
            },
          })
        }
      />
    </Page>
  );
}

function DnsRecord({ hostname, target }: { hostname: string; target: string }) {
  const parts = hostname.split('.');
  const name = parts.length > 2 ? parts.slice(0, -2).join('.') : '@';
  const rows: [string, string][] = [
    ['Type', 'CNAME'],
    ['Name / host', name],
    ['Value / target', target],
    ['TTL', 'Automatic (or 3600)'],
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center gap-3 border-b border-border px-3.5 py-2 text-[13px] last:border-0">
          <span className="w-28 shrink-0 text-muted-foreground">{k}</span>
          <code className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{v}</code>
          {(k === 'Name / host' || k === 'Value / target') && <CopyButton text={v} label={k} />}
        </div>
      ))}
      {name === '@' && (
        <p className="border-t border-border bg-muted/40 px-3.5 py-2 text-[12px] text-muted-foreground">
          Root domains can’t always use CNAME — use the DNS provider’s ALIAS/ANAME record, or an A record to the same address as {target}.
        </p>
      )}
    </div>
  );
}

function VerifyDialog({
  result,
  onOpenChange,
  onAgain,
  again,
}: {
  result: { domain: DomainRow; r: DomainVerifyResult } | null;
  onOpenChange: (o: boolean) => void;
  onAgain: (d: DomainRow) => void;
  again: boolean;
}) {
  const ok = result?.r.verified;
  return (
    <Dialog open={!!result} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <div className={cn('mb-2 grid size-10 place-items-center rounded-xl', ok ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
            {ok ? <CheckCircle2 className="size-5" /> : <Globe2 className="size-5" />}
          </div>
          <DialogTitle className="font-mono text-[16px]">{result?.domain.hostname}</DialogTitle>
          <DialogDescription>{ok ? 'DNS is pointing at AI School OS.' : 'DNS isn’t pointing at AI School OS yet.'}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className={cn('rounded-xl border px-3.5 py-2.5 text-[13px] [overflow-wrap:anywhere]', ok ? 'border-success/30 bg-success-soft/40' : 'border-border bg-muted/40')}>{result?.r.detail}</p>
          {result && !ok && (
            <div>
              <p className="mb-2 text-[13px] font-semibold">Ask the school to add this record at their DNS provider</p>
              <DnsRecord hostname={result.domain.hostname} target={result.r.target} />
              <p className="mt-2 text-[12px] text-muted-foreground">Changes usually show within an hour but can take up to a day.</p>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {result?.domain.id && !ok && (
            <Button loading={again} onClick={() => onAgain(result.domain)}>
              Check again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddDomainDialog({ open, onOpenChange, target, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; target: string; onAdded: (hostname: string) => void }) {
  const schools = useSchools();
  const add = useAddDomain();
  const [v, setV] = useState({ tenantId: '', hostname: '', kind: 'PORTAL' as 'PORTAL' | 'WEBSITE', isPrimary: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setV({ tenantId: '', hostname: '', kind: 'PORTAL', isPrimary: true });
      setErrors({});
    }
  }, [open]);
  const submit = (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault();
    const parsed = domainSchema.safeParse(v);
    if (!parsed.success) {
      const z = zodErrors(parsed.error.issues);
      return setErrors({ ...z, tenantId: z.tenantId ? 'Choose a school' : '' });
    }
    add.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(`${parsed.data.hostname} connected`);
        onOpenChange(false);
        onAdded(parsed.data.hostname);
      },
      onError: (err) => setErrors(apiFieldErrors(err)),
    });
  };
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Add a custom domain" description={target ? `The school points it at ${target}; then you verify DNS here.` : undefined} icon={<Globe2 />} submitLabel="Add domain" pending={add.isPending} onSubmit={submit}>
      <div className="grid gap-4">
        <Field label="School" htmlFor="dm-school" error={errors.tenantId || undefined}>
          <Select value={v.tenantId} onValueChange={(tenantId) => setV((p) => ({ ...p, tenantId }))}>
            <SelectTrigger id="dm-school" invalid={!!errors.tenantId}>
              <SelectValue placeholder="Choose a school" />
            </SelectTrigger>
            <SelectContent>
              {(schools.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Hostname" htmlFor="dm-host" error={errors.hostname} hint="Without https://, e.g. portal.greenfield.edu.ng">
          <Input id="dm-host" className="font-mono" autoCapitalize="none" spellCheck={false} value={v.hostname} onChange={(e) => setV((p) => ({ ...p, hostname: e.target.value.trim().toLowerCase() }))} invalid={!!errors.hostname} placeholder="portal.myschool.ng" />
        </Field>
        <Field label="Opens">
          <Segmented
            label="Opens"
            value={v.kind}
            onChange={(kind) => setV((p) => ({ ...p, kind }))}
            options={[
              { value: 'PORTAL', label: 'Sign-in portal' },
              { value: 'WEBSITE', label: 'Public website' },
            ]}
          />
        </Field>
        <SwitchRow label="Primary" description="The address used in emails and links for this kind">
          <Switch checked={v.isPrimary} onCheckedChange={(isPrimary) => setV((p) => ({ ...p, isPrimary }))} />
        </SwitchRow>
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}
