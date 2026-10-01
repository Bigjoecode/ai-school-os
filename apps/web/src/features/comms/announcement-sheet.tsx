import { ANNOUNCEMENT_AUDIENCES, type AnnouncementAudience, type AnnouncementRow, announcementSchema, type Channel, CHANNEL_LABELS, CHANNELS } from '@aischool/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { useStructure } from '../academics/api';
import { apiFieldErrors, dateInput, FormError, toLocalInput, zodErrors } from '../operations/ui';
import { useChannels, useSaveAnnouncement } from './api';
import { ANNOUNCEMENT_AUDIENCE_LABELS, CHANNEL_ICON } from './ui';

/** Multi-select of class arms, grouped by level (needs academics.read; otherwise shows what's chosen). */
export function ClassArmPicker({ value, onChange, names = [] }: { value: string[]; onChange: (ids: string[]) => void; names?: string[] }) {
  const can = useCan('academics.read');
  const s = useStructure();
  if (!can) return <p className="text-[12.5px] text-muted-foreground">{names.length ? names.join(', ') : 'All classes'}</p>;
  if (s.isLoading) return <p className="text-[12.5px] text-muted-foreground">Loading classes…</p>;
  const levels = [...(s.data?.classLevels ?? [])].sort((a, b) => a.order - b.order);
  if (!levels.length) return <p className="text-[12.5px] text-muted-foreground">No classes set up yet.</p>;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border border-border p-3 scrollbar-thin">
      {levels.map((l) => {
        const all = l.arms.length > 0 && l.arms.every((a) => value.includes(a.id));
        return (
          <div key={l.id} className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-pressed={all}
              onClick={() => onChange(all ? value.filter((x) => !l.arms.some((a) => a.id === x)) : [...new Set([...value, ...l.arms.map((a) => a.id)])])}
              className="mr-1 w-16 shrink-0 truncate text-left text-[12px] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {l.name}
            </button>
            {l.arms.map((a) => {
              const on = value.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${l.name} ${a.name}`}
                  onClick={() => toggle(a.id)}
                  className={cn(
                    'inline-flex h-7 min-w-8 items-center justify-center rounded-full border px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-card hover:bg-muted/50',
                  )}
                >
                  {a.name}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

interface Values {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  classArmIds: string[];
  pinned: boolean;
  publishAt: string;
  expiresAt: string;
  notify: Channel[];
}

const blank: Values = { title: '', body: '', audience: 'EVERYONE', classArmIds: [], pinned: false, publishAt: '', expiresAt: '', notify: [] };

export function AnnouncementSheet({ open, onOpenChange, announcement }: { open: boolean; onOpenChange: (o: boolean) => void; announcement?: AnnouncementRow | null }) {
  const save = useSaveAnnouncement();
  const canSend = useCan('comms.send');
  const channels = useChannels();
  const [v, setV] = useState<Values>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<Values>) => setV((p) => ({ ...p, ...patch }));

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setV(
      announcement
        ? {
            title: announcement.title,
            body: announcement.body,
            audience: announcement.audience,
            classArmIds: announcement.classArmIds,
            pinned: announcement.pinned,
            publishAt: announcement.state === 'SCHEDULED' ? toLocalInput(new Date(announcement.publishAt)) : '',
            expiresAt: announcement.expiresAt ? toLocalInput(new Date(announcement.expiresAt)) : '',
            notify: [],
          }
        : blank,
    );
  }, [open, announcement]);

  const later = !!v.publishAt && new Date(v.publishAt).getTime() > Date.now() + 60_000;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const input = {
      ...v,
      classArmIds: v.audience === 'STAFF' ? [] : v.classArmIds,
      publishAt: v.publishAt ? new Date(v.publishAt).toISOString() : announcement && announcement.state !== 'SCHEDULED' ? announcement.publishAt : null,
      expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null,
      notify: announcement ? [] : v.notify,
    };
    const parsed = announcementSchema.safeParse(input);
    const next = parsed.success ? {} : zodErrors(parsed.error.issues);
    if (v.expiresAt && new Date(v.expiresAt).getTime() <= (v.publishAt ? new Date(v.publishAt).getTime() : Date.now())) next.expiresAt = 'It should come down after it goes up';
    if (later && input.notify.length) next.notify = 'Notifications go out straight away — post it now, or leave these unticked';
    setErrors(next);
    if (!parsed.success || Object.keys(next).length) return;
    save.mutate({ id: announcement?.id, input: parsed.data }, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">{announcement ? 'Edit announcement' : 'Post an announcement'}</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">It appears on the noticeboard for the people you choose.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="ann-form" onSubmit={submit} noValidate className="grid gap-4">
            <Field label="Title" htmlFor="ann-title" error={errors.title}>
              <Input id="ann-title" value={v.title} onChange={(e) => set({ title: e.target.value })} maxLength={160} placeholder="e.g. Mid-term break dates" invalid={!!errors.title} autoFocus />
            </Field>
            <Field label="Announcement" htmlFor="ann-body" error={errors.body}>
              <Textarea id="ann-body" rows={7} value={v.body} onChange={(e) => set({ body: e.target.value })} maxLength={5000} invalid={!!errors.body} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="Who can see it" htmlFor="ann-aud">
                <Select value={v.audience} onValueChange={(a) => set({ audience: a as AnnouncementAudience })}>
                  <SelectTrigger id="ann-aud">
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
              <label className="flex cursor-pointer items-center justify-between gap-3 self-end rounded-lg border border-border bg-muted/30 px-3 py-2">
                <span className="text-[13px] font-medium">Pin to the top</span>
                <Switch checked={v.pinned} onCheckedChange={(pinned) => set({ pinned })} aria-label="Pin to the top" />
              </label>
            </div>
            {v.audience !== 'STAFF' && (
              <div className="grid gap-1.5">
                <Label>Only some classes?</Label>
                <p className="text-[12px] text-muted-foreground">{v.classArmIds.length ? 'Only parents and students of these classes see it (staff see everything).' : 'Leave empty for every class.'}</p>
                <ClassArmPicker value={v.classArmIds} onChange={(classArmIds) => set({ classArmIds })} names={announcement?.classes} />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="Publish" htmlFor="ann-pub" optional hint={v.publishAt ? undefined : 'Straight away'} error={errors.publishAt}>
                <Input id="ann-pub" type="datetime-local" value={v.publishAt} onChange={(e) => set({ publishAt: e.target.value })} className={dateInput} />
              </Field>
              <Field label="Take down" htmlFor="ann-exp" optional hint={v.expiresAt ? undefined : 'Stays up until removed'} error={errors.expiresAt}>
                <Input id="ann-exp" type="datetime-local" value={v.expiresAt} onChange={(e) => set({ expiresAt: e.target.value })} className={dateInput} invalid={!!errors.expiresAt} />
              </Field>
            </div>
            {canSend && !announcement && (
              <fieldset className="grid gap-2 rounded-xl border border-border p-3.5">
                <legend className="px-1 text-[13px] font-medium">Also notify by</legend>
                <p className="text-[12px] text-muted-foreground">Sends it as a message to the matching parents and/or staff right away. Leave empty to just post it.</p>
                <div className="grid gap-1.5 sm:grid-cols-2 [&>*]:min-w-0">
                  {CHANNELS.map((c) => {
                    const Icon = CHANNEL_ICON[c];
                    const ready = channels.data?.find((x) => x.channel === c)?.configured ?? c === 'IN_APP';
                    return (
                      <label key={c} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50">
                        <Checkbox checked={v.notify.includes(c)} onCheckedChange={(on) => set({ notify: on ? [...v.notify, c] : v.notify.filter((x) => x !== c) })} />
                        <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                        <span className="text-[13px]">{CHANNEL_LABELS[c]}</span>
                        {!ready && <span className="ml-auto text-[11px] text-warning">Not set up</span>}
                      </label>
                    );
                  })}
                </div>
                {errors.notify && (
                  <p role="alert" className="text-[12px] font-medium text-danger">
                    {errors.notify}
                  </p>
                )}
              </fieldset>
            )}
            <FormError message={errors.form} />
          </form>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="ann-form" loading={save.isPending}>
            {announcement ? 'Save changes' : later ? 'Schedule' : v.notify.length ? 'Post and notify' : 'Post'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
