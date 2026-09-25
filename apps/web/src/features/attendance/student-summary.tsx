import { CHRONIC_ABSENCE_THRESHOLD } from '@aischool/shared';
import { ArrowRight, CalendarCheck } from 'lucide-react';
import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useStudentAttendance } from './api';
import { CountLegend, RateRing, StackedBar } from './ui';

/** Compact term attendance for the student side sheet. */
export function StudentAttendanceSummary({ studentId, onNavigate }: { studentId: string; onNavigate?: () => void }) {
  const q = useStudentAttendance(studentId);
  const v = q.data;

  return (
    <section className="mt-6" aria-labelledby="sheet-attendance">
      <div className="mb-3 flex items-center justify-between">
        <h3 id="sheet-attendance" className="flex items-center gap-2 text-[13px] font-semibold">
          <CalendarCheck className="size-4 text-muted-foreground" /> Attendance
          {v && <span className="font-normal text-muted-foreground">· {v.term.name}</span>}
        </h3>
        <Link
          to={`/attendance/students/${studentId}`}
          onClick={onNavigate}
          className="inline-flex items-center gap-1 rounded-md text-[12.5px] font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Full view <ArrowRight className="size-3.5" />
        </Link>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-[88px] w-full rounded-xl" />
      ) : !v ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">
          {q.error instanceof ApiError && q.error.status === 404 ? 'No attendance for this term yet.' : 'Couldn’t load attendance.'}
        </p>
      ) : (
        <div
          className={cn(
            'flex items-center gap-4 rounded-xl border p-3.5',
            v.rate != null && v.rate < CHRONIC_ABSENCE_THRESHOLD ? 'border-danger/30 bg-danger-soft/30' : 'border-border bg-muted/30',
          )}
        >
          <RateRing rate={v.rate} size={64} stroke={6} />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[12.5px] text-muted-foreground">
              <span className="font-medium text-foreground tabular">{v.daysMarked}</span> days marked
              {v.currentAbsenceStreak >= 2 && <span className="font-medium text-danger"> · absent {v.currentAbsenceStreak} days in a row</span>}
            </p>
            <StackedBar counts={v.counts} />
            <CountLegend counts={v.counts} className="text-[11.5px]" />
          </div>
        </div>
      )}
    </section>
  );
}
