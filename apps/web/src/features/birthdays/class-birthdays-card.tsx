import type { BirthdayRow } from '@aischool/shared';
import { Cake, Check, PartyPopper } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useClassBirthdays, useSendClassWishes } from './api';

/** "Today", "Tomorrow", "In 3 days". */
export function whenLabel(inDays: number): string {
  return inDays === 0 ? 'Today' : inDays === 1 ? 'Tomorrow' : `In ${inDays} days`;
}

/** A birthday line: name, class or role, and the day and month (never the year or an age). */
export function BirthdayLine({ r, showDetail = true }: { r: BirthdayRow; showDetail?: boolean }) {
  const today = r.inDays === 0;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', today ? 'bg-chart-5/15 text-chart-5' : 'bg-muted text-muted-foreground')}>
        <Cake className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium">{r.name}</span>
        {showDetail && r.detail && <span className="block truncate text-[12px] text-muted-foreground">{r.detail}</span>}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[13px] tabular">{r.dayLabel}</span>
        <span className={cn('block text-[11.5px]', today ? 'font-semibold text-chart-5' : 'text-muted-foreground')}>{whenLabel(r.inDays)}</span>
      </span>
    </li>
  );
}

/**
 * "Birthdays in my class": today and the next 7 days in the classes the
 * teacher leads or teaches, with an optional, teacher-initiated "Send class
 * wishes" that posts a class announcement. Day and month only.
 * `classArmId` narrows it to one class (Class insights); on the dashboard it
 * is hidden when there is nothing to show.
 */
export function ClassBirthdaysCard({ classArmId }: { classArmId?: string }) {
  const q = useClassBirthdays();
  const send = useSendClassWishes();
  const [confirm, setConfirm] = useState<{ classArmId: string; label: string; names: string[] } | null>(null);
  if (q.isLoading) return classArmId ? null : <Skeleton className="h-32 rounded-2xl" />;
  const d = q.data;
  if (!d || !d.classes.length) return null;
  if (classArmId && !d.classes.some((c) => c.classArmId === classArmId)) return null;
  const rows = d.birthdays.filter((r) => !classArmId || r.classArmId === classArmId);
  if (!rows.length && !classArmId) return null;
  const classes = d.classes.filter((c) => !classArmId || c.classArmId === classArmId);
  const todayBy = classes
    .map((c) => ({ ...c, names: rows.filter((r) => r.inDays === 0 && r.classArmId === c.classArmId).map((r) => r.firstName) }))
    .filter((c) => c.names.length);
  const multi = classes.length > 1;

  return (
    <Card data-testid="class-birthdays">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Cake className="size-4 text-chart-5" aria-hidden /> Birthdays in {classArmId || classes.length === 1 ? classes[0]!.label : 'my classes'}
          </CardTitle>
          <CardDescription>Today and the next 7 days</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <ul className="divide-y divide-border">
            {rows.slice(0, 12).map((r) => (
              <BirthdayLine key={r.id} r={r} showDetail={multi} />
            ))}
          </ul>
        ) : (
          <p className="py-1 text-[13px] text-muted-foreground">No birthdays in the next 7 days.</p>
        )}
        {rows.length > 12 && <p className="mt-1 text-[12px] text-muted-foreground">and {rows.length - 12} more</p>}
        {todayBy.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
            {todayBy.map((c) => {
              const sent = d.wishesSent.includes(c.classArmId);
              return (
                <div key={c.classArmId} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[12.5px] text-muted-foreground">
                    {multi ? `${c.label}: ` : ''}Celebrate with a note on the class noticeboard.
                  </p>
                  {sent ? (
                    <Badge variant="success" className="w-fit">
                      <Check className="size-3" aria-hidden /> Wishes posted
                    </Badge>
                  ) : (
                    <Button size="sm" variant="outline" className="w-fit" onClick={() => setConfirm({ classArmId: c.classArmId, label: c.label, names: c.names })}>
                      <PartyPopper /> Send class wishes{multi ? ` (${c.label})` : ''}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Send wishes to ${confirm?.label ?? 'the class'}?`}
        description={
          confirm && (
            <>
              This posts a birthday note for {confirm.names.join(', ')} on the {confirm.label} noticeboard, seen by the class’s students and parents. It shows first names only — no ages or dates — and comes down after two days.
            </>
          )
        }
        confirmLabel="Post wishes"
        loading={send.isPending}
        onConfirm={() =>
          confirm &&
          send.mutate(
            { classArmId: confirm.classArmId, note: null },
            { onSuccess: () => setConfirm(null) },
          )
        }
      />
    </Card>
  );
}
