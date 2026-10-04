import type { PortalEvent } from '@aischool/shared';
import { CalendarDays, CalendarPlus, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { SubscribeDialog } from '../comms/event-sheets';
import { usePortalCalendar } from './api';
import { isExam, PortalEventItem } from './events';
import { PortalShell, type ShellCtx } from './ui';

export default function PortalCalendarPage() {
  const [subscribe, setSubscribe] = useState(false);
  return (
    <>
      <PortalShell
        section="calendar"
        title={() => 'Exams & calendar'}
        description={({ isParent, child }) => (isParent ? `Exams, holidays and events for ${child.firstName}’s class.` : 'Exams, holidays and events for your class.')}
        actions={() => (
          <Button variant="outline" onClick={() => setSubscribe(true)}>
            <CalendarPlus /> Add to my calendar
          </Button>
        )}
      >
        {(ctx) => <CalendarBody {...ctx} />}
      </PortalShell>
      <SubscribeDialog open={subscribe} onOpenChange={setSubscribe} />
    </>
  );
}

function CalendarBody({ child }: ShellCtx) {
  const q = usePortalCalendar(child.id);
  const months = useMemo(() => {
    const out: { key: string; label: string; rows: PortalEvent[] }[] = [];
    for (const e of q.data ?? []) {
      const key = e.startDate.slice(0, 7);
      let m = out.find((x) => x.key === key);
      if (!m) {
        m = { key, label: new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`)), rows: [] };
        out.push(m);
      }
      m.rows.push(e);
    }
    return out;
  }, [q.data]);

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
    );
  }
  if (q.data.length === 0) {
    return (
      <Card>
        <EmptyState icon={CalendarDays} title="Nothing coming up" description="When the school adds exams, holidays or events, they’ll show here." />
      </Card>
    );
  }
  const exams = q.data.filter(isExam);
  return (
    <div className="space-y-6">
      {exams.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger-soft/40 p-4">
          <FileText className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold">
              {exams.length === 1 ? 'Next exam' : `${exams.length} exams coming up`}: {exams[0].title}
            </p>
            <p className="text-[13px] text-muted-foreground">
              Starts{' '}
              {new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${exams[0].startDate}T00:00:00Z`))}. A little revision each day helps.
            </p>
          </div>
        </div>
      )}
      {months.map((m) => (
        <section key={m.key} aria-label={m.label}>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{m.label}</h2>
          <ul className="space-y-2">
            {m.rows.map((e) => (
              <PortalEventItem key={e.id} e={e} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
