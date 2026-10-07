import { HEALTH_BAND_LABELS, SUCCESS_RISK_LABELS, type PlatformSuccessRow } from '@aischool/shared';
import { AlertTriangle, Building2, CheckCircle2, HeartPulse } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { type Column, DataTable } from '@/components/ui/data-table';
import { Switch } from '@/components/ui/switch';
import { formatNumber, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Kpi, Muted, SchoolCell, TenantStatusBadge } from '../platform/ui';
import { usePlatformSuccess } from './api';
import { HealthFormula, TrendArrow } from './ui';
import type { TenantStatusKey } from '@aischool/shared';

const SHORT: Record<PlatformSuccessRow['risks'][number], string> = {
  NO_STAFF_LOGINS: 'No staff sign-ins (7d)',
  NO_HOMEWORK_TESTS: 'No homework or tests (14d)',
  PARENTS_INACTIVE: 'Parents inactive',
  LOW_HEALTH: 'Health under 40',
};

const pctText = (v: number | null) => (v == null ? '—' : `${Math.round(v)}%`);

function Risks({ row }: { row: PlatformSuccessRow }) {
  if (!row.risks.length)
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-success">
        <CheckCircle2 className="size-3.5" aria-hidden /> On track
      </span>
    );
  return (
    <ul className="space-y-0.5 text-[12px]" aria-label={`${row.risks.length} risk flags`}>
      {row.risks.map((r) => (
        <li key={r} className="flex items-start gap-1 whitespace-nowrap" title={SUCCESS_RISK_LABELS[r]}>
          <AlertTriangle className={cn('mt-0.5 size-3 shrink-0', r === 'LOW_HEALTH' ? 'text-danger' : 'text-warning')} aria-hidden />
          <span>{SHORT[r]}</span>
        </li>
      ))}
    </ul>
  );
}

/** Platform console: every live school's health, adoption and risk flags side by side, at-risk first. */
export default function PilotSchoolsPage() {
  const navigate = useNavigate();
  const q = usePlatformSuccess();
  const [riskOnly, setRiskOnly] = useState(false);
  const rows = useMemo(() => q.data?.schools.filter((s) => !riskOnly || s.risks.length > 0), [q.data, riskOnly]);

  const columns: Column<PlatformSuccessRow>[] = [
    { key: 'school', header: 'School', cell: (r) => <SchoolCell school={r} link={false} sub={`${formatNumber(r.students)} students`} /> },
    {
      key: 'health',
      header: 'Health',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span className="w-7 font-display text-[15px] font-semibold tabular" title={HEALTH_BAND_LABELS[r.band]}>{r.health}</span>
          <TrendArrow now={r.health} before={r.previous} />
        </div>
      ),
    },
    {
      key: 'active',
      header: 'Active staff · parents · students',
      cell: (r) => <span className="whitespace-nowrap tabular">{`${pctText(r.staffActivePct)} · ${pctText(r.parentsActivePct)} · ${pctText(r.studentsActivePct)}`}</span>,
    },
    { key: 'work', header: 'Hwk · tests 14d', cell: (r) => <span className="tabular">{`${formatNumber(r.homework14d)} · ${formatNumber(r.tests14d)}`}</span>, className: 'text-right', headClassName: 'text-right' },
    { key: 'last', header: 'Last activity', cell: (r) => (r.lastActivityAt ? <span title={new Date(r.lastActivityAt).toLocaleString()}>{formatRelative(r.lastActivityAt)}</span> : <Muted>Never</Muted>) },
    { key: 'risks', header: 'Risk', cell: (r) => <Risks row={r} />, className: 'min-w-[190px]' },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Pilot schools"
        description="Every live school's health score, adoption and risk flags, at-risk schools first. Use it to spot pilots that need a call before renewal."
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Schools" icon={Building2} value={formatNumber(q.data?.schools.length ?? 0)} sub="on trial or active" loading={!q.data} />
        <Kpi label="Average health" icon={HeartPulse} value={q.data?.averageHealth ?? '—'} sub="out of 100" loading={!q.data} />
        <Kpi label="At risk" icon={AlertTriangle} tone={q.data?.atRisk ? 'warning' : undefined} value={formatNumber(q.data?.atRisk ?? 0)} sub="schools with at least one flag" loading={!q.data} />
        <Kpi
          label="Strong"
          icon={CheckCircle2}
          tone="success"
          value={formatNumber(q.data?.schools.filter((s) => s.band === 'STRONG').length ?? 0)}
          sub="health 65 or more"
          loading={!q.data}
        />
      </div>
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <p className="text-[13px] text-muted-foreground">{q.data ? `Updated ${formatRelative(q.data.generatedAt)} · refreshes every 10 minutes` : ' '}</p>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Switch checked={riskOnly} onCheckedChange={setRiskOnly} aria-label="Only schools at risk" />
            Only at risk
          </label>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => void q.refetch()}
          onRowClick={(r) => navigate(`/platform/schools/${r.id}`)}
          rowLabel={(r) => `Open ${r.name}`}
          empty={{ icon: Building2, title: riskOnly ? 'No schools at risk' : 'No live schools yet' }}
          renderMobile={(r) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {formatNumber(r.students)} students · {r.lastActivityAt ? `active ${formatRelative(r.lastActivityAt)}` : 'never active'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="font-display text-[17px] font-semibold tabular">{r.health}</span>
                  <TrendArrow now={r.health} before={r.previous} />
                </div>
              </div>
              <p className="text-[12px] text-muted-foreground">
                Staff {pctText(r.staffActivePct)} · Parents {pctText(r.parentsActivePct)} · Students {pctText(r.studentsActivePct)}
              </p>
              <TenantStatusBadge status={r.status as TenantStatusKey} />
              <Risks row={r} />
            </div>
          )}
        />
      </Card>
      <details className="mt-4 rounded-2xl border border-border bg-card px-4 py-3">
        <summary className="cursor-pointer text-[13px] font-medium">How health and the risk flags are worked out</summary>
        <div className="mt-3 space-y-3">
          <HealthFormula />
          <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] text-muted-foreground">
            {Object.values(SUCCESS_RISK_LABELS).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="text-[12.5px] text-muted-foreground">The arrow compares today's score with the score a week ago (a change of 3 or more).</p>
        </div>
      </details>
    </Page>
  );
}
