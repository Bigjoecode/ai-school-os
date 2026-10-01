import type { AgentInfo, AiAgent, AiChatResponse, AiProposedAction, AiStatus, AiToolCall } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ArrowUp, Bot, ChevronDown, CircleAlert, FileClock, KeyRound, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Markdown } from '@/components/ai/markdown';
import { Page } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tip } from '@/components/ui/tooltip';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth-store';
import { formatMoney } from '@/lib/format';
import { useDocumentTitle, usePrefersReducedMotion } from '@/lib/hooks';
import { qk } from '@/lib/query-client';
import { cn, initials, titleCase } from '@/lib/utils';
import { AGENT_META, fallbackAgents, pendingSteps, splitCapabilities, TOOL_ICON } from './agent-meta';
import { type ChatMessage, msgId, useAiStore } from './ai-store';
import { useAgents } from './api';

export default function AiPage() {
  useDocumentTitle('AI Command Center');
  const [params, setParams] = useSearchParams();
  const me = useMe();
  const agentsQuery = useAgents();
  // The API decides who may open which assistant; the fallback only covers a failed request.
  const agents = useMemo(() => agentsQuery.data ?? (agentsQuery.isError ? fallbackAgents(me) : []), [agentsQuery.data, agentsQuery.isError, me]);
  const asked = params.get('agent');
  const info = agents.find((a) => a.agent === asked) ?? agents[0];
  const status = useQuery({
    queryKey: qk.aiStatus,
    queryFn: ({ signal }) => api.get<AiStatus>('/ai/status', undefined, signal),
  });

  const setAgent = (a: AiAgent) => {
    const next = new URLSearchParams(params);
    next.set('agent', a);
    next.delete('q');
    setParams(next, { replace: true });
  };

  return (
    <Page className="flex h-[calc(100dvh-56px)] flex-col !pb-4">
      <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted-foreground">
            <AiSparkle className="size-4" /> AI Command Center
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-[28px]">
            Ask your <span className="text-ai-gradient">school AI</span>
          </h1>
        </div>
        <StatusStrip status={status.data} loading={status.isLoading} />
      </div>

      <div role="tablist" aria-label="AI assistants" className="no-scrollbar -mx-4 mb-4 flex shrink-0 gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {agentsQuery.isLoading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-28 shrink-0 rounded-xl" />)
          : agents.map((a) => {
              const meta = AGENT_META[a.agent];
              const active = a.agent === info?.agent;
              return (
                <button
                  key={a.agent}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setAgent(a.agent)}
                  className={cn(
                    'relative flex h-9 shrink-0 items-center gap-2 rounded-xl px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="agent-pill"
                      className="ai-border absolute inset-0 rounded-xl bg-card shadow-soft"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <meta.icon className={cn('relative size-4', active && 'text-ai-2')} aria-hidden />
                  <span className="relative">{a.label}</span>
                </button>
              );
            })}
      </div>

      {status.isLoading || agentsQuery.isLoading ? (
        <Skeleton className="flex-1 rounded-2xl" />
      ) : status.data && !status.data.configured ? (
        <NotConfigured />
      ) : !info ? (
        <NoAssistants />
      ) : (
        <ChatPanel key={info.agent} info={info} />
      )}
    </Page>
  );
}

function StatusStrip({ status, loading }: { status?: AiStatus; loading: boolean }) {
  if (loading) return <Skeleton className="h-9 w-72 max-w-full rounded-xl" />;
  if (!status) return null;
  const pct = status.monthBudgetUsd ? Math.min(100, (status.monthSpendUsd / status.monthBudgetUsd) * 100) : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
      <span
        className={cn(
          'inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-3 shadow-xs',
          status.configured ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <span className={cn('size-2 rounded-full', status.configured ? 'bg-success' : 'bg-muted-foreground/50')} />
        {status.configured ? (status.providers.length ? status.providers.map(titleCase).join(' · ') : 'Connected') : 'Not connected'}
      </span>
      <span className="inline-flex h-8 items-center gap-2.5 rounded-lg border border-border bg-card px-3 shadow-xs">
        <span className="text-muted-foreground">This month</span>
        <span className="font-medium tabular">{formatMoney(status.monthSpendUsd, 'USD')}</span>
        {status.monthBudgetUsd != null && (
          <>
            <span className="text-muted-foreground">of {formatMoney(status.monthBudgetUsd, 'USD', { maximumFractionDigits: 0 })}</span>
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className={cn('block h-full rounded-full', pct != null && pct > 85 ? 'bg-warning' : 'bg-ai-gradient')}
                style={{ width: `${pct ?? 0}%` }}
              />
            </span>
          </>
        )}
      </span>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="grid flex-1 place-items-center rounded-2xl border border-border bg-card shadow-soft">
      <EmptyState
        tone="ai"
        icon={KeyRound}
        title="AI isn't connected yet — add an API key"
        description={
          <>
            Ask your platform administrator to add an AI provider key to the API environment (for example{' '}
            <code className="rounded bg-muted px-1 font-mono text-[12px]">ANTHROPIC_API_KEY</code> or{' '}
            <code className="rounded bg-muted px-1 font-mono text-[12px]">OPENAI_API_KEY</code>) and restart the server. Every agent
            lights up instantly.
          </>
        }
      />
    </div>
  );
}

function NoAssistants() {
  return (
    <div className="grid flex-1 place-items-center rounded-2xl border border-border bg-card shadow-soft">
      <EmptyState
        tone="ai"
        icon={Bot}
        title="No assistants are open to you yet"
        description="Ask a school admin to add the right permissions to one of your roles."
      />
    </div>
  );
}

function CapabilityChips({ info, className, limit }: { info: AgentInfo; className?: string; limit?: number }) {
  const { looksUp, prepares } = splitCapabilities(info.capabilities);
  if (!looksUp.length && !prepares.length) return null;
  const shown = limit ? looksUp.slice(0, limit) : looksUp;
  const hidden = looksUp.length - shown.length;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px]', className)}>
      {looksUp.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <span className="mr-0.5 font-medium text-muted-foreground">Can look up</span>
          {shown.map((c) => (
            <span key={c} className="rounded-md border border-border bg-background/60 px-1.5 py-0.5 text-foreground/80">
              {c}
            </span>
          ))}
          {hidden > 0 && (
            <Tip label={looksUp.slice(shown.length).join(' · ')}>
              <button
                type="button"
                className="rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                +{hidden} more
              </button>
            </Tip>
          )}
        </div>
      )}
      {prepares.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <span className="mr-0.5 font-medium text-muted-foreground">Can prepare</span>
          {prepares.map((c) => (
            <span key={c} className="rounded-md bg-ai-2/10 px-1.5 py-0.5 font-medium text-ai-2">
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatPanel({ info }: { info: AgentInfo }) {
  const agent = info.agent;
  const me = useMe();
  const meta = AGENT_META[agent];
  const thread = useAiStore((s) => s.threads[agent]);
  const append = useAiStore((s) => s.append);
  const setConversation = useAiStore((s) => s.setConversation);
  const reset = useAiStore((s) => s.reset);
  const messages = thread?.messages ?? [];
  const [input, setInput] = useState('');
  const [params, setParams] = useSearchParams();
  const handledQ = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestions = info.suggestions.length ? info.suggestions : meta.suggestions;

  const chat = useMutation({
    mutationFn: (message: string) =>
      api.post<AiChatResponse>('/ai/chat', {
        agent,
        message,
        conversationId: useAiStore.getState().threads[agent]?.conversationId,
      }),
    meta: { silent: true },
    onSuccess: (res) => {
      setConversation(agent, res.conversationId);
      append(agent, {
        id: msgId(),
        role: 'assistant',
        content: res.reply,
        provider: res.provider,
        model: res.model,
        toolCalls: res.toolCalls,
        actions: res.actions,
        at: Date.now(),
      });
    },
    onError: (err) => {
      const content =
        err instanceof ApiError && err.status === 503
          ? "AI isn't connected yet — add an API key to the server to start chatting."
          : errorMessage(err);
      append(agent, { id: msgId(), role: 'error', content, at: Date.now() });
    },
  });

  const send = (text: string) => {
    const message = text.trim();
    if (!message || chat.isPending) return;
    append(agent, { id: msgId(), role: 'user', content: message, at: Date.now() });
    setInput('');
    chat.mutate(message);
  };

  // ?q= auto-send (from ⌘K, the overview, insights, suggestion chips).
  useEffect(() => {
    const q = params.get('q');
    if (!q) {
      handledQ.current = null;
      return;
    }
    if (handledQ.current === q) return;
    handledQ.current = q;
    const next = new URLSearchParams(params);
    next.delete('q');
    setParams(next, { replace: true });
    send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, chat.isPending]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  };

  const userName = me ? `${me.user.firstName} ${me.user.lastName}` : 'You';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ai-gradient text-white">
              <meta.icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold">{info.label}</p>
              <p className="line-clamp-1 text-[12px] text-muted-foreground sm:line-clamp-2">{info.description}</p>
            </div>
          </div>
          {messages.length > 0 && (
            <Tip label="Start a new conversation">
              <Button variant="ghost" size="sm" onClick={() => reset(agent)} disabled={chat.isPending} aria-label="New chat">
                <RotateCcw /> <span className="hidden sm:inline">New chat</span>
              </Button>
            </Tip>
          )}
        </div>
        {messages.length > 0 && <CapabilityChips info={info} limit={6} className="mt-2.5 hidden pl-11 md:flex" />}
      </div>

      <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 && !chat.isPending ? (
          <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-4 py-10 text-center sm:px-5">
            <div className="relative">
              <div aria-hidden className="absolute inset-0 scale-[2] rounded-full bg-ai-2/20 blur-2xl" />
              <span className="ai-border relative grid size-14 place-items-center rounded-2xl bg-card shadow-soft">
                <AiSparkle className="size-7" />
              </span>
            </div>
            <h2 className="mt-5 font-display text-xl font-semibold tracking-tight">How can {info.label} help?</h2>
            <p className="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-muted-foreground">{info.description}</p>
            <CapabilityChips info={info} className="mt-4 justify-center [&>div]:justify-center" />
            <div className="mt-6 grid w-full gap-2 sm:grid-cols-3 [&>*]:min-w-0">
              {suggestions.slice(0, 6).map((s, i) => (
                <motion.button
                  key={s}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                  onClick={() => send(s)}
                  className="rounded-xl border border-border bg-background/60 p-3.5 text-left text-[13px] leading-snug text-foreground transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {s}
                </motion.button>
              ))}
            </div>
            {splitCapabilities(info.capabilities).prepares.length > 0 && (
              <p className="mt-5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <ShieldCheck className="size-3.5 text-success" aria-hidden /> Drafts are saved for you to review — nothing is sent without you.
              </p>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6" aria-live="polite">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} userName={userName} userInitials={initials(me?.user.firstName, me?.user.lastName)} />
              ))}
            </AnimatePresence>
            {chat.isPending && <PendingReply steps={pendingSteps(info.capabilities)} />}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t border-border bg-background/40 p-3 sm:p-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-card p-2 pl-4 shadow-soft transition-shadow focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={4000}
            placeholder={`Message ${info.label}…`}
            aria-label={`Message ${info.label}`}
            className="max-h-[180px] min-h-9 min-w-0 flex-1 resize-none bg-transparent py-2 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/70"
          />
          <Button type="submit" variant="ai" size="icon" disabled={!input.trim() || chat.isPending} aria-label="Send message" className="rounded-xl">
            <ArrowUp />
          </Button>
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11.5px] text-muted-foreground">
          AI can make mistakes. Check important information. <span className="hidden sm:inline">Shift + Enter for a new line.</span>
        </p>
      </form>
    </div>
  );
}

function MessageBubble({ message, userName, userInitials }: { message: ChatMessage; userName: string; userInitials: string }) {
  if (message.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end gap-3">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-primary px-4 py-2.5 text-[14px] leading-relaxed text-primary-foreground">
          {message.content}
        </div>
        <Avatar name={userName} initials={userInitials} size="sm" className="hidden sm:inline-flex" />
      </motion.div>
    );
  }
  const isError = message.role === 'error';
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <span
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
          isError ? 'bg-danger-soft text-danger' : 'ai-border bg-card',
        )}
      >
        {isError ? <Bot className="size-4" /> : <AiSparkle className="size-4" animated={false} />}
      </span>
      <div className="min-w-0 max-w-[92%] flex-1">
        {isError ? (
          <div className="rounded-2xl rounded-tl-md border border-danger/20 bg-danger-soft px-4 py-3 text-[13.5px] text-danger">{message.content}</div>
        ) : (
          <>
            {message.toolCalls && message.toolCalls.length > 0 && <ToolTrace calls={message.toolCalls} />}
            <Markdown text={message.content} className="pt-1 text-foreground [overflow-wrap:anywhere]" />
            {message.actions && message.actions.length > 0 && (
              <div className="mt-3.5 space-y-2">
                {message.actions.map((a, i) => (
                  <ActionCard key={`${a.link}-${i}`} action={a} />
                ))}
              </div>
            )}
            {(message.provider || message.model) && (
              <div className="mt-2.5 flex items-center gap-1.5">
                <Badge variant="outline" className="max-w-full truncate font-mono text-[10.5px] font-normal">
                  {[message.provider, message.model].filter(Boolean).join(' · ')}
                </Badge>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

/** "Looked up 3 things" — a compact, expandable trace of the assistant's tool calls. */
function ToolTrace({ calls }: { calls: AiToolCall[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const failed = calls.filter((c) => !c.ok).length;
  const icons = [...new Set(calls.map((c) => c.name))].slice(0, 5);
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={listId}
        className="group inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-background/60 py-1 pl-1.5 pr-2.5 text-[12px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex -space-x-1" aria-hidden>
          {icons.map((name) => {
            const Icon = TOOL_ICON[name] ?? Search;
            return (
              <span key={name} className="grid size-5 place-items-center rounded-md border border-border bg-card text-ai-2">
                <Icon className="size-3" />
              </span>
            );
          })}
        </span>
        <span className="truncate font-medium">
          Looked up {calls.length} {calls.length === 1 ? 'thing' : 'things'}
          {failed > 0 && <span className="text-danger"> · {failed} couldn’t be checked</span>}
        </span>
        <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            id={listId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="ml-2.5 mt-1.5 space-y-1 overflow-hidden border-l border-border pl-3.5"
          >
            {calls.map((c, i) => {
              const Icon = c.ok ? (TOOL_ICON[c.name] ?? Search) : CircleAlert;
              return (
                <li key={`${c.name}-${i}`} className={cn('flex items-start gap-2 py-0.5 text-[12.5px]', c.ok ? 'text-muted-foreground' : 'text-danger')}>
                  <Icon className={cn('mt-0.5 size-3.5 shrink-0', c.ok && 'text-ai-2')} aria-hidden />
                  <span className="min-w-0">
                    {c.label}
                    {!c.ok && <span className="text-danger/80"> — couldn’t check this</span>}
                  </span>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionCard({ action }: { action: AiProposedAction }) {
  const isMessage = action.kind === 'DRAFT_MESSAGE';
  return (
    <div className="ai-border flex flex-col gap-3 rounded-xl bg-card p-3.5 shadow-soft sm:flex-row sm:items-center">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ai-gradient text-white">
        <FileClock className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-snug">{action.label}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-muted-foreground">
          <ShieldCheck className="size-3 shrink-0 text-success" aria-hidden />
          {isMessage ? 'Draft — nothing has been sent' : 'Draft — nothing has been set for students yet'}
        </p>
      </div>
      <Button asChild variant="ai" size="sm" className="self-start sm:self-auto">
        <Link to={action.link}>
          Review draft <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}

/** Replies can take a while (the assistant looks things up first), so show what it is likely doing. */
function PendingReply({ steps }: { steps: string[] }) {
  const [i, setI] = useState(0);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => Math.min(n + 1, steps.length - 1)), 1900);
    return () => window.clearInterval(t);
  }, [steps.length]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3" role="status">
      <span className="ai-border grid size-8 shrink-0 place-items-center rounded-lg bg-card">
        <AiSparkle className="size-4" />
      </span>
      <span className="flex min-w-0 items-center gap-2.5 rounded-2xl bg-muted px-4 py-2.5">
        <span className="flex shrink-0 items-center gap-1" aria-hidden>
          {[0, 1, 2].map((d) => (
            <span
              key={d}
              className="size-1.5 rounded-full bg-ai-2 animate-[typing_1.2s_ease-in-out_infinite]"
              style={{ animationDelay: `${d * 0.15}s` }}
            />
          ))}
        </span>
        <span className="relative min-w-0 overflow-hidden text-[13px] text-muted-foreground">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={steps[i]}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="block truncate"
            >
              {steps[i]}
            </motion.span>
          </AnimatePresence>
        </span>
      </span>
    </motion.div>
  );
}
