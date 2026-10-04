import type { AlumniFilter } from '@aischool/shared';
import { Mail, MessageSquareText, Send } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { useMessageAlumni } from './api';

type Ch = 'SMS' | 'EMAIL';

/** SMS and/or email to the alumni matching the directory's filters who agreed to be contacted. */
export function MessageDialog({ open, onOpenChange, filter, ids, audienceLabel }: { open: boolean; onOpenChange: (o: boolean) => void; filter: AlumniFilter; ids?: string[]; audienceLabel: string }) {
  const send = useMessageAlumni();
  const count = useMessageAlumni();
  const navigate = useNavigate();
  const canSeeMessages = useCan('comms.read');
  const [channels, setChannels] = useState<Ch[]>(['EMAIL', 'SMS']);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sms, setSms] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const reach = count.data;
  const filterKey = JSON.stringify(filter);
  const idsKey = ids?.join(',') ?? '';
  const channelsKey = channels.join(',');

  useEffect(() => {
    if (!open) return;
    setErrors({});
    count.mutate({ filter, ids: ids ?? [], channels: channels.length ? channels : ['EMAIL'], title: 'count', body: 'count only', dryRun: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, channelsKey, filterKey, idsKey]);

  const toggle = (c: Ch, on: boolean) => setChannels((x) => (on ? [...new Set([...x, c])] : x.filter((y) => y !== c)));
  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (!channels.length) errs.channels = 'Choose SMS, email or both';
    if (title.trim().length < 2) errs.title = 'Give the message a title';
    if (body.trim().length < 5) errs.body = 'Write the message';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    send.mutate(
      { filter, ids: ids ?? [], channels, title: title.trim(), subject: subject.trim() || null, body: body.trim(), sms: sms.trim() || null },
      {
        onSuccess: (r) => {
          toast.success(`Message on its way to ${r.recipients} alumni`, {
            description: r.notice ?? (canSeeMessages ? 'Follow delivery in Messages.' : undefined),
            action: r.broadcastId && canSeeMessages ? { label: 'View', onClick: () => void navigate(`/messages/${r.broadcastId}`) } : undefined,
          });
          onOpenChange(false);
          setTitle('');
          setSubject('');
          setBody('');
          setSms('');
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Message alumni"
      icon={<Send />}
      submitLabel={reach ? `Send to ${reach.recipients}` : 'Send'}
      pending={send.isPending}
      onSubmit={submit}
      description={
        <>
          To <span className="font-medium text-foreground">{audienceLabel}</span>
          {reach ? ` — ${reach.recipients} can be reached${reach.excluded ? `; ${reach.excluded} left out (not verified, no consent, or no address for these channels)` : ''}.` : '…'}
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Send by" error={errors.channels}>
          <div className="flex flex-wrap gap-4">
            {(
              [
                ['EMAIL', 'Email', Mail],
                ['SMS', 'SMS', MessageSquareText],
              ] as const
            ).map(([c, l, Icon]) => (
              <label key={c} className="flex cursor-pointer items-center gap-2 text-[13.5px]">
                <Checkbox checked={channels.includes(c)} onCheckedChange={(v) => toggle(c, v === true)} />
                <Icon className="size-4 text-muted-foreground" /> {l}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Title" htmlFor="am-title" error={errors.title} hint="Shown in Messages, and used as the email subject unless you set one">
          <Input id="am-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Class of 2016 ten-year reunion" />
        </Field>
        {channels.includes('EMAIL') && (
          <Field label="Email subject" htmlFor="am-subject" optional>
            <Input id="am-subject" value={subject} maxLength={160} onChange={(e) => setSubject(e.target.value)} />
          </Field>
        )}
        <Field label="Message" htmlFor="am-body" error={errors.body} hint="{{first_name}} and {{school}} are filled in for each person">
          <Textarea id="am-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder={'Dear {{first_name}},\n\nWe would love to welcome you back…'} />
        </Field>
        {channels.includes('SMS') && (
          <Field label="SMS version" htmlFor="am-sms" optional hint={`${sms.length}/480 · leave blank to send the message above`}>
            <Textarea id="am-sms" rows={2} maxLength={480} value={sms} onChange={(e) => setSms(e.target.value)} placeholder="{{school}}: Alumni reunion on Sat 12 Dec, 11am. Reply to RSVP." />
          </Field>
        )}
        <p className="text-[12px] text-muted-foreground">
          Sent through your school’s messaging, so it uses your SMS and email set-up.
          {canSeeMessages && (
            <>
              {' '}
              Delivery shows in{' '}
              <Link to="/messages" className="text-brand underline-offset-2 hover:underline">
                Messages
              </Link>
              .
            </>
          )}
        </p>
      </div>
    </FormDialog>
  );
}
