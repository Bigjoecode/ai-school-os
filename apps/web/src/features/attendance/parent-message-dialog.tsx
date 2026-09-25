import type { AbsenceMessage } from '@aischool/shared';
import { Check, Copy, Info, Mail, MessageSquareText, Phone, RotateCw, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { aiErrorMessage, useAbsenceMessage } from './api';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure origins: fall back to a hidden textarea.
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-[12px]"
      aria-label={`Copy ${label}`}
      onClick={() =>
        void copyText(text).then((ok) => {
          if (ok) setCopied(true);
          else toast.error('Couldn’t copy — select the text and copy it manually.');
        })
      }
    >
      {copied ? <Check className="text-success" /> : <Copy />} {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  termId?: string;
}

/** Drafts a caring note to a learner's parent about absences. Nothing is ever sent from here. */
export function ParentMessageDialog({ open, onOpenChange, studentId, studentName, termId }: Props) {
  const draft = useAbsenceMessage();
  const [msg, setMsg] = useState<AbsenceMessage | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sms, setSms] = useState('');
  const started = useRef<string | null>(null);

  const run = () =>
    draft.mutate(
      { studentId, termId },
      {
        onSuccess: (m) => {
          setMsg(m);
          setSubject(m.subject);
          setBody(m.message);
          setSms(m.smsVersion);
        },
      },
    );

  // Draft once per opening for this learner.
  useEffect(() => {
    if (!open) {
      started.current = null;
      return;
    }
    const key = `${studentId}:${termId ?? ''}`;
    if (started.current === key) return;
    started.current = key;
    setMsg(null);
    draft.reset();
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, studentId, termId]);

  const g = msg?.guardian;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="ai-border border-transparent">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-ai-2/15 blur-3xl" />
        <DialogHeader className="relative">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ai-gradient shadow-[0_6px_20px_-6px_var(--ai-2)]">
              <AiSparkle className="size-[18px] [&_path]:fill-white" animated={draft.isPending} />
            </span>
            <div className="min-w-0">
              <DialogTitle>
                <span className="text-ai-gradient">Draft a message</span> to {studentName.split(' ')[0]}’s parent
              </DialogTitle>
              <DialogDescription className="mt-0.5">A warm, factual note about recent absences, written from this term’s register.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="relative space-y-4">
          <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft/60 px-3 py-2.5 text-[12.5px] text-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            <span>
              <strong className="font-semibold">Draft only — review before sending.</strong> Nothing is sent from here. Messaging arrives with Communication.
            </span>
          </p>

          {draft.isPending && !msg ? (
            <div className="space-y-4" aria-busy aria-live="polite">
              <p className="text-[12.5px] text-muted-foreground">Reading the register and writing a draft… this takes 10–30 seconds.</p>
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : draft.isError && !msg ? (
            <EmptyState
              compact
              icon={MessageSquareText}
              tone="danger"
              title="Couldn’t draft the message"
              description={aiErrorMessage(draft.error)}
              action={
                <Button variant="outline" size="sm" onClick={run}>
                  <RotateCw /> Try again
                </Button>
              }
            />
          ) : msg ? (
            <div className={cn('space-y-4 transition-opacity', draft.isPending && 'opacity-50')}>
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                {g ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <UserRound className="size-3.5 text-muted-foreground" aria-hidden /> {g.name}
                    </span>
                    <a href={`tel:${g.phone}`} className="inline-flex items-center gap-1.5 text-brand hover:underline">
                      <Phone className="size-3.5" aria-hidden /> {g.phone}
                    </a>
                    {g.email ? (
                      <a href={`mailto:${g.email}`} className="inline-flex min-w-0 items-center gap-1.5 truncate text-brand hover:underline">
                        <Mail className="size-3.5" aria-hidden /> {g.email}
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="size-3.5" aria-hidden /> No email on record
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-[13px] text-warning">No guardian on record for {studentName}. Add one from the Parents page before reaching out.</p>
                )}
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pm-subject">Email subject</Label>
                  <CopyButton text={subject} label="subject" />
                </div>
                <Input id="pm-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pm-body">Email message</Label>
                  <CopyButton text={body} label="email message" />
                </div>
                <Textarea id="pm-body" rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pm-sms" className="flex items-center gap-2">
                    SMS version
                    <span className={cn('text-[11px] font-normal tabular', sms.length > 160 ? 'text-warning' : 'text-muted-foreground')}>
                      {sms.length}/160
                    </span>
                  </Label>
                  <CopyButton text={sms} label="SMS" />
                </div>
                <Textarea id="pm-sms" rows={3} value={sms} onChange={(e) => setSms(e.target.value)} />
              </div>

              <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <AiSparkle className="size-3" animated={false} /> Drafted by {msg.provider} · {msg.model}. Check the facts before you send it.
              </p>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter className="relative">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {msg && (
            <Button variant="ai" onClick={run} loading={draft.isPending}>
              {!draft.isPending && <RotateCw />} Redraft
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
