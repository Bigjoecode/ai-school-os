import { AI_AGENTS, type AiAgent, type AiChatResponse, type AiStatus } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUp,
  Bot,
  Building2,
  GraduationCap,
  HeartHandshake,
  KeyRound,
  type LucideIcon,
  Presentation,
  RotateCcw,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
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
import { useDocumentTitle } from '@/lib/hooks';
import { qk } from '@/lib/query-client';
import { cn, initials, titleCase } from '@/lib/utils';
import { type ChatMessage, msgId, useAiStore } from './ai-store';

const AGENT_META: Record<AiAgent, { label: string; icon: LucideIcon; blurb: string; suggestions: string[] }> = {
  school: {
    label: 'School',
    icon: Building2,
    blurb: 'Your school-wide analyst for leaders and admins.',
    suggestions: ['Which classes are nearly full?', 'Summarise enrolment this term', 'Which students have no guardian on record?'],
  },
  teacher: {
    label: 'Teacher',
    icon: Presentation,
    blurb: 'Lesson plans, questions and feedback in seconds.',
    suggestions: [
      'Draft a 40-minute lesson plan on photosynthesis for JSS 2',
      'Write 10 multiple-choice questions on fractions',
      'Suggest ways to support a struggling reader',
    ],
  },
  parent: {
    label: 'Parent',
    icon: HeartHandshake,
    blurb: 'Friendly answers for parents and guardians.',
    suggestions: ['Draft a welcome message for new parents', 'Explain our term calendar simply', 'Write a reminder about the PTA meeting'],
  },
  student: {
    label: 'Student',
    icon: GraduationCap,
    blurb: 'A patient study buddy that explains step by step.',
    suggestions: ['Explain quadratic equations with an example', 'Quiz me on the water cycle', 'Help me plan a revision timetable'],
  },
  finance: {
    label: 'Finance',
    icon: Wallet,
    blurb: 'Budgets, fee planning and financial summaries.',
    suggestions: ['Draft a fee reminder message', 'How should we structure sibling discounts?', 'Outline a termly budget template'],
  },
  admissions: {
    label: 'Admissions',
    icon: UserPlus,
    blurb: 'Enquiries, offer letters and follow-ups.',
    suggestions: ['Draft an admission offer letter', 'Write a reply to an enquiry about fees', 'Create an entrance test checklist'],
  },
};

function isAgent(v: string | null): v is AiAgent {
  return !!v && (AI_AGENTS as readonly string[]).includes(v);
}

export default function AiPage() {
  useDocumentTitle('AI Command Center');
  const [params, setParams] = useSearchParams();
  const agent: AiAgent = isAgent(params.get('agent')) ? (params.get('agent') as AiAgent) : 'school';
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
        <div>
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted-foreground">
            <AiSparkle className="size-4" /> AI Command Center
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-[28px]">
            Ask your <span className="text-ai-gradient">school AI</span>
          </h1>
        </div>
        <StatusStrip status={status.data} loading={status.isLoading} />
      </div>

      <div role="tablist" aria-label="AI agents" className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {AI_AGENTS.map((a) => {
          const meta = AGENT_META[a];
          const active = a === agent;
          return (
            <button
              key={a}
              role="tab"
              aria-selected={active}
              onClick={() => setAgent(a)}
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
              <meta.icon className={cn('relative size-4', active && 'text-ai-2')} />
              <span className="relative">{meta.label} AI</span>
            </button>
          );
        })}
      </div>

      {status.isLoading ? (
        <Skeleton className="flex-1 rounded-2xl" />
      ) : status.data && !status.data.configured ? (
        <NotConfigured />
      ) : (
        <ChatPanel key={agent} agent={agent} />
      )}
    </Page>
  );
}

function StatusStrip({ status, loading }: { status?: AiStatus; loading: boolean }) {
  if (loading) return <Skeleton className="h-9 w-72 rounded-xl" />;
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

function ChatPanel({ agent }: { agent: AiAgent }) {
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
      append(agent, { id: msgId(), role: 'assistant', content: res.reply, provider: res.provider, model: res.model, at: Date.now() });
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

  // ?q= auto-send (from ⌘K, the overview, suggestion chips).
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
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ai-gradient text-white">
            <meta.icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold">{meta.label} AI</p>
            <p className="truncate text-[12px] text-muted-foreground">{meta.blurb}</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Tip label="Start a new conversation">
            <Button variant="ghost" size="sm" onClick={() => reset(agent)} disabled={chat.isPending}>
              <RotateCcw /> <span className="hidden sm:inline">New chat</span>
            </Button>
          </Tip>
        )}
      </div>

      <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        {messages.length === 0 && !chat.isPending ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-5 py-10 text-center">
            <div className="relative">
              <div aria-hidden className="absolute inset-0 scale-[2] rounded-full bg-ai-2/20 blur-2xl" />
              <span className="ai-border relative grid size-14 place-items-center rounded-2xl bg-card shadow-soft">
                <AiSparkle className="size-7" />
              </span>
            </div>
            <h2 className="mt-5 font-display text-xl font-semibold tracking-tight">How can {meta.label} AI help?</h2>
            <p className="mt-1.5 text-[13.5px] text-muted-foreground">{meta.blurb}</p>
            <div className="mt-6 grid w-full gap-2 sm:grid-cols-3">
              {meta.suggestions.map((s, i) => (
                <motion.button
                  key={s}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                  onClick={() => send(s)}
                  className="rounded-xl border border-border bg-background/60 p-3.5 text-left text-[13px] leading-snug text-foreground transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-soft"
                >
                  {s}
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} userName={userName} userInitials={initials(me?.user.firstName, me?.user.lastName)} />
              ))}
            </AnimatePresence>
            {chat.isPending && <TypingIndicator />}
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
            placeholder={`Message ${meta.label} AI…`}
            aria-label={`Message ${meta.label} AI`}
            className="max-h-[180px] min-h-9 flex-1 resize-none bg-transparent py-2 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/70"
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
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-primary px-4 py-2.5 text-[14px] leading-relaxed text-primary-foreground">
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
            <Markdown text={message.content} className="pt-1 text-foreground" />
            {(message.provider || message.model) && (
              <div className="mt-2.5 flex items-center gap-1.5">
                <Badge variant="outline" className="font-mono text-[10.5px] font-normal">
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

function TypingIndicator() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3" aria-label="AI is thinking">
      <span className="ai-border grid size-8 place-items-center rounded-lg bg-card">
        <AiSparkle className="size-4" />
      </span>
      <span className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-ai-2 animate-[typing_1.2s_ease-in-out_infinite]"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
    </motion.div>
  );
}
