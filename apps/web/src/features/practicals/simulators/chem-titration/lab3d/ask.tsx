import type { PracticalAskStage } from '@aischool/shared';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { usePracticalAsk } from '../../../api';
import { ASSISTANT_NAME } from './assistant';
import { say } from './voice';

/**
 * "Ask Mrs Ada": type a question (or pick a suggestion) and get a short AI
 * answer grounded in the practical's lesson and the current step. Never in a
 * timed practical (the host doesn't show it, and the API refuses). The
 * session's questions and answers stay on screen; nothing is saved.
 */

export interface AskTurn {
  q: string;
  a: string | null;
  error?: string;
}

const SUGGESTIONS: Record<PracticalAskStage, string[]> = {
  LEARN: ['Why rinse the burette with the acid?', 'Why read the meniscus at eye level?', 'What is a concordant titre?', 'Why use a white tile?'],
  DEMO: ['Why do you swirl the flask?', 'Why add the acid drop by drop near the end?', 'Why is the rough titre not used in the average?', 'Why remove the funnel before reading?'],
  TRY: ['Why rinse the burette with the acid?', 'Why read the meniscus at eye level?', 'How do I know I have reached the end point?', 'How do I work out the mean titre?'],
  SANDBOX: ['What happens if the acid is more concentrated?', 'Why does the mole ratio matter?', 'What if I choose the wrong indicator?', 'Why do titres need to be concordant?'],
};

export function AskPanel({ practicalId, stage, step, attemptId, turns, setTurns, indicatorHint }: { practicalId: string; stage: PracticalAskStage; step: string | null; attemptId?: string; turns: AskTurn[]; setTurns: (fn: (t: AskTurn[]) => AskTurn[]) => void; indicatorHint?: string }) {
  const [q, setQ] = useState('');
  const ask = usePracticalAsk(practicalId);
  const end = useRef<HTMLDivElement>(null);
  // Braces: newer browsers return a Promise from scrollIntoView, and an effect may only return a clean-up function.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [turns.length, ask.isPending]);
  const suggestions = [...SUGGESTIONS[stage].slice(0, indicatorHint ? 3 : 4), ...(indicatorHint ? [`Why is ${indicatorHint} used here?`] : []), ...(step && stage === 'TRY' ? [`Why do I need to: ${step.toLowerCase()}?`] : [])];

  const send = (question: string) => {
    const text = question.trim();
    if (!text || ask.isPending) return;
    setQ('');
    const history = turns.filter((x) => x.a).slice(-3).map((x) => ({ q: x.q, a: x.a! }));
    setTurns((t) => [...t, { q: text, a: null }]);
    ask.mutate(
      { question: text, stage, step: step ?? undefined, attemptId, history },
      {
        onSuccess: (r) => {
          setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a: r.answer } : x)));
          say(r.answer);
        },
        onError: (e) => setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: errorMessage(e) } : x))),
      },
    );
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
        {turns.length === 0 && (
          <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden /> Ask me anything about this practical — why a step matters, how to use a piece of apparatus, or how the calculation works. I won’t tell you your own answers, but I’ll show you how to get them.
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-1.5">
            <p className="ml-8 rounded-2xl rounded-tr-sm bg-brand px-3 py-2 text-[13px] text-brand-foreground">{t.q}</p>
            {t.a ? (
              <p className="mr-6 rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-[13px] leading-snug">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{ASSISTANT_NAME}</span>
                {t.a}
              </p>
            ) : t.error ? (
              <p className="mr-6 rounded-2xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{t.error}</p>
            ) : (
              <p className="mr-6 inline-flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-[13px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> {ASSISTANT_NAME} is thinking…
              </p>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button key={s} type="button" onClick={() => send(s)} disabled={ask.isPending} className={cn('rounded-full border border-border px-2.5 py-1 text-left text-[12px] hover:bg-muted', ask.isPending && 'opacity-50')}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(q);
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value.slice(0, 400))} placeholder={`Ask ${ASSISTANT_NAME} a question…`} aria-label={`Ask ${ASSISTANT_NAME} a question`} />
        <Button type="submit" variant="brand" disabled={!q.trim() || ask.isPending} aria-label="Ask">
          <Send />
        </Button>
      </form>
    </div>
  );
}
