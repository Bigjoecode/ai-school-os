import type { ResultCodeRow } from '@aischool/shared';
import { KeyRound, LayoutList, Printer, RotateCcw, Scissors, Ticket } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { type Column, DataTable } from '@/components/ui/data-table';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCan, useMe } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { armOptions, useStructure } from '../academics/api';
import { Segmented } from '../operations/ui';
import { useIssueCodes, useResetCode, useResultCodes, useWebsiteOverview } from './api';

export default function WebsiteCodesTab() {
  const canAcademics = useCan('academics.read');
  const canResults = useCan('results.read');
  const structure = useStructure();
  const overview = useWebsiteOverview();
  const me = useMe();
  const arms = armOptions(structure.data);
  const terms = React.useMemo(() => (structure.data?.sessions ?? []).flatMap((s) => s.terms.map((t) => ({ ...t, session: s.name, sessionCurrent: s.isCurrent }))), [structure.data]);
  const [armId, setArmId] = React.useState('');
  const [termId, setTermId] = React.useState('');
  const [maxUses, setMaxUses] = React.useState(5);
  const [view, setView] = React.useState<'table' | 'slips'>('table');
  const [resetting, setResetting] = React.useState<ResultCodeRow | null>(null);

  React.useEffect(() => {
    if (!termId && terms.length) setTermId((terms.find((t) => t.isCurrent) ?? terms[terms.length - 1]).id);
  }, [terms, termId]);
  React.useEffect(() => {
    if (!armId && arms.length) setArmId(arms[0].id);
  }, [arms, armId]);

  const q = useResultCodes(armId, termId);
  const issue = useIssueCodes();
  const reset = useResetCode();
  const arm = arms.find((a) => a.id === armId);
  const term = terms.find((t) => t.id === termId);
  const rows = q.data ?? [];
  const withCodes = rows.filter((r) => r.code);
  const missing = rows.length - withCodes.length;

  const o = overview.data;
  const websiteHost = o?.domains.find((d) => d.kind === 'WEBSITE')?.hostname;
  const resultsUrl = websiteHost ? `https://${websiteHost}/results` : o ? `${window.location.origin}${o.publicUrl}/results` : '';
  const resultsOff = o && o.settings.sections.results === false;

  if (!canAcademics) {
    return (
      <Card>
        <EmptyState icon={KeyRound} title="Classes aren’t available to you" description="Picking a class needs access to Academic Setup. Ask an admin to add it to your role." />
      </Card>
    );
  }
  if (structure.error && !structure.data) return <ErrorState error={structure.error} onRetry={() => void structure.refetch()} />;

  const columns: Column<ResultCodeRow>[] = [
    { key: 'name', header: 'Student', cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'adm', header: 'Admission no.', cell: (r) => <span className="font-mono text-[12.5px] text-muted-foreground">{r.admissionNumber}</span> },
    { key: 'code', header: 'Code', cell: (r) => (r.code ? <span className="rounded-md bg-muted px-2 py-1 font-mono text-[13px] font-semibold tracking-[0.12em]">{r.code}</span> : <span className="text-[12.5px] text-muted-foreground">Not issued</span>) },
    {
      key: 'uses',
      header: 'Used',
      cell: (r) =>
        r.code ? (
          <Badge variant={r.uses >= r.maxUses ? 'danger' : r.uses > 0 ? 'info' : 'secondary'} className="tabular">
            {r.uses}/{r.maxUses}
          </Badge>
        ) : null,
    },
    {
      key: 'reset',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (r) =>
        r.code ? (
          <Button variant="ghost" size="sm" onClick={() => setResetting(r)}>
            <RotateCcw /> New code
          </Button>
        ) : null,
    },
  ];

  const issueButton = (
    <Button onClick={() => issue.mutate({ classArmId: armId, termId, maxUses })} loading={issue.isPending} disabled={!armId || !termId || !canResults}>
      <Ticket /> {!withCodes.length ? 'Issue codes' : missing ? `Issue ${missing} missing ${missing === 1 ? 'code' : 'codes'}` : 'Check for new students'}
    </Button>
  );

  return (
    <>
      <div className="print:hidden">
        <Card className="mb-5 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_140px_auto] lg:items-end [&>*]:min-w-0">
            <Field label="Class" htmlFor="rc-arm">
              <Select value={armId} onValueChange={setArmId}>
                <SelectTrigger id="rc-arm">
                  <SelectValue placeholder={structure.isLoading ? 'Loading…' : 'Choose a class'} />
                </SelectTrigger>
                <SelectContent>
                  {arms.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Term" htmlFor="rc-term">
              <Select value={termId} onValueChange={setTermId}>
                <SelectTrigger id="rc-term">
                  <SelectValue placeholder="Choose a term" />
                </SelectTrigger>
                <SelectContent>
                  {(structure.data?.sessions ?? []).map((s) => (
                    <SelectGroup key={s.id}>
                      <SelectLabel>{s.name}</SelectLabel>
                      {s.terms.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                          {t.isCurrent ? ' (current)' : ''}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Uses per code" htmlFor="rc-max">
              <Input id="rc-max" type="number" min={1} max={50} value={maxUses} onChange={(e) => setMaxUses(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="tabular" />
            </Field>
            {canResults ? (
              issueButton
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>{issueButton}</span>
                </TooltipTrigger>
                <TooltipContent>Issuing codes also needs permission to read results</TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            Each student gets a personal code for the term. Parents enter it with the admission number on the website’s Results page — only published report cards are shown. Existing codes are kept; “New code” replaces a lost one.
            {resultsOff && <span className="font-medium text-warning"> The Results page is switched off in Pages → Pages on/off.</span>}
          </p>
        </Card>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'table', label: <><LayoutList /> Codes</> },
              { value: 'slips', label: <><Scissors /> Slips</> },
            ]}
          />
          <div className="flex items-center gap-3">
            {rows.length > 0 && (
              <span className="text-[12.5px] text-muted-foreground tabular">
                {withCodes.length} of {rows.length} have codes
              </span>
            )}
            <Button variant="outline" onClick={() => window.print()} disabled={!withCodes.length}>
              <Printer /> Print slips
            </Button>
          </div>
        </div>

        {view === 'table' ? (
          <Card className="overflow-hidden">
            <DataTable
              columns={columns}
              rows={armId && termId ? q.data : []}
              rowKey={(r) => r.studentId}
              loading={q.isLoading}
              error={q.error}
              onRetry={() => void q.refetch()}
              renderMobile={(r) => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="font-mono text-[12px] text-muted-foreground">{r.admissionNumber}</p>
                  </div>
                  {r.code ? (
                    <button type="button" onClick={() => setResetting(r)} className="shrink-0 text-right">
                      <span className="block font-mono text-[13px] font-semibold tracking-[0.1em]">{r.code}</span>
                      <span className="text-[11.5px] text-muted-foreground tabular">
                        used {r.uses}/{r.maxUses}
                      </span>
                    </button>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">Not issued</span>
                  )}
                </div>
              )}
              empty={{ icon: KeyRound, title: arm ? `No active students in ${arm.label}` : 'Choose a class and term', description: arm ? 'Codes are issued to active students in the class.' : undefined }}
            />
          </Card>
        ) : withCodes.length === 0 ? (
          <Card>
            <EmptyState icon={Scissors} title="No codes to print yet" description="Issue codes for this class and term first." />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {withCodes.map((r) => (
              <Slip key={r.studentId} row={r} school={me?.tenant?.name ?? ''} term={term ? `${term.name}, ${term.session}` : ''} cls={arm?.label ?? ''} url={resultsUrl} />
            ))}
          </div>
        )}
      </div>

      {/* Printed: two slips across, cut along the dashed lines. */}
      <div className="hidden print:block" aria-hidden>
        <div className="grid grid-cols-2 gap-0">
          {withCodes.map((r) => (
            <Slip key={r.studentId} row={r} school={me?.tenant?.name ?? ''} term={term ? `${term.name}, ${term.session}` : ''} cls={arm?.label ?? ''} url={resultsUrl} print />
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!resetting}
        onOpenChange={(o) => !o && setResetting(null)}
        title={`Issue a new code for ${resetting?.name ?? ''}?`}
        description="The old code stops working straight away and the use count starts again. Print a new slip for the family."
        confirmLabel="Issue new code"
        destructive={false}
        loading={reset.isPending}
        onConfirm={() => resetting && reset.mutate({ studentId: resetting.studentId, termId, classArmId: armId }, { onSuccess: () => setResetting(null) })}
      />
    </>
  );
}

function Slip({ row, school, term, cls, url, print }: { row: ResultCodeRow; school: string; term: string; cls: string; url: string; print?: boolean }) {
  return (
    <div className={cn('print-avoid-break', print ? 'border border-dashed border-[#9aa3b5] p-4' : 'rounded-xl border border-dashed border-border-strong bg-card p-4')}>
      <div className="flex items-start justify-between gap-3 border-b border-border pb-2.5">
        <div className="min-w-0">
          <p className="truncate font-display text-[13.5px] font-semibold">{school}</p>
          <p className="text-[11.5px] text-muted-foreground">Result checker · {term}</p>
        </div>
        <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
        <dt className="text-muted-foreground">Student</dt>
        <dd className="truncate font-medium">{row.name}</dd>
        <dt className="text-muted-foreground">Class</dt>
        <dd className="truncate">{cls}</dd>
        <dt className="text-muted-foreground">Admission no.</dt>
        <dd className="font-mono">{row.admissionNumber}</dd>
      </dl>
      <div className="mt-3 rounded-lg bg-muted px-3 py-2 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Access code</p>
        <p className="font-mono text-[19px] font-bold tracking-[0.22em]">{row.code}</p>
      </div>
      <p className="mt-2.5 text-[11px] leading-snug text-muted-foreground">
        Check results at <span className="break-all font-medium text-foreground">{url}</span> · valid for {row.maxUses} checks
      </p>
    </div>
  );
}
