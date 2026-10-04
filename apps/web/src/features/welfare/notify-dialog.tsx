import { Send } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useState } from 'react';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Textarea } from '@/components/ui/textarea';
import { NotifyParents, type NotifyChannel } from './ui';

/** Tell a student's parents about a record after it was saved. */
export function NotifyDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  onSend,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  pending?: boolean;
  onSend: (input: { channels: NotifyChannel[]; message: string | null }) => void;
}) {
  const [channels, setChannels] = useState<NotifyChannel[]>(['IN_APP', 'PUSH']);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (open) {
      setChannels(['IN_APP', 'PUSH']);
      setMessage('');
    }
  }, [open]);
  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    onSend({ channels: channels.length ? channels : ['IN_APP'], message: message.trim() || null });
  };
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={title} description={description} icon={<Send />} submitLabel="Send to parents" pending={pending} onSubmit={submit}>
      <div className="grid gap-4">
        <NotifyParents fixed on onToggle={() => undefined} channels={channels} onChannels={setChannels} label="Channels" description="The school’s standard, respectful wording is used." />
        <Field label="Add a personal note" htmlFor="nt-msg" optional>
          <Textarea id="nt-msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} placeholder="e.g. Please call the school office on Monday morning." />
        </Field>
      </div>
    </FormDialog>
  );
}
