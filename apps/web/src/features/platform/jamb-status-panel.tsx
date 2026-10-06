import { Landmark } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { useJambConsoleStatus } from '../careers/jamb-api';

const nf = new Intl.NumberFormat('en-GB');
const when = (iso: string | null) => (iso ? formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/** The installed JAMB brochure (prisma/jamb/ibass.json.gz). JAMB's data, so read-only here. */
export function JambStatusPanel() {
  const q = useJambConsoleStatus();
  const d = q.data;
  if (q.isLoading) return <Skeleton className="mb-5 h-24 rounded-2xl" />;
  if (!d) return null;
  return (
    <Card className="mb-5 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <Landmark className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold tracking-tight">JAMB data</p>
          {d.installed ? (
            <p className="text-[12.5px] text-muted-foreground">
              {d.source ?? 'JAMB IBASS'} · collected {when(d.fetchedAt)} · installed {when(d.installedAt)}
              {d.durationMs !== null ? ` in ${(d.durationMs / 1000).toFixed(1)}s` : ''}. It ships with the app and replaces itself when a new file is deployed — nothing to edit here.
            </p>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">Not installed yet: the API loads prisma/jamb/ibass.json.gz in the background after start-up.</p>
          )}
        </div>
      </div>
      {d.installed && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px] sm:grid-cols-5">
          {[
            ['Institutions', d.counts.institutions],
            ['Programmes', d.counts.programmes],
            ['Courses', `${nf.format(d.counts.courses)} (${nf.format(d.counts.withFaculty)} with a faculty)`],
            ['Requirement texts', d.counts.texts],
            ['Career courses linked', `${d.careerCourses.linked} of ${d.careerCourses.total}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-muted/50 px-3 py-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium tabular">{typeof v === 'number' ? nf.format(v) : v}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
