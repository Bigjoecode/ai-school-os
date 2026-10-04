import { mondayOf } from '@aischool/shared';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/format';
import { useLessons, useSubmitWeek } from './api';
import { ReviewStatusBadge } from './vetting-ui';

/** Monday of next week (lesson notes are due before the week starts). */
export function nextMonday(): string {
  const d = new Date(`${mondayOf(new Date())}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Submits all of the teacher's unsubmitted or returned plans for one week. */
export function SubmitWeekDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [day, setDay] = useState(nextMonday);
  const weekStart = day ? mondayOf(day) : '';
  const mine = useLessons({ mine: true });
  const submit = useSubmitWeek();
  const inWeek = (mine.data ?? []).filter((l) => l.weekStart === weekStart);
  const ready = inWeek.filter((l) => l.reviewStatus === 'NOT_SUBMITTED' || l.reviewStatus === 'RETURNED');

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Submit a week’s lesson notes"
      description="Sends every lesson plan of yours in that week that hasn’t been submitted (or was returned) to be vetted."
      icon={<Send />}
      submitLabel={ready.length ? `Submit ${ready.length} lesson note${ready.length === 1 ? '' : 's'}` : 'Submit'}
      pending={submit.isPending}
      onSubmit={(e) => {
        e?.preventDefault();
        if (!weekStart) return;
        submit.mutate(weekStart, { onSuccess: (r) => r.submitted && onOpenChange(false) });
      }}
    >
      <div className="space-y-4">
        <Field label="Week" htmlFor="sw-week" hint={weekStart ? `Monday ${formatDate(weekStart)} to Sunday ${formatDate(addDays(weekStart, 6))}` : 'Pick any day in the week'}>
          <Input id="sw-week" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Your lesson plans that week</p>
          {inWeek.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted-foreground">You have no dated lesson plans in this week.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
              {inWeek.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.topic}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {l.subject.name} · {l.classArm.levelName} {l.classArm.name}
                      {l.date ? ` · ${formatDate(l.date, { weekday: 'short' })}` : ''}
                    </span>
                  </span>
                  <ReviewStatusBadge status={l.reviewStatus} late={l.late} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
