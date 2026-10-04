import { EVENT_CATEGORY_LABELS, type EventCategory, type PortalEvent } from '@aischool/shared';
import { FileText, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { categoryStyle, DateBlock, eventWhen } from '../comms/ui';

const asCategory = (c: string): EventCategory => (c in EVENT_CATEGORY_LABELS ? (c as EventCategory) : 'OTHER');

/** One upcoming event; exams stand out so families can plan revision. */
export function PortalEventItem({ e, compact }: { e: PortalEvent; compact?: boolean }) {
  const cat = asCategory(e.category);
  const exam = cat === 'EXAM';
  return (
    <li className={cn('flex min-w-0 items-start gap-3 rounded-xl border p-3', exam ? 'border-danger/30 bg-danger-soft/40' : 'border-border')}>
      <DateBlock date={e.startDate} className={cn(exam && 'border-danger/30')} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4" style={categoryStyle(cat)}>
            {exam && <FileText className="size-3" aria-hidden />}
            {EVENT_CATEGORY_LABELS[cat]}
          </span>
        </div>
        <p className={cn('mt-1 text-[14px] leading-snug', exam ? 'font-semibold' : 'font-medium')}>{e.title}</p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">{eventWhen(e)}</p>
        {e.location && (
          <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{e.location}</span>
          </p>
        )}
        {!compact && e.description && <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-foreground/85">{e.description}</p>}
      </div>
    </li>
  );
}

export function isExam(e: PortalEvent) {
  return e.category === 'EXAM';
}
