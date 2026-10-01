import {
  ANNOUNCEMENT_AUDIENCES,
  type AnnouncementAudience,
  EVENT_CATEGORIES,
  EVENT_CATEGORY_LABELS,
  type EventCategory,
  type EventRow,
  eventSchema,
} from '@aischool/shared';
import { BellRing, CalendarDays, Clock, MapPin, Pencil, Smartphone, Trash2, Users } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCan } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { CopyButton } from '../finance/ui';
import { apiFieldErrors, dateInput, FormError, zodErrors } from '../operations/ui';
import { ClassArmPicker } from './announcement-sheet';
import { useDeleteEvent, useFeedLink, useSaveEvent } from './api';
import { ANNOUNCEMENT_AUDIENCE_LABELS, categoryStyle, CATEGORY_COLOR, eventWhen } from './ui';

// ------------------------------------------------------------------ detail

export function EventDetailSheet({ event, onOpenChange, onEdit }: { event: EventRow | null; onOpenChange: (o: boolean) => void; onEdit: (e: EventRow) => void }) {
  const canManage = useCan('events.manage');
  const del = useDeleteEvent();
  const [deleting, setDeleting] = useState(false);
  const e = event;
  return (
    <Sheet open={!!event} onOpenChange={onOpenChange}>
      <SheetContent>
        {e && (
          <>
            <SheetHeader>
              <span className="inline-flex w-fit rounded-full border px-2 text-[11px] font-medium leading-5" style={categoryStyle(e.category)}>
                {EVENT_CATEGORY_LABELS[e.category]}
              </span>
              <SheetTitle className="mt-1 break-words font-display text-xl font-semibold tracking-tight">{e.title}</SheetTitle>
              <SheetDescription className="text-[13px] text-muted-foreground">{eventWhen(e)}</SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-4">
              <dl className="grid gap-3 text-[13.5px]">
                <Row icon={<CalendarDays />} label="When">
                  {formatDate(e.startDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  {e.endDate && e.endDate !== e.startDate && ` – ${formatDate(e.endDate, { weekday: 'long', day: 'numeric', month: 'long' })}`}
                </Row>
                <Row icon={<Clock />} label="Time">
                  {e.allDay || !e.startTime ? 'All day' : `${e.startTime}${e.endTime ? ` – ${e.endTime}` : ''}`}
                </Row>
                {e.location && (
                  <Row icon={<MapPin />} label="Where">
                    {e.location}
                  </Row>
                )}
                <Row icon={<Users />} label="For">
                  {ANNOUNCEMENT_AUDIENCE_LABELS[e.audience]}
                  {e.classes.length > 0 && ` · ${e.classes.join(', ')}`}
                </Row>
                {e.remindDaysBefore != null && (
                  <Row icon={<BellRing />} label="Reminder">
                    {e.remindDaysBefore === 0 ? 'On the day' : `${e.remindDaysBefore} day${e.remindDaysBefore === 1 ? '' : 's'} before`}
                    {e.reminderSentAt && <span className="text-muted-foreground"> · sent</span>}
                  </Row>
                )}
              </dl>
              {e.description && <p className="whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/30 px-3.5 py-3 text-[13.5px] leading-relaxed">{e.description}</p>}
            </SheetBody>
            {canManage && (
              <SheetFooter className="justify-between">
                <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setDeleting(true)}>
                  <Trash2 /> Remove
                </Button>
                <Button onClick={() => onEdit(e)}>
                  <Pencil /> Edit
                </Button>
              </SheetFooter>
            )}
            <ConfirmDialog
              open={deleting}
              onOpenChange={setDeleting}
              title={`Remove “${e.title}”?`}
              description="It comes off the calendar for everyone, including subscribed phones."
              confirmLabel="Remove event"
              loading={del.isPending}
              onConfirm={() =>
                del.mutate(e.id, {
                  onSuccess: () => {
                    setDeleting(false);
                    onOpenChange(false);
                  },
                })
              }
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="flex w-24 shrink-0 items-center gap-2 text-muted-foreground [&_svg]:size-4">
        {icon} {label}
      </dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

// ------------------------------------------------------------------ form

interface Values {
  title: string;
  description: string;
  category: EventCategory;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  audience: AnnouncementAudience;
  classArmIds: string[];
  remind: string;
}

export function EventFormSheet({ open, onOpenChange, event, defaultDate }: { open: boolean; onOpenChange: (o: boolean) => void; event?: EventRow | null; defaultDate?: string }) {
  const save = useSaveEvent();
  const [v, setV] = useState<Values | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<Values>) => setV((p) => (p ? { ...p, ...patch } : p));

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setV(
      event
        ? {
            title: event.title,
            description: event.description ?? '',
            category: event.category,
            allDay: event.allDay,
            startDate: event.startDate,
            startTime: event.startTime ?? '',
            endDate: event.endDate ?? '',
            endTime: event.endTime ?? '',
            location: event.location ?? '',
            audience: event.audience,
            classArmIds: event.classArmIds,
            remind: event.remindDaysBefore == null ? '' : String(event.remindDaysBefore),
          }
        : {
            title: '',
            description: '',
            category: 'OTHER',
            allDay: true,
            startDate: defaultDate ?? '',
            startTime: '',
            endDate: '',
            endTime: '',
            location: '',
            audience: 'EVERYONE',
            classArmIds: [],
            remind: '',
          },
    );
  }, [open, event, defaultDate]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!v) return;
    const input = {
      title: v.title,
      description: v.description.trim() || null,
      category: v.category,
      allDay: v.allDay,
      startDate: v.startDate,
      startTime: v.allDay ? null : v.startTime || null,
      endDate: v.endDate || null,
      endTime: v.allDay ? null : v.endTime || null,
      location: v.location.trim() || null,
      audience: v.audience,
      classArmIds: v.audience === 'STAFF' ? [] : v.classArmIds,
      remindDaysBefore: v.remind === '' ? null : Number(v.remind),
    };
    const parsed = eventSchema.safeParse(input);
    const next = parsed.success ? {} : zodErrors(parsed.error.issues);
    if (!v.startDate) next.startDate = 'Pick a date';
    if (!v.allDay && v.endTime && v.startTime && (!v.endDate || v.endDate === v.startDate) && v.endTime <= v.startTime) next.endTime = 'It should end after it starts';
    setErrors(next);
    if (!parsed.success || Object.keys(next).length) return;
    save.mutate({ id: event?.id, input: parsed.data }, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">{event ? 'Edit event' : 'Add an event'}</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">It shows on the calendar for the people you choose, and on phones that subscribe.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          {!v ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <form id="event-form" onSubmit={submit} noValidate className="grid gap-4">
              <Field label="Title" htmlFor="ev-title" error={errors.title}>
                <Input id="ev-title" value={v.title} onChange={(e) => set({ title: e.target.value })} maxLength={160} placeholder="e.g. Inter-house sports" invalid={!!errors.title} autoFocus />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                <Field label="Category" htmlFor="ev-cat">
                  <Select value={v.category} onValueChange={(c) => set({ category: c as EventCategory })}>
                    <SelectTrigger id="ev-cat">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          <span className="inline-flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ background: CATEGORY_COLOR[c] }} aria-hidden /> {EVENT_CATEGORY_LABELS[c]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <label className="flex cursor-pointer items-center justify-between gap-3 self-end rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <span className="text-[13px] font-medium">All day</span>
                  <Switch checked={v.allDay} onCheckedChange={(allDay) => set({ allDay })} aria-label="All day" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                <Field label={v.allDay ? 'From' : 'Starts'} htmlFor="ev-start" error={errors.startDate}>
                  <Input id="ev-start" type="date" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} className={dateInput} invalid={!!errors.startDate} />
                </Field>
                {!v.allDay ? (
                  <Field label="At" htmlFor="ev-stime" error={errors.startTime}>
                    <Input id="ev-stime" type="time" value={v.startTime} onChange={(e) => set({ startTime: e.target.value })} className={dateInput} invalid={!!errors.startTime} />
                  </Field>
                ) : (
                  <Field label="To" htmlFor="ev-end" optional error={errors.endDate}>
                    <Input id="ev-end" type="date" value={v.endDate} min={v.startDate} onChange={(e) => set({ endDate: e.target.value })} className={dateInput} invalid={!!errors.endDate} />
                  </Field>
                )}
                {!v.allDay && (
                  <>
                    <Field label="Ends" htmlFor="ev-end" optional hint={v.endDate ? undefined : 'Same day'} error={errors.endDate}>
                      <Input id="ev-end" type="date" value={v.endDate} min={v.startDate} onChange={(e) => set({ endDate: e.target.value })} className={dateInput} invalid={!!errors.endDate} />
                    </Field>
                    <Field label="At" htmlFor="ev-etime" optional error={errors.endTime}>
                      <Input id="ev-etime" type="time" value={v.endTime} onChange={(e) => set({ endTime: e.target.value })} className={dateInput} invalid={!!errors.endTime} />
                    </Field>
                  </>
                )}
              </div>
              <Field label="Where" htmlFor="ev-loc" optional>
                <Input id="ev-loc" value={v.location} onChange={(e) => set({ location: e.target.value })} maxLength={160} placeholder="e.g. School field" />
              </Field>
              <Field label="Details" htmlFor="ev-desc" optional>
                <Textarea id="ev-desc" rows={4} value={v.description} onChange={(e) => set({ description: e.target.value })} maxLength={3000} placeholder="What to bring, dress code, who to contact…" />
              </Field>
              <Field label="Who it’s for" htmlFor="ev-aud">
                <Select value={v.audience} onValueChange={(a) => set({ audience: a as AnnouncementAudience })}>
                  <SelectTrigger id="ev-aud">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANNOUNCEMENT_AUDIENCES.map((a) => (
                      <SelectItem key={a} value={a}>
                        {ANNOUNCEMENT_AUDIENCE_LABELS[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {v.audience !== 'STAFF' && (
                <div className="grid gap-1.5">
                  <Label>Only some classes?</Label>
                  <ClassArmPicker value={v.classArmIds} onChange={(classArmIds) => set({ classArmIds })} names={event?.classes} />
                </div>
              )}
              <div className="grid gap-2 rounded-xl border border-border bg-muted/20 p-3.5">
                <div className="flex items-center gap-3">
                  <Label htmlFor="ev-remind" className="min-w-0 flex-1">
                    Remind parents
                  </Label>
                  <Input
                    id="ev-remind"
                    inputMode="numeric"
                    value={v.remind}
                    onChange={(e) => set({ remind: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                    placeholder="—"
                    className="w-16 text-center tabular"
                    invalid={!!errors.remindDaysBefore}
                    aria-describedby="ev-remind-hint"
                  />
                  <span className="text-[13px] text-muted-foreground">days before</span>
                </div>
                <p id="ev-remind-hint" className="text-[12px] text-muted-foreground">
                  {errors.remindDaysBefore ? (
                    <span className="font-medium text-danger">{errors.remindDaysBefore}</span>
                  ) : (
                    <>
                      Leave empty for no reminder; 0 reminds on the morning of the day. Reminders go by the channels set in{' '}
                      <Link to="/messages/settings?tab=automations" className="font-medium text-brand hover:underline">
                        Messages → Settings → Automations
                      </Link>
                      .
                    </>
                  )}
                </p>
              </div>
              <FormError message={errors.form} />
            </form>
          )}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="event-form" loading={save.isPending}>
            {event ? 'Save changes' : 'Add to calendar'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ------------------------------------------------------------------ subscribe

export function SubscribeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const q = useFeedLink(open);
  const url = q.data ? `${window.location.origin}${q.data.path}` : '';
  const webcal = url.replace(/^https?:/, 'webcal:');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
            <CalendarDays className="size-5" />
          </div>
          <DialogTitle>Put the school calendar on your phone</DialogTitle>
          <DialogDescription>Subscribe once and new events appear by themselves. This link is private to you — don’t share it.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {q.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : q.error ? (
            <FormError message="Couldn’t create your calendar link. Try again in a moment." />
          ) : (
            <>
              <div className="flex gap-2">
                <Input readOnly value={url} aria-label="Calendar subscription link" className="min-w-0 flex-1 font-mono text-[12px]" onFocus={(e) => e.currentTarget.select()} />
                <CopyButton text={url} label="calendar link" variant="outline" size="default" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 [&>*]:min-w-0">
                <Button asChild variant="outline">
                  <a href={webcal}>
                    <Smartphone /> iPhone / Mac
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener noreferrer">
                    <CalendarDays /> Google Calendar
                  </a>
                </Button>
              </div>
              <ul className="space-y-1.5 text-[12.5px] text-muted-foreground">
                <li>
                  <strong className="font-medium text-foreground">iPhone:</strong> tap “iPhone / Mac” and choose Subscribe.
                </li>
                <li>
                  <strong className="font-medium text-foreground">Google Calendar / Android:</strong> on a computer, open Google Calendar → Other calendars → + → From URL, and paste the link. It syncs to your phone.
                </li>
                <li>
                  <strong className="font-medium text-foreground">Outlook:</strong> Add calendar → Subscribe from web, and paste the link.
                </li>
              </ul>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
