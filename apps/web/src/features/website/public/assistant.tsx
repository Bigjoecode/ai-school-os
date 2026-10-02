import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, MessageCircleQuestion, RotateCw, Sparkles, X } from 'lucide-react';
import * as React from 'react';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useSite } from './context';
import { SchoolMark } from './layout';
import { Inline } from './ui';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_TURNS = 12;

function starters(on: (s: 'fees' | 'results' | 'events') => boolean): string[] {
  return [
    on('fees') ? 'How much are the school fees?' : 'How can I find out about fees?',
    'How do I apply for admission?',
    'Do you have a school bus?',
    on('results') ? 'How do I check my child’s result?' : 'When does the term start?',
  ];
}

function assistantError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Too many questions — please wait a moment and try again.';
    if (err.status === 503 || err.status === 404) return 'The assistant isn’t available right now — please use the contact page.';
    if (err.status === 0) return 'You seem to be offline. Check your connection and try again.';
  }
  return 'Sorry, something went wrong. Please try again.';
}

export function AssistantWidget() {
  const { site, slug, on } = useSite();
  const [open, setOpen] = React.useState(false);
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [draft, setDraft] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const name = site.school.shortName || site.school.name;

  const ask = useMutation({
    mutationFn: (history: Turn[]) =>
      api.post<{ reply: string }>(`/public/sites/${encodeURIComponent(slug)}/assistant`, {
        messages: history.slice(-MAX_TURNS).map((t) => ({ role: t.role, content: t.content.slice(0, 1500) })),
      }),
    meta: { silent: true },
    onSuccess: (r) => setTurns((t) => [...t, { role: 'assistant', content: r.reply }]),
    onError: (err) => setError(assistantError(err)),
  });

  const send = (text: string) => {
    const content = text.trim();
    if (!content || ask.isPending) return;
    const next = [...turns, { role: 'user' as const, content }];
    setTurns(next);
    setDraft('');
    setError(null);
    ask.mutate(next);
  };
  const retry = () => {
    if (!turns.length || turns[turns.length - 1].role !== 'user') return;
    setError(null);
    ask.mutate(turns);
  };

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, ask.isPending, error]);

  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    // A full-screen sheet on phones: keep the page behind it still.
    const mobile = window.matchMedia('(max-width: 639px)').matches;
    const prev = document.body.style.overflow;
    if (mobile) document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="print:hidden">
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(true)}
            aria-label={`Ask ${name} a question`}
            className="fixed bottom-4 right-4 z-50 flex h-14 items-center gap-2.5 rounded-full bg-site pl-4 pr-5 text-[14.5px] font-semibold text-site-on shadow-[0_12px_32px_-8px_color-mix(in_oklab,var(--site-primary)_70%,transparent),0_2px_6px_rgb(0_0_0/0.12)] transition-transform hover:-translate-y-0.5 sm:bottom-6 sm:right-6"
          >
            <span className="relative grid size-8 place-items-center rounded-full bg-white/15">
              <MessageCircleQuestion className="size-[18px]" aria-hidden />
              <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-site-accent ring-2 ring-[var(--site-primary)]" />
            </span>
            <span className="hidden sm:inline">Ask us anything</span>
            <span className="sm:hidden">Ask</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="false"
            aria-label={`Ask ${name}`}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[60] flex flex-col bg-white sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(620px,calc(100dvh-48px))] sm:w-[400px] sm:overflow-hidden sm:rounded-[20px] sm:border sm:border-site-line sm:shadow-[0_24px_64px_-16px_rgb(16_24_40/0.35)]"
          >
            <div className="relative flex items-center gap-3 overflow-hidden bg-site px-4 py-3.5 text-site-on" style={{ paddingTop: 'max(0.875rem, env(safe-area-inset-top))' }}>
              <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-site-accent/30 blur-2xl" />
              <SchoolMark light />
              <div className="relative min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">Ask {name}</p>
                <p className="flex items-center gap-1 text-[12px] opacity-75">
                  <Sparkles className="size-3" aria-hidden /> AI assistant · answers from our website
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="relative grid size-9 place-items-center rounded-full transition-colors hover:bg-white/15">
                <X className="size-5" />
              </button>
            </div>

            <div ref={listRef} className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto bg-site-surface/60 px-4 py-4" aria-live="polite">
              <Bubble role="assistant">
                Hello! I can answer questions about {site.school.name} — admissions, fees, term dates, transport and more. What would you like to know?
              </Bubble>
              {turns.map((t, i) => (
                <Bubble key={i} role={t.role}>
                  {t.content}
                </Bubble>
              ))}
              {ask.isPending && (
                <div className="flex">
                  <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-site-line bg-white px-4 py-3.5" aria-label="The assistant is typing">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="size-1.5 rounded-full bg-site-muted" style={{ animation: `typing 1.2s ${i * 0.15}s infinite ease-in-out` }} />
                    ))}
                  </div>
                </div>
              )}
              {error && (
                <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">
                  <span className="min-w-0 flex-1">{error}</span>
                  <button type="button" onClick={retry} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-semibold hover:bg-amber-100">
                    <RotateCw className="size-3.5" aria-hidden /> Retry
                  </button>
                </div>
              )}
              {turns.length === 0 && !ask.isPending && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {starters(on).map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-site-line bg-white px-3 py-1.5 text-left text-[13px] font-medium text-site-ink transition-colors hover:border-site/40 hover:text-site">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form
              className="border-t border-site-line bg-white p-3"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
              onSubmit={(e) => {
                e.preventDefault();
                send(draft);
              }}
            >
              <div className="flex items-end gap-2 rounded-2xl border border-site-line bg-white p-1.5 pl-3.5 transition-colors focus-within:border-site/50">
                <label htmlFor="site-assistant-input" className="sr-only">
                  Your question
                </label>
                <textarea
                  id="site-assistant-input"
                  ref={inputRef}
                  rows={1}
                  maxLength={1500}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send(draft);
                    }
                  }}
                  placeholder="Type your question…"
                  className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-[15px] text-site-ink outline-none placeholder:text-site-muted/70 focus-visible:outline-none"
                />
                <button type="submit" disabled={!draft.trim() || ask.isPending} aria-label="Send" className="grid size-9 shrink-0 place-items-center rounded-xl bg-site text-site-on transition-opacity disabled:opacity-40">
                  <ArrowUp className="size-4" />
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-site-muted">AI answers can be wrong. For anything important, contact the school.</p>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: string | React.ReactNode }) {
  const text = typeof children === 'string' ? children : null;
  return (
    <div className={cn('flex', role === 'user' && 'justify-end')}>
      <div
        className={cn(
          'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[14.5px] leading-relaxed',
          role === 'user' ? 'rounded-br-md bg-site text-site-on' : 'rounded-bl-md border border-site-line bg-white text-site-ink',
        )}
      >
        {text !== null ? <Inline text={text} /> : children}
      </div>
    </div>
  );
}
