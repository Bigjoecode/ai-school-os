import { behaviourCategoryLabel, SICK_BAY_OUTCOME_LABELS, type PortalWelfare } from '@aischool/shared';
import { useQuery } from '@tanstack/react-query';
import { HeartPulse, ScrollText, Stethoscope, ThumbsDown, ThumbsUp, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { schoolDateTime } from '../finance/ui';
import { cn } from '@/lib/utils';
import { KindBadge, MedicalAlertBanner, Points } from '../welfare/ui';
import { PortalShell, type ShellCtx, StatTile } from './ui';

const usePortalWelfare = (id: string) =>
  useQuery({ queryKey: ['portal', 'welfare', id], queryFn: ({ signal }) => api.get<PortalWelfare>(`/portal/students/${id}/welfare`, undefined, signal), enabled: !!id });

/** "Behaviour & health": shared behaviour records for parents and students; sick-bay visits and the medical profile for parents. */
export default function PortalWelfarePage() {
  return (
    <PortalShell
      section="welfare"
      title={({ isParent, child }) => (isParent ? `${child.firstName}’s behaviour & health` : 'My behaviour')}
      description={({ isParent, child }) =>
        isParent ? `Merits, conduct notes and sick-bay visits the school has shared about ${child.firstName}.` : 'Merits and conduct notes your school has shared with you.'
      }
    >
      {(ctx) => <Body {...ctx} />}
    </PortalShell>
  );
}

function Body({ child, isParent }: ShellCtx) {
  const q = usePortalWelfare(child.id);
  const d = q.data;
  if (q.error && !d) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!d) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }
  const t = d.tally;
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-[15px] font-semibold">This term</h2>
          {d.term && (
            <p className="text-[12.5px] text-muted-foreground">
              {d.term.name} · {d.term.sessionName}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Points" value={<Points value={t.points} />} />
          <StatTile label="Merits" value={t.merits} icon={ThumbsUp} tone={t.merits ? 'text-success' : undefined} />
          <StatTile label="Demerits" value={t.demerits} icon={ThumbsDown} tone={t.demerits ? 'text-warning' : undefined} />
          <StatTile label="Incidents" value={t.incidents} icon={TriangleAlert} tone={t.incidents ? 'text-danger' : undefined} />
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-1 font-display text-[15px] font-semibold">Behaviour record</h2>
        {d.behaviour.length === 0 ? (
          <EmptyState compact icon={ScrollText} title="Nothing recorded" description={isParent ? `When teachers recognise ${child.firstName} or note a concern, it will appear here.` : 'When teachers recognise you or note a concern, it will appear here.'} />
        ) : (
          <ul className="divide-y divide-border">
            {d.behaviour.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-3">
                <Points value={r.points} className="mt-0.5 w-9 shrink-0 text-right text-[15px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <KindBadge kind={r.kind} />
                    <span className="text-[12px] text-muted-foreground">{behaviourCategoryLabel(r.category)}</span>
                    {r.kind !== 'MERIT' && r.status === 'RESOLVED' && <Badge variant="outline">Resolved</Badge>}
                  </div>
                  <p className="mt-1 break-words text-[13.5px] font-medium">{r.title}</p>
                  {r.description && <p className="mt-0.5 whitespace-pre-line break-words text-[13px] text-muted-foreground">{r.description}</p>}
                  {r.actionTaken && (
                    <p className="mt-0.5 text-[12.5px]">
                      <span className="text-muted-foreground">Action taken:</span> {r.actionTaken}
                    </p>
                  )}
                  <p className="mt-1 text-[11.5px] text-muted-foreground">{formatDate(r.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isParent && d.medical && (
        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold">
            <HeartPulse className="size-4 text-muted-foreground" /> Medical profile
          </h2>
          <MedicalAlertBanner profile={d.medical} />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Blood group" value={d.medical.bloodGroup?.replace('-', '−') ?? '—'} />
            <StatTile label="Genotype" value={d.medical.genotype ?? '—'} />
          </div>
          {d.medical.medicalNotes && <p className="mt-3 whitespace-pre-line text-[13px] text-muted-foreground">{d.medical.medicalNotes}</p>}
          <p className="mt-3 text-[12.5px] text-muted-foreground">Something missing or out of date? Please tell the school office or the school nurse so they can update {child.firstName}’s record.</p>
        </Card>
      )}

      {isParent && d.sickBay && (
        <Card className="p-4 sm:p-5">
          <h2 className="mb-1 flex items-center gap-2 font-display text-[15px] font-semibold">
            <Stethoscope className="size-4 text-muted-foreground" /> Sick-bay visits
          </h2>
          {d.sickBay.length === 0 ? (
            <p className="py-3 text-[13px] text-muted-foreground">{child.firstName} hasn’t needed the sick bay.</p>
          ) : (
            <ul className="divide-y divide-border">
              {d.sickBay.map((v) => (
                <li key={v.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-medium">{v.complaint}</p>
                    <Badge variant={v.outcome === 'RETURNED_TO_CLASS' ? 'success' : v.outcome === 'OBSERVATION' ? 'info' : v.outcome === 'HOSPITAL' ? 'danger' : 'warning'} dot>
                      {SICK_BAY_OUTCOME_LABELS[v.outcome]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    {schoolDateTime(v.visitedAt)}
                    {v.temperature != null && <span className={cn(v.temperature >= 37.5 && 'text-danger')}> · {v.temperature.toFixed(1)}°C</span>}
                  </p>
                  {(v.treatment || v.medication) && <p className="mt-0.5 text-[13px]">{[v.treatment, v.medication && `Medication: ${v.medication}`].filter(Boolean).join(' · ')}</p>}
                  {v.followUp && <p className="mt-0.5 text-[13px]">Follow-up: {v.followUp}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
