import { DAY_NAMES, DAY_SHORT, lessonPeriods, type TimetableSetup } from '@aischool/shared';
import { Ban, Eraser, RotateCcw, Save, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/search-input';
import { cn } from '@/lib/utils';
import { useSaveAvailability } from '../api';

const k = (day: number, period: number) => `${day}:${period}`;

export function AvailabilityEditor({ setup, canManage }: { setup: TimetableSetup; canManage: boolean }) {
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(setup.teachers[0]?.id);
  const teacher = setup.teachers.find((t) => t.id === selectedId) ?? setup.teachers[0];
  const bell = setup.bellSchedule;
  const days = [...bell.days].sort((a, b) => a - b);
  const lessons = lessonPeriods(bell);

  const serverSet = useMemo(() => new Set((teacher?.unavailable ?? []).map((u) => k(u.day, u.period))), [teacher]);
  const [blocked, setBlocked] = useState<Set<string>>(serverSet);
  useEffect(() => setBlocked(serverSet), [serverSet]);
  const save = useSaveAvailability();

  const dirty = blocked.size !== serverSet.size || [...blocked].some((x) => !serverSet.has(x));

  // click-and-drag painting
  const paint = useRef<boolean | null>(null);
  useEffect(() => {
    const up = () => (paint.current = null);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);
  const setCell = (day: number, period: number, on: boolean) =>
    setBlocked((prev) => {
      const next = new Set(prev);
      if (on) next.add(k(day, period));
      else next.delete(k(day, period));
      return next;
    });
  const setMany = (cells: [number, number][], on: boolean) =>
    setBlocked((prev) => {
      const next = new Set(prev);
      for (const [d, p] of cells) {
        if (on) next.add(k(d, p));
        else next.delete(k(d, p));
      }
      return next;
    });

  const filtered = setup.teachers.filter((t) => !q.trim() || `${t.name} ${t.jobTitle}`.toLowerCase().includes(q.trim().toLowerCase()));

  if (!teacher) {
    return (
      <Card>
        <EmptyState icon={Users} title="No teaching staff yet" description="Add teachers under Teachers & Staff and they’ll appear here." />
      </Card>
    );
  }

  const available = (t: TimetableSetup['teachers'][number]) => Math.max(0, setup.slotsPerWeek - t.unavailable.length);

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="flex max-h-[640px] flex-col overflow-hidden">
        <div className="border-b border-border p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search teachers…" label="Search teachers" />
        </div>
        <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-1.5" aria-label="Teachers">
          {filtered.map((t) => {
            const cap = available(t);
            const pct = cap ? Math.min(100, (t.periodsAssigned / cap) * 100) : 100;
            const over = t.periodsAssigned > cap;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-current={t.id === teacher.id || undefined}
                  onClick={() => setSelectedId(t.id)}
                  className={cn(
                    'w-full rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    t.id === teacher.id ? 'bg-brand-soft' : 'hover:bg-muted/60',
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">{t.name}</span>
                    <span className={cn('shrink-0 text-[11.5px] tabular', over ? 'font-semibold text-danger' : 'text-muted-foreground')}>
                      {t.periodsAssigned}/{cap}
                    </span>
                  </span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {t.jobTitle}
                    {t.unavailable.length > 0 && ` · ${t.unavailable.length} blocked`}
                  </span>
                  <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className={cn('block h-full rounded-full', over ? 'bg-danger' : pct > 85 ? 'bg-warning' : 'bg-brand')} style={{ width: `${pct}%` }} />
                  </span>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">No teachers match.</li>}
        </ul>
      </Card>

      <div className="space-y-4">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold tracking-tight">{teacher.name}</p>
              <p className="text-[12.5px] text-muted-foreground">
                {teacher.periodsAssigned} periods assigned · {setup.slotsPerWeek - blocked.size} of {setup.slotsPerWeek} slots available
              </p>
            </div>
            {canManage && (
              <Button variant="ghost" size="sm" onClick={() => setBlocked(new Set())} disabled={blocked.size === 0}>
                <Eraser /> Clear all
              </Button>
            )}
          </div>
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            {canManage ? 'Click or drag across periods this teacher can’t teach. Click a day or period name to toggle the whole row or column.' : 'Periods this teacher can’t teach.'}
          </p>

          <div className="scrollbar-thin mt-4 overflow-x-auto">
            <table className="w-full min-w-[440px] table-fixed border-separate border-spacing-1 text-[12px] select-none">
              <thead>
                <tr>
                  <th scope="col" className="w-24">
                    <span className="sr-only">Period</span>
                  </th>
                  {days.map((d) => {
                    const col = lessons.map((p) => [d, p] as [number, number]);
                    const all = col.every(([dd, p]) => blocked.has(k(dd, p)));
                    return (
                      <th key={d} scope="col" className="text-left">
                        <button
                          type="button"
                          disabled={!canManage}
                          onClick={() => setMany(col, !all)}
                          aria-label={`${all ? 'Free' : 'Block'} all of ${DAY_NAMES[d]}`}
                          className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted hover:text-foreground disabled:hover:bg-transparent"
                        >
                          {DAY_SHORT[d]}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {lessons.map((p) => {
                  const row = days.map((d) => [d, p] as [number, number]);
                  const all = row.every(([d, pp]) => blocked.has(k(d, pp)));
                  const per = bell.periods[p];
                  return (
                    <tr key={p}>
                      <th scope="row" className="text-left font-normal">
                        <button
                          type="button"
                          disabled={!canManage}
                          onClick={() => setMany(row, !all)}
                          aria-label={`${all ? 'Free' : 'Block'} ${per.label} every day`}
                          className="w-full rounded-md px-1.5 py-0.5 text-left hover:bg-muted disabled:hover:bg-transparent"
                        >
                          <span className="block text-[12px] font-medium">{per.label}</span>
                          <span className="block text-[10.5px] tabular text-muted-foreground">
                            {per.start}–{per.end}
                          </span>
                        </button>
                      </th>
                      {days.map((d) => {
                        const on = blocked.has(k(d, p));
                        return (
                          <td key={d}>
                            <button
                              type="button"
                              aria-pressed={on}
                              aria-label={`${DAY_NAMES[d]} ${per.label}: ${on ? 'unavailable' : 'available'}`}
                              disabled={!canManage}
                              onPointerDown={(e) => {
                                if (!canManage) return;
                                e.preventDefault();
                                paint.current = !on;
                                setCell(d, p, !on);
                              }}
                              onPointerEnter={() => {
                                if (paint.current !== null) setCell(d, p, paint.current);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setCell(d, p, !on);
                                }
                              }}
                              className={cn(
                                'grid h-10 w-full place-items-center rounded-lg border text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
                                on
                                  ? 'border-danger/40 bg-[repeating-linear-gradient(135deg,var(--danger-soft)_0_6px,transparent_6px_12px)] text-danger'
                                  : 'border-border bg-card text-transparent hover:border-border-strong hover:bg-muted/60',
                              )}
                            >
                              {on ? <Ban className="size-3.5" aria-hidden /> : '·'}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {canManage && dirty && (
          <div className="glass sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-brand/40 px-4 py-3 shadow-pop">
            <p className="min-w-0 flex-1 text-[13px] font-medium">
              <span className="mr-2 inline-block size-2 rounded-full bg-brand" aria-hidden />
              Unsaved availability for {teacher.name}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setBlocked(serverSet)}>
              <RotateCcw /> Discard
            </Button>
            <Button
              size="sm"
              loading={save.isPending}
              onClick={() =>
                save.mutate({
                  staffId: teacher.id,
                  unavailable: [...blocked].map((x) => {
                    const [day, period] = x.split(':').map(Number);
                    return { day, period };
                  }),
                })
              }
            >
              {!save.isPending && <Save />} Save availability
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
