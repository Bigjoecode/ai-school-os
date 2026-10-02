import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketAssist,
  type TicketCategory,
  type TicketDetail,
  type TicketPriority,
  type TicketStatus,
} from '@aischool/shared';
import { ArrowLeft, Check, Lock, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { TicketThread } from '../support/thread';
import { usePlatformTicket, useTeam, useTicketAssist, useTicketReply, useTicketUpdate } from './api';
import { Facts, NeedsReply, PLATFORM_ROLE_LABEL, PRIORITY_LABEL, PriorityBadge, Section, TICKET_STATUS_LABEL, TicketStatusBadge } from './ui';

export default function PlatformTicketPage() {
  const { id = '' } = useParams();
  const q = usePlatformTicket(id);
  const t = q.data;
  useDocumentTitle(t ? `#${t.number} ${t.subject}` : 'Ticket');
  return (
    <Page>
      <Link to="/platform/support" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Support queue
      </Link>
      {q.error && !t ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : !t ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : (
        <TicketView t={t} />
      )}
    </Page>
  );
}

function TicketView({ t }: { t: TicketDetail }) {
  const reply = useTicketReply(t.id);
  const update = useTicketUpdate(t.id);
  const assist = useTicketAssist(t.id);
  const team = useTeam();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [after, setAfter] = useState<TicketStatus>('PENDING');
  const [suggestion, setSuggestion] = useState<TicketAssist | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const active = t.status === 'OPEN' || t.status === 'PENDING';

  // Follow new messages as they arrive, but don't jump on first load.
  const seen = useRef(t.thread.length);
  useEffect(() => {
    if (t.thread.length > seen.current) endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    seen.current = t.thread.length;
  }, [t.thread.length]);

  const send = () => {
    if (!body.trim()) return boxRef.current?.focus();
    reply.mutate(
      { body: body.trim(), internal, status: internal ? undefined : after },
      {
        onSuccess: () => {
          setBody('');
          toast.success(internal ? 'Internal note added' : 'Reply sent to the school');
        },
      },
    );
  };

  const runAssist = () =>
    assist.mutate(undefined, {
      onSuccess: (r) => {
        setSuggestion(r);
        if (!body.trim()) setBody(r.draftReply);
        setInternal(false);
        window.setTimeout(() => boxRef.current?.focus(), 50);
      },
    });

  const set = (patch: Parameters<typeof update.mutate>[0], msg: string) => update.mutate(patch, { onSuccess: () => toast.success(msg) });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] [&>*]:min-w-0">
      <div className="space-y-5">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] text-muted-foreground">#{t.number}</span>
            <TicketStatusBadge status={t.status} />
            <PriorityBadge priority={t.priority} quiet />
            {t.awaitingPlatform && active && <NeedsReply />}
          </div>
          <h1 className="mt-1.5 font-display text-[22px] font-semibold leading-snug tracking-tight [overflow-wrap:anywhere]">{t.subject}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            <Link to={`/platform/schools/${t.tenant.id}`} className="font-medium text-foreground hover:underline">
              {t.tenant.name}
            </Link>
            {t.openedBy && ` · ${t.openedBy.name}`} · {TICKET_CATEGORY_LABELS[t.category]} · opened {formatRelative(t.createdAt)}
          </p>
        </header>

        <TicketThread thread={t.thread} viewer="platform" schoolName={t.tenant.name} />
        <div ref={endRef} />

        {suggestion && (
          <Card className="ai-border relative overflow-hidden border-transparent p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ai-gradient">
                <AiSparkle className="size-4 [&_path]:fill-white" animated={false} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">AI summary</p>
                <p className="mt-1 text-[13.5px] leading-relaxed">{suggestion.summary}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span className="text-muted-foreground">Suggests</span>
                  <SuggestChip
                    label={`${PRIORITY_LABEL[suggestion.suggestedPriority]} priority`}
                    same={suggestion.suggestedPriority === t.priority}
                    onApply={() => set({ priority: suggestion.suggestedPriority }, `Priority set to ${PRIORITY_LABEL[suggestion.suggestedPriority]}`)}
                  />
                  <SuggestChip
                    label={TICKET_CATEGORY_LABELS[suggestion.suggestedCategory]}
                    same={suggestion.suggestedCategory === t.category}
                    onApply={() => set({ category: suggestion.suggestedCategory }, `Category set to ${TICKET_CATEGORY_LABELS[suggestion.suggestedCategory]}`)}
                  />
                </div>
                <p className="mt-3 text-[11.5px] text-muted-foreground/80">
                  Draft reply placed below — edit before sending. {suggestion.provider} · <span className="font-mono">{suggestion.model}</span>
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Dismiss AI summary" onClick={() => setSuggestion(null)}>
                <X />
              </Button>
            </div>
          </Card>
        )}

        <Card className={cn('overflow-hidden', internal && 'border-dashed border-warning/60')}>
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            <p className="text-[13px] font-semibold">{internal ? 'Internal note' : `Reply to ${t.tenant.name}`}</p>
            <Button variant="ai" size="sm" className="ml-auto" onClick={runAssist} loading={assist.isPending}>
              {!assist.isPending && <AiSparkle className="[&_path]:fill-white" animated={false} />} {assist.isPending ? 'Reading the thread…' : 'AI assist'}
            </Button>
          </div>
          <Textarea
            ref={boxRef}
            aria-label={internal ? 'Internal note' : 'Reply'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            rows={6}
            maxLength={5000}
            placeholder={internal ? 'Only the platform team sees this…' : 'Write a reply the school will see…'}
            className={cn('min-h-[140px] rounded-none border-0 shadow-none focus-visible:ring-0', internal && 'bg-warning-soft/20')}
          />
          <div className="flex flex-col gap-3 border-t border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-[13px] font-medium">
              <Switch checked={internal} onCheckedChange={setInternal} />
              <Lock className="size-3.5 text-muted-foreground" /> Internal note
            </label>
            {!internal && (
              <div className="flex items-center gap-2 text-[13px]">
                <span className="whitespace-nowrap text-muted-foreground">Then set</span>
                <Select value={after} onValueChange={(v) => setAfter(v as TicketStatus)}>
                  <SelectTrigger aria-label="Status after reply" className="h-8 w-[180px] text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {TICKET_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button className="sm:ml-auto" onClick={send} loading={reply.isPending} disabled={!body.trim()}>
              {!reply.isPending && <Send />} {internal ? 'Add note' : 'Send reply'}
            </Button>
          </div>
        </Card>
      </div>

      <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
        <Section title="Ticket">
          <div className="grid gap-3">
            <Field label="Status" htmlFor="tk-status">
              <Select value={t.status} onValueChange={(v) => set({ status: v as TicketStatus }, `Marked ${TICKET_STATUS_LABEL[v as TicketStatus].toLowerCase()}`)}>
                <SelectTrigger id="tk-status" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {TICKET_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Priority" htmlFor="tk-priority">
              <Select value={t.priority} onValueChange={(v) => set({ priority: v as TicketPriority }, `Priority set to ${PRIORITY_LABEL[v as TicketPriority]}`)}>
                <SelectTrigger id="tk-priority" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Category" htmlFor="tk-category">
              <Select value={t.category} onValueChange={(v) => set({ category: v as TicketCategory }, 'Category updated')}>
                <SelectTrigger id="tk-category" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {TICKET_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Assignee" htmlFor="tk-assignee">
              <Select
                value={t.assignedTo?.id ?? NONE}
                onValueChange={(v) => set({ assignedToId: v === NONE ? null : v }, v === NONE ? 'Unassigned' : `Assigned to ${team.data?.find((m) => m.id === v)?.name ?? 'teammate'}`)}
              >
                <SelectTrigger id="tk-assignee" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {(team.data ?? [])
                    .filter((m) => m.platformRole !== 'FINANCE_ADMIN' || m.id === t.assignedTo?.id)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                        {m.isYou ? ' (you)' : ''} · {PLATFORM_ROLE_LABEL[m.platformRole]}
                      </SelectItem>
                    ))}
                  {t.assignedTo && !team.data?.some((m) => m.id === t.assignedTo?.id) && <SelectItem value={t.assignedTo.id}>{t.assignedTo.name}</SelectItem>}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </Section>
        <Section title="Details">
          <Facts
            rows={[
              ['School', <Link key="s" to={`/platform/schools/${t.tenant.id}`} className="hover:underline">{t.tenant.name}</Link>],
              ['Opened by', t.openedBy ? <a key="o" href={`mailto:${t.openedBy.email}`} className="hover:underline">{t.openedBy.name}</a> : '—'],
              ['Opened', formatDateTime(t.createdAt)],
              ['First response', t.firstResponseAt ? formatRelative(t.firstResponseAt) : <Badge key="f" variant="warning">None yet</Badge>],
              ['Resolved', t.resolvedAt ? formatDateTime(t.resolvedAt) : '—'],
              ['Messages', String(t.messages)],
            ]}
          />
        </Section>
      </aside>
    </div>
  );
}

function SuggestChip({ label, same, onApply }: { label: string; same: boolean; onApply: () => void }) {
  if (same)
    return (
      <Badge variant="outline">
        <Check /> {label}
      </Badge>
    );
  return (
    <button
      type="button"
      onClick={onApply}
      className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand-soft/50 px-2 py-0.5 text-[11.5px] font-medium text-brand transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label} · Apply
    </button>
  );
}
