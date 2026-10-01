import { fromTimetableSchema, type LessonSummary, LIVE_PROVIDER_LABELS, LIVE_PROVIDERS, liveClassSchema, type LiveClassDetail, type LiveIntegrationStatus, type LiveProvider } from '@aischool/shared';
import { CalendarRange, CheckCircle2, Info, Settings2, Video } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tip } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { qk } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { armOptions, useStructure } from '../academics/api';
import { apiFieldErrors, dateInput, FormError, type PickedPerson, StaffCombo, zodErrors } from '../operations/ui';
import { useFromTimetable, useLiveIntegrations, useSaveLiveClass } from './api';
import { addDays, minutesBetween, ProviderIcon, schoolDate, schoolTime, schoolToday, schoolToIso, useSchoolTz } from './ui';

const DURATIONS = [30, 40, 60, 80];

/** The first connected meeting service, preferring Meet, then Zoom, then BBB. */
function defaultProvider(list: LiveIntegrationStatus[] | undefined): LiveProvider {
  return (['GOOGLE_MEET', 'ZOOM', 'BBB'] as const).find((p) => list?.find((i) => i.provider === p)?.connected) ?? 'EXTERNAL';
}

/** Next half hour in school time. */
function nextSlot(tz: string): { date: string; time: string } {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return { date: schoolDate(d, tz), time: schoolTime(d, tz) };
}

function ProviderSelect({ id, value, onChange, integrations, disabled, invalid }: { id: string; value: LiveProvider; onChange: (p: LiveProvider) => void; integrations?: LiveIntegrationStatus[]; disabled?: boolean; invalid?: boolean }) {
  return (
    <Select value={value} onValueChange={(p) => onChange(p as LiveProvider)} disabled={disabled}>
      <SelectTrigger id={id} invalid={invalid}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LIVE_PROVIDERS.map((p) => {
          const st = integrations?.find((i) => i.provider === p);
          const on = p === 'EXTERNAL' || !!st?.connected;
          return (
            <SelectItem key={p} value={p} disabled={!on}>
              <span className="flex items-center gap-2">
                <ProviderIcon provider={p} size="sm" />
                {LIVE_PROVIDER_LABELS[p]}
                {!on && <span className="text-[11.5px] text-muted-foreground">· not set up</span>}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function ProviderHint({ integrations }: { integrations?: LiveIntegrationStatus[] }) {
  const canManage = useCan('live.manage');
  const missing = (['GOOGLE_MEET', 'ZOOM', 'BBB'] as const).filter((p) => !integrations?.find((i) => i.provider === p)?.connected);
  if (!integrations || missing.length === 0) return null;
  return (
    <span>
      {missing.length === 3 ? 'No meeting service is connected yet — paste a meeting link, or ' : `${missing.map((p) => LIVE_PROVIDER_LABELS[p]).join(', ')} not set up. `}
      {canManage ? (
        <Link to="/live/settings" className="font-medium text-brand hover:underline">
          {missing.length === 3 ? 'connect one' : 'Connect'}
        </Link>
      ) : missing.length === 3 ? (
        'ask an admin to connect one'
      ) : (
        'Ask an admin to connect it'
      )}
      .
    </span>
  );
}

// ------------------------------------------------------------------ schedule / edit

interface Values {
  title: string;
  titleTouched: boolean;
  classArmId: string;
  subjectId: string;
  teacher: PickedPerson | null;
  lessonPlanId: string;
  provider: LiveProvider;
  joinUrl: string;
  date: string;
  time: string;
  duration: string;
  agenda: string;
}

export function ScheduleSheet({ open, onOpenChange, liveClass }: { open: boolean; onOpenChange: (o: boolean) => void; liveClass?: LiveClassDetail | null }) {
  const tz = useSchoolTz();
  const navigate = useNavigate();
  const structure = useStructure(open);
  const integrations = useLiveIntegrations(open);
  const canManage = useCan('live.manage');
  const canStaff = useCan('staff.read');
  const canLessons = useCan('lessons.read');
  const save = useSaveLiveClass();
  const [v, setV] = useState<Values | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<Values>) => setV((p) => (p ? { ...p, ...patch } : p));
  const editing = !!liveClass;

  useEffect(() => {
    if (!open) {
      setV(null);
      return;
    }
    setErrors({});
    if (liveClass) {
      setV({
        title: liveClass.title,
        titleTouched: true,
        classArmId: liveClass.classArm.id,
        subjectId: liveClass.subject?.id ?? '',
        teacher: liveClass.teacher ? { id: liveClass.teacher.id, name: liveClass.teacher.name, detail: null } : null,
        lessonPlanId: liveClass.lessonPlan?.id ?? '',
        provider: liveClass.provider,
        joinUrl: liveClass.provider === 'EXTERNAL' ? (liveClass.joinUrl ?? '') : '',
        date: schoolDate(liveClass.startsAt, tz),
        time: schoolTime(liveClass.startsAt, tz),
        duration: String(minutesBetween(liveClass.startsAt, liveClass.endsAt)),
        agenda: liveClass.agenda ?? '',
      });
    } else {
      const slot = nextSlot(tz);
      setV({ title: '', titleTouched: false, classArmId: '', subjectId: '', teacher: null, lessonPlanId: '', provider: 'EXTERNAL', joinUrl: '', date: slot.date, time: slot.time, duration: '40', agenda: '' });
    }
  }, [open, liveClass, tz]);

  // Pick a connected service once we know which are connected.
  const integrationsLoaded = !!integrations.data;
  useEffect(() => {
    if (!open || editing || !integrationsLoaded) return;
    setV((p) => (p && p.provider === 'EXTERNAL' && !p.joinUrl ? { ...p, provider: defaultProvider(integrations.data) } : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, integrationsLoaded]);

  const arms = useMemo(() => armOptions(structure.data), [structure.data]);
  const subjects = useMemo(() => [...(structure.data?.subjects ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [structure.data]);
  const lessonFilters = { classArmId: v?.classArmId, subjectId: v?.subjectId };
  const lessons = useQuery({
    queryKey: qk.lessons(lessonFilters),
    queryFn: ({ signal }) => api.get<LessonSummary[]>('/lessons', lessonFilters, signal),
    enabled: open && canLessons && !!v?.classArmId && !!v?.subjectId,
  });
  const lessonOptions = v?.classArmId && v.subjectId && canLessons ? (lessons.data ?? []).filter((l) => l.generation !== 'QUEUED' && l.generation !== 'RUNNING') : [];

  const onSubject = (subjectId: string) => {
    if (!v) return;
    const name = subjects.find((s) => s.id === subjectId)?.name ?? '';
    set({ subjectId, lessonPlanId: '', ...(!v.titleTouched || !v.title.trim() ? { title: name, titleTouched: false } : {}) });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!v) return;
    const next: Record<string, string> = {};
    if (!v.date) next.startsAt = 'Pick a date';
    else if (!/^\d{2}:\d{2}$/.test(v.time)) next.startsAt = 'Pick a start time';
    const input = {
      title: v.title,
      classArmId: v.classArmId,
      subjectId: v.subjectId || null,
      teacherId: !editing && canManage ? (v.teacher?.id ?? null) : null,
      lessonPlanId: v.lessonPlanId || null,
      provider: v.provider,
      startsAt: next.startsAt ? '' : schoolToIso(v.date, v.time, tz),
      durationMinutes: Number(v.duration),
      agenda: v.agenda.trim() || null,
      joinUrl: v.provider === 'EXTERNAL' ? v.joinUrl.trim() || null : null,
    };
    const parsed = liveClassSchema.safeParse(input);
    const errs = { ...(parsed.success ? {} : zodErrors(parsed.error.issues)), ...next };
    if (!v.classArmId) errs.classArmId = 'Choose a class';
    if (errs.durationMinutes) errs.durationMinutes = 'Between 10 and 300 minutes';
    setErrors(errs);
    if (!parsed.success || Object.keys(errs).length) return;
    save.mutate(
      { id: liveClass?.id, input: parsed.data },
      {
        onSuccess: (d) => {
          onOpenChange(false);
          if (!editing) navigate(`/live/${d.id}`);
        },
        onError: (err) => setErrors(apiFieldErrors(err)),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">{editing ? 'Edit live class' : 'Schedule a live class'}</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">
            {editing ? 'Changes are sent to the meeting service too.' : 'We create the meeting for you and students see it in their portal.'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {!v ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <form id="live-form" onSubmit={submit} noValidate className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <Field label="Class" htmlFor="lc-arm" error={errors.classArmId} hint={editing ? 'The class can’t be changed.' : undefined}>
                  {structure.isLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select value={v.classArmId || undefined} onValueChange={(classArmId) => set({ classArmId, lessonPlanId: '' })} disabled={editing}>
                      <SelectTrigger id="lc-arm" invalid={!!errors.classArmId}>
                        <SelectValue placeholder={arms.length ? 'Choose a class' : 'No classes set up'} />
                      </SelectTrigger>
                      <SelectContent>
                        {arms.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
                <Field label="Subject" htmlFor="lc-subject" optional={!editing} error={errors.subjectId}>
                  {structure.isLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select value={v.subjectId || NONE} onValueChange={(s) => onSubject(s === NONE ? '' : s)} disabled={editing}>
                      <SelectTrigger id="lc-subject">
                        <SelectValue placeholder="Choose a subject" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No subject (form time, assembly…)</SelectItem>
                        {subjects.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              </div>
              <Field label="Title" htmlFor="lc-title" error={errors.title} hint={!v.titleTouched && v.subjectId ? 'Defaults to the subject — make it more specific if you like.' : undefined}>
                <Input id="lc-title" value={v.title} onChange={(e) => set({ title: e.target.value, titleTouched: true })} maxLength={160} placeholder="e.g. Mathematics — Simultaneous equations" invalid={!!errors.title} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <Field label="Meeting service" htmlFor="lc-provider" error={errors.provider} hint={editing ? 'Can’t be changed once scheduled.' : <ProviderHint integrations={integrations.data} />}>
                  <ProviderSelect id="lc-provider" value={v.provider} onChange={(provider) => set({ provider })} integrations={integrations.data} disabled={editing} invalid={!!errors.provider} />
                </Field>
                {v.provider === 'EXTERNAL' && (
                  <Field label="Meeting link" htmlFor="lc-url" error={errors.joinUrl} hint="Teams, Jitsi, a personal Zoom room…">
                    <Input id="lc-url" type="url" inputMode="url" value={v.joinUrl} onChange={(e) => set({ joinUrl: e.target.value })} placeholder="https://" invalid={!!errors.joinUrl} />
                  </Field>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                <Field label="Date" htmlFor="lc-date" error={errors.startsAt}>
                  <Input id="lc-date" type="date" value={v.date} min={editing ? undefined : schoolToday(tz)} onChange={(e) => set({ date: e.target.value })} className={dateInput} invalid={!!errors.startsAt} />
                </Field>
                <Field label="Starts at" htmlFor="lc-time" hint="School time">
                  <Input id="lc-time" type="time" value={v.time} onChange={(e) => set({ time: e.target.value })} className={dateInput} invalid={!!errors.startsAt} />
                </Field>
              </div>
              <Field label="Duration" htmlFor="lc-duration" error={errors.durationMinutes}>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-28">
                    <Input
                      id="lc-duration"
                      inputMode="numeric"
                      value={v.duration}
                      onChange={(e) => set({ duration: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                      className="pr-12 tabular"
                      invalid={!!errors.durationMinutes}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">min</span>
                  </div>
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={v.duration === String(d)}
                      onClick={() => set({ duration: String(d) })}
                      className={cn(
                        'h-8 rounded-full border px-3 text-[12.5px] font-medium tabular transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        v.duration === String(d) ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-card hover:bg-muted/50',
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </Field>

              {!editing && canManage && canStaff && (
                <Field label="Teacher" htmlFor="lc-teacher" optional hint="Leave empty to use the class’s teacher for this subject.">
                  <StaffCombo id="lc-teacher" value={v.teacher} onChange={(teacher) => set({ teacher })} placeholder="The subject teacher" />
                </Field>
              )}

              {canLessons && (
                <Field
                  label="Lesson plan"
                  htmlFor="lc-plan"
                  optional
                  hint={!v.classArmId || !v.subjectId ? 'Choose a class and subject to link one of their lesson plans.' : 'The AI uses it for the class summary if there’s no transcript or notes.'}
                >
                  <Select value={v.lessonPlanId || NONE} onValueChange={(s) => set({ lessonPlanId: s === NONE ? '' : s })} disabled={!v.classArmId || !v.subjectId}>
                    <SelectTrigger id="lc-plan">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{lessons.isLoading ? 'Loading lesson plans…' : lessonOptions.length ? 'None' : 'No lesson plans for this class yet'}</SelectItem>
                      {liveClass?.lessonPlan && !lessonOptions.some((l) => l.id === liveClass.lessonPlan!.id) && <SelectItem value={liveClass.lessonPlan.id}>{liveClass.lessonPlan.topic}</SelectItem>}
                      {lessonOptions.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.topic}
                          {l.date ? ` · ${l.date.slice(0, 10)}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              <Field label="Agenda" htmlFor="lc-agenda" optional error={errors.agenda}>
                <Textarea id="lc-agenda" rows={3} value={v.agenda} onChange={(e) => set({ agenda: e.target.value })} maxLength={2000} placeholder="What you’ll cover, and anything students should have ready" />
              </Field>
              <FormError message={errors.form} />
            </form>
          )}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="live-form" loading={save.isPending} disabled={!v}>
            {!save.isPending && <Video />} {editing ? 'Save changes' : save.isPending ? 'Creating the meeting…' : 'Schedule class'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ------------------------------------------------------------------ from the timetable

export function FromTimetableDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const tz = useSchoolTz();
  const structure = useStructure(open);
  const integrations = useLiveIntegrations(open);
  const run = useFromTimetable();
  const [v, setV] = useState({ classArmId: '', subjectId: '', from: '', to: '', provider: 'EXTERNAL' as LiveProvider, joinUrl: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ created: number; skipped: string[] } | null>(null);
  const set = (patch: Partial<typeof v>) => setV((p) => ({ ...p, ...patch }));

  useEffect(() => {
    if (!open) return;
    const today = schoolToday(tz);
    setV({ classArmId: '', subjectId: '', from: today, to: addDays(today, 13), provider: 'EXTERNAL', joinUrl: '' });
    setErrors({});
    setResult(null);
    run.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tz]);

  const integrationsLoaded = !!integrations.data;
  useEffect(() => {
    if (open && integrationsLoaded) setV((p) => (p.provider === 'EXTERNAL' && !p.joinUrl ? { ...p, provider: defaultProvider(integrations.data) } : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, integrationsLoaded]);

  const arms = armOptions(structure.data);
  const subjects = [...(structure.data?.subjects ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = fromTimetableSchema.safeParse({ ...v, joinUrl: v.provider === 'EXTERNAL' ? v.joinUrl.trim() || null : null });
    const errs = parsed.success ? {} : zodErrors(parsed.error.issues);
    if (!v.classArmId) errs.classArmId = 'Choose a class';
    if (!v.subjectId) errs.subjectId = 'Choose a subject';
    setErrors(errs);
    if (!parsed.success || Object.keys(errs).length) return;
    run.mutate(parsed.data, { onSuccess: setResult, onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        {result ? (
          <>
            <DialogHeader>
              <div className={cn('mb-2 grid size-10 place-items-center rounded-xl', result.created ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
                {result.created ? <CheckCircle2 className="size-5" /> : <Info className="size-5" />}
              </div>
              <DialogTitle>{result.created ? `${result.created} live ${result.created === 1 ? 'class' : 'classes'} scheduled` : 'Nothing new to schedule'}</DialogTitle>
              <DialogDescription>
                {result.created ? 'One for each timetabled lesson in those dates — double lessons are one session.' : 'Every lesson in those dates was skipped.'}
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              {result.skipped.length > 0 && (
                <div className="rounded-xl border border-border">
                  <p className="border-b border-border px-3.5 py-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Skipped ({result.skipped.length})</p>
                  <ul className="scrollbar-thin max-h-56 divide-y divide-border overflow-y-auto text-[12.5px]">
                    {result.skipped.map((s, i) => (
                      <li key={i} className="break-words px-3.5 py-2">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
            <DialogHeader>
              <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
                <CalendarRange className="size-5" />
              </div>
              <DialogTitle>Schedule from the timetable</DialogTitle>
              <DialogDescription>Creates a live class for every lesson of this subject on the published timetable, in the dates you choose.</DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <Field label="Class" htmlFor="tt-arm" error={errors.classArmId}>
                  <Select value={v.classArmId || undefined} onValueChange={(classArmId) => set({ classArmId })}>
                    <SelectTrigger id="tt-arm" invalid={!!errors.classArmId}>
                      <SelectValue placeholder="Choose a class" />
                    </SelectTrigger>
                    <SelectContent>
                      {arms.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Subject" htmlFor="tt-subject" error={errors.subjectId}>
                  <Select value={v.subjectId || undefined} onValueChange={(subjectId) => set({ subjectId })}>
                    <SelectTrigger id="tt-subject" invalid={!!errors.subjectId}>
                      <SelectValue placeholder="Choose a subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="From" htmlFor="tt-from" error={errors.from}>
                  <Input id="tt-from" type="date" value={v.from} min={schoolToday(tz)} onChange={(e) => set({ from: e.target.value })} className={dateInput} invalid={!!errors.from} />
                </Field>
                <Field label="To" htmlFor="tt-to" error={errors.to} hint="Up to ten weeks at a time.">
                  <Input id="tt-to" type="date" value={v.to} min={v.from} onChange={(e) => set({ to: e.target.value })} className={dateInput} invalid={!!errors.to} />
                </Field>
                <Field label="Meeting service" htmlFor="tt-provider" error={errors.provider} hint={<ProviderHint integrations={integrations.data} />}>
                  <ProviderSelect id="tt-provider" value={v.provider} onChange={(provider) => set({ provider })} integrations={integrations.data} />
                </Field>
                {v.provider === 'EXTERNAL' && (
                  <Field label="Meeting link" htmlFor="tt-url" error={errors.joinUrl} hint="Used for every session.">
                    <Input id="tt-url" type="url" inputMode="url" value={v.joinUrl} onChange={(e) => set({ joinUrl: e.target.value })} placeholder="https://" invalid={!!errors.joinUrl} />
                  </Field>
                )}
              </div>
              <FormError message={errors.form} />
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={run.isPending}>
                {run.isPending ? 'Creating meetings…' : 'Schedule classes'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SettingsLink() {
  return (
    <Tip label="Live class settings">
      <Button asChild variant="ghost" size="icon" aria-label="Live class settings">
        <Link to="/live/settings">
          <Settings2 />
        </Link>
      </Button>
    </Tip>
  );
}
