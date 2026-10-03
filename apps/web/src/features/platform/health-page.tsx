import type { HealthCheck, SystemHealth } from '@aischool/shared';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, Cpu, Database, HardDrive, Layers, Mail, RotateCw, Server, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useHealth } from './api';
import { Facts, Section } from './ui';

const TONE = {
  ok: { icon: CheckCircle2, text: 'text-success', bg: 'bg-success-soft', label: 'All systems normal' },
  warn: { icon: CircleAlert, text: 'text-warning', bg: 'bg-warning-soft', label: 'Needs attention' },
  fail: { icon: XCircle, text: 'text-danger', bg: 'bg-danger-soft', label: 'Something is down' },
} as const;

function uptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export default function HealthPage() {
  const q = useHealth();
  const h = q.data;
  const isOwner = useAuthStore((st) => st.me?.user.platformRole === 'SUPER_ADMIN');
  const testAlert = useMutation({
    mutationFn: () => api.post<{ sent: boolean; to: string }>('/platform/alerts/test'),
    onSuccess: (r) => toast.success('Test alert sent', { description: `Check ${r.to} (and the spam folder).` }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="System health"
        description="Live checks on the API, database, AI providers and background work. Refreshes every 30 seconds."
        actions={
          <div className="flex flex-wrap gap-2">
            {isOwner && (
              <Button variant="outline" size="sm" onClick={() => testAlert.mutate()} loading={testAlert.isPending}>
                {!testAlert.isPending && <Mail />} Send test alert
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void q.refetch()} loading={q.isFetching}>
              {!q.isFetching && <RotateCw />} Check now
            </Button>
          </div>
        }
      />
      {q.error && !h ? (
        <Card className="flex flex-col gap-4 border-danger/30 p-5 sm:flex-row sm:items-center sm:p-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-danger-soft text-danger">
            <XCircle className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[19px] font-semibold tracking-tight">Health checks couldn’t run</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              The API answered with an error: {errorMessage(q.error)} This usually means the database is unreachable. Retrying every 30 seconds.
            </p>
          </div>
          <Button variant="outline" onClick={() => void q.refetch()} loading={q.isFetching}>
            Try again
          </Button>
        </Card>
      ) : !h ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <HealthView h={h} stale={!!q.error} />
      )}
    </Page>
  );
}

function HealthView({ h, stale }: { h: SystemHealth; stale: boolean }) {
  const t = TONE[h.status];
  const counts = { ok: 0, warn: 0, fail: 0 };
  for (const c of h.checks) counts[c.status]++;
  return (
    <div className="space-y-5">
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-2xl', t.bg, t.text)}>
          <t.icon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[19px] font-semibold tracking-tight">{t.label}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {counts.ok} passing · {counts.warn} warning · {counts.fail} failing · checked {formatRelative(h.checkedAt)}
            {stale && <span className="text-danger"> · last refresh failed</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted-foreground">
          <span>
            Version <span className="font-mono text-foreground">{h.version}</span>
          </span>
          <span>
            Node <span className="font-mono text-foreground">{h.node}</span>
          </span>
          <span>
            Env <span className="font-mono text-foreground">{h.environment}</span>
          </span>
          <span>
            Up <span className="text-foreground tabular">{uptime(h.uptimeSeconds)}</span>
          </span>
        </div>
      </Card>

      <Section title="Checks" flush>
        <ul className="divide-y divide-border">
          {[...h.checks]
            .sort((a, b) => rank(a) - rank(b))
            .map((c) => {
              const ct = TONE[c.status];
              return (
                <li key={c.key} className="flex items-start gap-3 px-5 py-3">
                  <ct.icon className={cn('mt-0.5 size-4 shrink-0', ct.text)} aria-label={c.status} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium">{c.label}</p>
                    <p className="text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]">{c.detail}</p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide', ct.bg, ct.text)}>{c.status}</span>
                </li>
              );
            })}
        </ul>
      </Section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <Section
          title={
            <>
              <Database className="size-4 text-muted-foreground" /> Database
            </>
          }
        >
          <Facts
            rows={[
              ['Latency', `${h.db.latencyMs} ms`],
              ['Size', h.db.sizeMb == null ? '—' : `${formatNumber(h.db.sizeMb)} MB`],
              ['Migrations', formatNumber(h.db.migrations)],
              ['Latest', <span key="m" className="font-mono text-[11.5px]">{h.db.lastMigration ?? '—'}</span>],
            ]}
          />
        </Section>
        <Section
          title={
            <>
              <Cpu className="size-4 text-muted-foreground" /> Memory
            </>
          }
        >
          <Facts
            rows={[
              ['Resident', `${h.memory.rssMb} MB`],
              ['Heap used', `${h.memory.heapUsedMb} MB`],
              ['Heap total', `${h.memory.heapTotalMb} MB`],
            ]}
          />
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.min(100, (h.memory.heapUsedMb / Math.max(1, h.memory.heapTotalMb)) * 100)}%` }} />
          </div>
        </Section>
        <Section
          title={
            <>
              <Layers className="size-4 text-muted-foreground" /> Queues
            </>
          }
        >
          <Facts
            rows={[
              ['AI jobs waiting', formatNumber(h.queues.aiJobsPending)],
              ['AI jobs failed 24h', <span key="a" className={h.queues.aiJobsFailed24h ? 'text-danger' : ''}>{formatNumber(h.queues.aiJobsFailed24h)}</span>],
              ['Messages queued', formatNumber(h.queues.deliveriesQueued)],
              ['Messages failed 24h', <span key="d" className={h.queues.deliveriesFailed24h ? 'text-danger' : ''}>{formatNumber(h.queues.deliveriesFailed24h)}</span>],
              ['Scheduled broadcasts', formatNumber(h.queues.scheduledBroadcasts)],
              ['Last automation', h.queues.lastAutomationRunAt ? formatRelative(h.queues.lastAutomationRunAt) : 'Never'],
            ]}
          />
        </Section>
        <div className="space-y-5">
          <Section
            title={
              <>
                <Server className="size-4 text-muted-foreground" /> Errors (24h)
              </>
            }
          >
            <Facts
              rows={[
                ['Requests', formatNumber(h.errors.requests24h)],
                ['Server errors', <span key="s" className={h.errors.serverErrors24h ? 'text-danger' : ''}>{formatNumber(h.errors.serverErrors24h)}</span>],
                ['AI failures', <span key="a" className={h.errors.aiFailures24h ? 'text-warning' : ''}>{formatNumber(h.errors.aiFailures24h)}</span>],
              ]}
            />
          </Section>
          <Section
            title={
              <>
                <HardDrive className="size-4 text-muted-foreground" /> Uploads
              </>
            }
          >
            <Facts
              rows={[
                ['Files', formatNumber(h.uploads.files)],
                ['Stored', `${formatNumber(h.uploads.sizeMb)} MB`],
              ]}
            />
          </Section>
        </div>
      </div>
      <p className="text-[12px] text-muted-foreground">Last checked {formatDateTime(h.checkedAt)}.</p>
    </div>
  );
}

function rank(c: HealthCheck) {
  return c.status === 'fail' ? 0 : c.status === 'warn' ? 1 : 2;
}
