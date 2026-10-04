import { Plus, ScrollText } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth-store';
import { initialsFromName } from '@/lib/utils';
import { useStudentBehaviour } from './api';
import { BehaviourDialog, type BehaviourPrefill } from './behaviour-dialog';
import { BehaviourItem } from './behaviour-item';
import { Points } from './ui';

function Tile({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/60 px-3 py-2">
      <p className="truncate text-[11.5px] font-medium text-muted-foreground">{label}</p>
      <p className={`font-display text-lg font-semibold tabular ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

/** A student's behaviour timeline with this term's balance. */
export function StudentBehaviourSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useStudentBehaviour(id);
  const canManage = useCan('behaviour.manage');
  const [prefill, setPrefill] = useState<BehaviourPrefill | null>(null);
  const d = q.data;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent aria-describedby={undefined}>
        {q.error && !d ? (
          <div className="p-6">
            <SheetTitle className="sr-only">Behaviour</SheetTitle>
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          </div>
        ) : !d ? (
          <div className="space-y-4 p-6">
            <SheetTitle className="sr-only">Loading</SheetTitle>
            <Skeleton className="h-14 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <Avatar name={d.student.name} initials={initialsFromName(d.student.name)} size="lg" />
                <div className="min-w-0">
                  <SheetTitle className="truncate font-display text-lg font-semibold tracking-tight">{d.student.name}</SheetTitle>
                  <SheetDescription className="text-[13px] text-muted-foreground">
                    <span className="font-mono">{d.student.admissionNumber}</span> · {d.student.className ?? 'No class'}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <SheetBody>
              <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">{d.term ? `${d.term.name} · ${d.term.sessionName}` : 'This term'}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Tile label="Points this term" value={<Points value={d.termTally.points} />} />
                <Tile label="Merits" value={d.termTally.merits} tone="text-success" />
                <Tile label="Demerits" value={d.termTally.demerits} tone={d.termTally.demerits ? 'text-warning' : undefined} />
                <Tile label="Incidents" value={d.termTally.incidents} tone={d.termTally.incidents ? 'text-danger' : undefined} />
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground">
                All time: <Points value={d.allTime.points} className="text-[12px]" /> from {d.allTime.merits} merits, {d.allTime.demerits} demerits and {d.allTime.incidents} incidents
                {d.allTime.open ? ` · ${d.allTime.open} still open` : ''}.
              </p>
              <h3 className="mt-5 text-[13px] font-semibold">Timeline</h3>
              {d.records.length === 0 ? (
                <EmptyState compact icon={ScrollText} title="Nothing recorded yet" description="Merits, demerits and incidents will appear here." />
              ) : (
                <ul className="divide-y divide-border">
                  {d.records.map((r) => (
                    <BehaviourItem key={r.id} r={r} />
                  ))}
                </ul>
              )}
            </SheetBody>
            {canManage && (
              <SheetFooter>
                <Button onClick={() => setPrefill({ students: [{ id: d.student.id, name: d.student.name, admissionNumber: d.student.admissionNumber, className: d.student.className }] })}>
                  <Plus /> Record behaviour
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
      <BehaviourDialog open={!!prefill} onOpenChange={(o) => !o && setPrefill(null)} prefill={prefill} />
    </Sheet>
  );
}
