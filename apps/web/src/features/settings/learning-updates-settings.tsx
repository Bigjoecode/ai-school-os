import { DEFAULT_LEARNING_UPDATE_SETTINGS, type LearningUpdatePreview, type LearningUpdateSendResult, type LearningUpdateSettings, type LearningUpdateStatus } from '@aischool/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Save, Send, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { useClassOptions } from '../attendance/classes';
import { StudentPicker, type PickedStudent } from '../students/student-picker';

/**
 * Settings → Parent & student portal → Weekly learning update: on/off, when
 * it goes (school time), which channels, plus "preview for a student" and
 * "send now to a class" for trying it out.
 */

const key = ['learning-updates', 'status'] as const;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function LearningUpdatesSettings() {
  const canManage = useCan('school.manage');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => api.get<LearningUpdateStatus>('/learning-updates/status', undefined, signal) });
  const save = useMutation({
    mutationFn: (body: LearningUpdateSettings) => api.put<LearningUpdateSettings>('/learning-updates/settings', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      toast.success('Learning update settings saved');
    },
  });
  const [v, setV] = useState<LearningUpdateSettings>(DEFAULT_LEARNING_UPDATE_SETTINGS);
  useEffect(() => {
    if (q.data) setV(q.data.settings);
  }, [q.data]);

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96 rounded-2xl" />;
  const st = q.data;
  const dirty = JSON.stringify(v) !== JSON.stringify(st.settings);
  const set = (patch: Partial<LearningUpdateSettings>) => setV((x) => ({ ...x, ...patch }));
  const row = cn('flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3', canManage && 'cursor-pointer');

  return (
    <div className="space-y-4">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ ...v, whatsappTemplate: v.whatsappTemplate?.trim() || null });
        }}
      >
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-brand" aria-hidden /> Weekly learning update
              </CardTitle>
              <CardDescription>
                Every week each parent gets “How their child is learning”: topics going well, topics improving, topics needing attention, homework and attendance in one line, and one practical suggestion. Built only from real
                records. Parents can turn it off.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <fieldset disabled={!canManage || save.isPending} className="space-y-2.5">
              <label className={row}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">Send weekly learning updates</span>
                  <span className="block text-[12px] text-muted-foreground">
                    This week: {st.sent} sent{st.skipped ? `, ${st.skipped} skipped` : ''} of {st.activeStudents} students.
                  </span>
                </span>
                <Switch checked={v.enabled} onCheckedChange={(on) => set({ enabled: on })} aria-label="Send weekly learning updates" />
              </label>

              <div className="grid gap-3 rounded-xl border border-border px-4 py-3 sm:grid-cols-2">
                <Field label="Day" htmlFor="lu-day">
                  <Select value={String(v.day)} onValueChange={(d) => set({ day: Number(d) })}>
                    <SelectTrigger id="lu-day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d, i) => (
                        <SelectItem key={d} value={String(i + 1)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Time (school time)" htmlFor="lu-time">
                  <Input id="lu-time" type="time" value={v.time} onChange={(e) => set({ time: e.target.value })} />
                </Field>
                <p className="text-[12px] text-muted-foreground sm:col-span-2">If the server is asleep at that moment, the updates go out as soon as it wakes, up to the end of that week.</p>
              </div>

              <div className="rounded-xl border border-border px-4 py-3">
                <p className="text-[13.5px] font-medium">How parents get it</p>
                <p className="text-[12px] text-muted-foreground">In the app and as a push notification, always. Emails and texts include a link to stop the updates.</p>
                <div className="mt-2 space-y-2">
                  <label className={cn('flex items-center gap-3', canManage && 'cursor-pointer')}>
                    <span className="min-w-0 flex-1 text-[13px]">
                      Email {!st.channels.email && <Badge variant="outline">Not set up</Badge>}
                    </span>
                    <Switch checked={v.email} onCheckedChange={(on) => set({ email: on })} aria-label="Send by email" />
                  </label>
                  <label className={cn('flex items-center gap-3', canManage && 'cursor-pointer')}>
                    <span className="min-w-0 flex-1 text-[13px]">
                      SMS <span className="text-muted-foreground">(costs money: about 3–4 pages per parent per week)</span> {!st.channels.sms && <Badge variant="outline">Not set up</Badge>}
                    </span>
                    <Switch checked={v.sms} onCheckedChange={(on) => set({ sms: on })} aria-label="Send by SMS" />
                  </label>
                  <Field
                    label="WhatsApp template"
                    htmlFor="lu-wa"
                    optional
                    hint={
                      st.channels.whatsapp
                        ? 'An approved template with {{1}} = school name and {{2}} = the message. Leave empty to skip WhatsApp.'
                        : 'Connect WhatsApp in Messages → Channels first. Without an approved template, WhatsApp is skipped.'
                    }
                  >
                    <Input id="lu-wa" placeholder="weekly_learning_update" value={v.whatsappTemplate ?? ''} onChange={(e) => set({ whatsappTemplate: e.target.value })} />
                  </Field>
                </div>
              </div>

              <div className="grid gap-3 rounded-xl border border-border px-4 py-3 sm:grid-cols-2">
                <Field label="A week with no practice on the app" htmlFor="lu-quiet">
                  <Select value={v.quietWeeks} onValueChange={(q) => set({ quietWeeks: q as LearningUpdateSettings['quietWeeks'] })}>
                    <SelectTrigger id="lu-quiet">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SHORT">Send a short note (homework and attendance)</SelectItem>
                      <SelectItem value="SKIP">Don’t send that week</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="space-y-2 pt-1">
                  <label className={cn('flex items-center gap-3', canManage && 'cursor-pointer')}>
                    <span className="min-w-0 flex-1 text-[13px]">Word the suggestion with AI (uses your AI allowance)</span>
                    <Switch checked={v.useAi} onCheckedChange={(on) => set({ useAi: on })} aria-label="Word the suggestion with AI" />
                  </label>
                  <label className={cn('flex items-center gap-3', canManage && 'cursor-pointer')}>
                    <span className="min-w-0 flex-1 text-[13px]">Students see their own update in the app</span>
                    <Switch checked={v.students} onCheckedChange={(on) => set({ students: on })} aria-label="Students see their own update" />
                  </label>
                </div>
              </div>
            </fieldset>
          </CardContent>
          {canManage && (
            <CardFooter className="justify-end">
              <Button type="button" variant="ghost" disabled={!dirty || save.isPending} onClick={() => setV(st.settings)}>
                Discard
              </Button>
              <Button type="submit" loading={save.isPending} disabled={!dirty}>
                <Save /> Save changes
              </Button>
            </CardFooter>
          )}
        </Card>
      </form>
      <TryItOut canManage={canManage} />
    </div>
  );
}

function TryItOut({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<PickedStudent[]>([]);
  const [classArmId, setClassArmId] = useState('');
  const { options } = useClassOptions();
  const student = picked.at(-1) ?? null;
  const preview = useMutation({ mutationFn: (studentId: string) => api.get<LearningUpdatePreview>('/learning-updates/preview', { studentId }) });
  const send = useMutation({
    mutationFn: (body: { classArmId?: string; studentId?: string }) => api.post<LearningUpdateSendResult>('/learning-updates/send-now', body),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: key });
      toast.success(`Sent ${r.sent} update${r.sent === 1 ? '' : 's'} to ${r.recipients} parent${r.recipients === 1 ? '' : 's'}${r.alreadySent ? ` (${r.alreadySent} already sent this week)` : ''}${r.skipped ? `, ${r.skipped} skipped` : ''}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const p = preview.data;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Try it out</CardTitle>
          <CardDescription>See this week’s update for a student before it goes out. “Send now” sends this week’s update straight away (once per student per week; parents who opted out are skipped).</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Student" htmlFor="lu-student">
          <StudentPicker id="lu-student" value={student ? [student] : []} onChange={(v) => setPicked(v.slice(-1))} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!student} loading={preview.isPending} onClick={() => student && preview.mutate(student.id)}>
            <Eye /> Preview this week’s update
          </Button>
          {canManage && (
            <Button type="button" variant="outline" disabled={!student || send.isPending} onClick={() => student && send.mutate({ studentId: student.id })}>
              <Send /> Send now to this student
            </Button>
          )}
        </div>
        {preview.error && <p className="text-[13px] text-danger">{errorMessage(preview.error)}</p>}
        {p && (
          <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={p.source === 'AI' ? 'ai' : 'secondary'}>{p.source === 'AI' ? 'Suggestion worded by AI' : 'Rules-based suggestion'}</Badge>
              {p.alreadySent && <Badge variant="success">Already sent this week</Badge>}
              <span className="text-[12px] text-muted-foreground">{p.text.length} characters</span>
            </div>
            <pre className="whitespace-pre-wrap break-words font-sans text-[13.5px] leading-relaxed">{p.text}</pre>
            <div>
              <p className="text-[12px] font-medium text-muted-foreground">The student sees</p>
              <p className="text-[13px]">{p.content.studentText}</p>
            </div>
            <div>
              <p className="text-[12px] font-medium text-muted-foreground">Who gets it</p>
              {p.recipients.length === 0 ? (
                <p className="text-[13px]">No parent is linked to this student.</p>
              ) : (
                <ul className="text-[13px]">
                  {p.recipients.map((r) => (
                    <li key={r.name}>
                      {r.name}: {r.optedOut ? 'turned these updates off' : r.channels.join(', ') || r.note}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {canManage && (
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <Field label="Send now to a whole class" htmlFor="lu-class" className="min-w-56 flex-1">
              <Select value={classArmId} onValueChange={setClassArmId}>
                <SelectTrigger id="lu-class">
                  <SelectValue placeholder="Choose a class" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button type="button" disabled={!classArmId} loading={send.isPending} onClick={() => send.mutate({ classArmId })}>
              <Send /> Send now to this class
            </Button>
          </div>
        )}
        <p className="text-[12px] text-muted-foreground">
          Sent messages appear in{' '}
          <Link to="/messages" className="font-medium text-brand hover:underline">
            Messages
          </Link>{' '}
          as “Weekly learning updates”, with delivery status and SMS costs.
        </p>
      </CardContent>
    </Card>
  );
}
