import {
  type BellPeriod,
  type BellSchedule,
  bellScheduleSchema,
  DAY_NAMES,
  DAY_SHORT,
  DEFAULT_BELL_SCHEDULE,
  lessonPeriods,
  type PeriodKind,
  type TimetableSetup,
} from '@aischool/shared';
import { AlertTriangle, ArrowDown, ArrowUp, Coffee, Info, Megaphone, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useSaveBell } from '../api';

const KIND_LABEL: Record<PeriodKind, string> = { LESSON: 'Lesson', BREAK: 'Break', ASSEMBLY: 'Assembly' };

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const toTime = (min: number) => {
  const m = Math.max(0, Math.min(23 * 60 + 59, min));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

function rowIssue(periods: BellPeriod[], i: number): string | null {
  const p = periods[i];
  if (!p.label.trim()) return 'Give it a name';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.end)) return 'Use HH:MM';
  if (p.end <= p.start) return 'Ends before it starts';
  if (i > 0 && p.start < periods[i - 1].end) return `Overlaps ${periods[i - 1].label || 'the period above'}`;
  return null;
}

export function BellEditor({ setup, canManage }: { setup: TimetableSetup; canManage: boolean }) {
  const [draft, setDraft] = useState<BellSchedule>(setup.bellSchedule);
  const [base, setBase] = useState(setup.bellSchedule);
  const [confirmReset, setConfirmReset] = useState(false);
  const save = useSaveBell();

  // Server copy changed (after save or elsewhere) → adopt it.
  if (setup.bellSchedule !== base) {
    setBase(setup.bellSchedule);
    setDraft(setup.bellSchedule);
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(setup.bellSchedule);
  const parsed = useMemo(() => bellScheduleSchema.safeParse(draft), [draft]);
  const issues = parsed.success ? [] : [...new Set(parsed.error.issues.map((i) => i.message))];
  const lessons = lessonPeriods(draft).length;

  const setPeriod = (i: number, patch: Partial<BellPeriod>) =>
    setDraft((d) => ({ ...d, periods: d.periods.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const movePeriod = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const periods = [...d.periods];
      const j = i + dir;
      if (j < 0 || j >= periods.length) return d;
      [periods[i], periods[j]] = [periods[j], periods[i]];
      return { ...d, periods };
    });
  const removePeriod = (i: number) => setDraft((d) => ({ ...d, periods: d.periods.filter((_, j) => j !== i) }));
  const addPeriod = (kind: PeriodKind) =>
    setDraft((d) => {
      const last = d.periods[d.periods.length - 1];
      const start = last ? toMin(last.end) : 8 * 60;
      const len = kind === 'LESSON' ? 40 : 20;
      const n = d.periods.filter((p) => p.kind === 'LESSON').length + 1;
      return {
        ...d,
        periods: [...d.periods, { label: kind === 'LESSON' ? `Period ${n}` : kind === 'BREAK' ? 'Break' : 'Assembly', start: toTime(start), end: toTime(start + len), kind }],
      };
    });
  const toggleDay = (day: number) =>
    setDraft((d) => ({ ...d, days: d.days.includes(day) ? d.days.filter((x) => x !== day) : [...d.days, day].sort((a, b) => a - b) }));

  // Preview scale
  const first = draft.periods[0] ? toMin(draft.periods[0].start) : 0;
  const lastEnd = draft.periods.length ? Math.max(...draft.periods.map((p) => toMin(p.end))) : 1;
  const span = Math.max(1, lastEnd - first);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>School days</CardTitle>
              <CardDescription>Which days lessons run each week.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2" role="group" aria-label="School days">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const on = draft.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-label={DAY_NAMES[d]}
                    disabled={!canManage}
                    onClick={() => toggleDay(d)}
                    className={cn(
                      'h-10 min-w-14 rounded-xl border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
                      on ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {DAY_SHORT[d]}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Bell schedule</CardTitle>
              <CardDescription>The periods of a day, in order. Doubles can only span two lessons with no break between.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="hidden grid-cols-[minmax(0,1.4fr)_110px_110px_130px_auto] gap-2 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
              <span>Name</span>
              <span>Starts</span>
              <span>Ends</span>
              <span>Kind</span>
              <span className="sr-only">Actions</span>
            </div>
            <ol className="space-y-2">
              {draft.periods.map((p, i) => {
                const issue = rowIssue(draft.periods, i);
                return (
                  <li key={i} className={cn('rounded-xl border p-2', p.kind === 'LESSON' ? 'border-border bg-card' : 'border-dashed border-border bg-muted/40')}>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.4fr)_110px_110px_130px_auto] sm:items-center">
                      <Input
                        aria-label={`Period ${i + 1} name`}
                        value={p.label}
                        maxLength={30}
                        disabled={!canManage}
                        onChange={(e) => setPeriod(i, { label: e.target.value })}
                        className="col-span-2 h-9 sm:col-span-1"
                      />
                      <Input
                        type="time"
                        aria-label={`${p.label} starts`}
                        value={p.start}
                        disabled={!canManage}
                        invalid={!!issue && issue !== 'Give it a name'}
                        onChange={(e) => setPeriod(i, { start: e.target.value })}
                        className="h-9 tabular"
                      />
                      <Input
                        type="time"
                        aria-label={`${p.label} ends`}
                        value={p.end}
                        disabled={!canManage}
                        invalid={!!issue && issue !== 'Give it a name'}
                        onChange={(e) => setPeriod(i, { end: e.target.value })}
                        className="h-9 tabular"
                      />
                      <Select value={p.kind} onValueChange={(v) => setPeriod(i, { kind: v as PeriodKind })} disabled={!canManage}>
                        <SelectTrigger className="h-9" aria-label={`${p.label} kind`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(KIND_LABEL) as PeriodKind[]).map((k) => (
                            <SelectItem key={k} value={k}>
                              {KIND_LABEL[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {canManage && (
                        <div className="flex items-center justify-end gap-0.5">
                          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${p.label} up`} disabled={i === 0} onClick={() => movePeriod(i, -1)}>
                            <ArrowUp />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Move ${p.label} down`}
                            disabled={i === draft.periods.length - 1}
                            onClick={() => movePeriod(i, 1)}
                          >
                            <ArrowDown />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remove ${p.label}`}
                            disabled={draft.periods.length <= 1}
                            onClick={() => removePeriod(i)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      )}
                    </div>
                    {issue && (
                      <p role="alert" className="mt-1.5 px-1 text-[12px] font-medium text-danger">
                        {issue}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
            {canManage && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => addPeriod('LESSON')} disabled={draft.periods.length >= 16}>
                  <Plus /> Lesson
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => addPeriod('BREAK')} disabled={draft.periods.length >= 16}>
                  <Coffee /> Break
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => addPeriod('ASSEMBLY')} disabled={draft.periods.length >= 16}>
                  <Megaphone /> Assembly
                </Button>
                <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setConfirmReset(true)}>
                  <RotateCcw /> Use the standard day
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                {lessons} lessons a day · {draft.days.length} days · <span className="font-medium text-foreground">{lessons * draft.days.length} slots a week</span>
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-1" aria-label="A day at a glance">
              {draft.periods.map((p, i) => {
                const mins = Math.max(0, toMin(p.end) - toMin(p.start));
                return (
                  <li
                    key={i}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2.5 text-[12px]',
                      p.kind === 'LESSON' ? 'bg-brand-soft text-brand' : p.kind === 'BREAK' ? 'bg-muted text-muted-foreground' : 'bg-info-soft text-info',
                    )}
                    style={{ minHeight: Math.max(22, Math.round((mins / span) * 420)) }}
                  >
                    <span className="w-11 shrink-0 tabular opacity-80">{p.start}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{p.label || '—'}</span>
                    <span className="shrink-0 tabular opacity-70">{mins}m</span>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
        <p className="flex gap-2 px-1 text-[12px] text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Timetables already built keep the day they were built with. Blocked teacher periods that no longer exist are cleared on save.
        </p>
      </div>

      {canManage && (dirty || issues.length > 0) && (
        <div
          className={cn(
            'glass sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 shadow-pop lg:col-span-2',
            issues.length ? 'border-danger/40' : 'border-brand/40',
          )}
        >
          <p className="min-w-0 flex-1 text-[13px]">
            {issues.length ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-danger">
                <AlertTriangle className="size-4" /> {issues[0]}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 font-medium">
                <span className="size-2 rounded-full bg-brand" aria-hidden /> Unsaved changes to the school day
              </span>
            )}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setDraft(setup.bellSchedule)}>
            <RotateCcw /> Discard
          </Button>
          <Button size="sm" loading={save.isPending} disabled={!parsed.success} onClick={() => parsed.success && save.mutate(parsed.data)}>
            {!save.isPending && <Save />} Save school day
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        destructive={false}
        title="Use the standard school day?"
        description="Monday to Friday: assembly, eight 40-minute lessons, a short break and lunch. You can still edit it before saving."
        confirmLabel="Use it"
        onConfirm={() => {
          setDraft(DEFAULT_BELL_SCHEDULE);
          setConfirmReset(false);
        }}
      />
    </div>
  );
}
