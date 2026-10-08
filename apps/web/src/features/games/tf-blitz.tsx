import { markLocalRound, seededShuffle, TF_BLITZ, TRUE_FALSE_FACTS, type GameAnswerFeedback, type GameLevel, type GameRoundResult, type GameRoundView, type LocalScoreInput } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Star, WifiOff, X } from 'lucide-react';
import { type PointerEvent, useRef, useState } from 'react';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { answerRound, finishRound, gk, newClientId, rememberedLevel, startRound, submitScore, useGamesHub } from './api';
import type { GameMeta } from './meta';
import { buzz, play } from './sound';
import { GameFrame, Hud, Intro, Loading, Problem, ResultView, TimeBar, useCountdown, useKeys } from './ui';

interface Statement {
  text: string;
  subject: string | null;
  /** Local (offline) rounds know the answer; server rounds learn it after answering. */
  id?: string;
  answer?: boolean;
  explain?: string;
}
interface Mark {
  correct: boolean;
  answer: boolean;
  explain: string | null;
}

/**
 * True or False Blitz. Online: statements from the school's bank and the
 * curated packs, marked by the server one by one (the next card shows at once
 * while the mark comes back). Offline: the curated packs, marked on the phone
 * and sent later.
 */
export default function TrueFalseBlitz({ meta }: { meta: GameMeta }) {
  const hub = useGamesHub();
  const qc = useQueryClient();
  const level: GameLevel = hub.data?.student.level ?? rememberedLevel()?.level ?? 'JUNIOR';
  const [phase, setPhase] = useState<'intro' | 'loading' | 'play' | 'finishing' | 'result' | 'error'>('intro');
  const [error, setError] = useState('');
  const [items, setItems] = useState<Statement[]>([]);
  const [round, setRound] = useState<GameRoundView | null>(null);
  const [i, setI] = useState(0);
  const [marks, setMarks] = useState<(Mark | null)[]>([]);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<{ server?: GameRoundResult; local?: { correct: number; total: number }; queued?: boolean; rejected?: string } | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const shownAt = useRef(0);
  const startedAt = useRef(0);
  const local = useRef<{ id: string; answer: boolean | null; ms: number }[]>([]);
  const drag = useRef<{ x: number; dx: number } | null>(null);
  /** The last statement answered (two quick taps in one frame must not answer twice). */
  const last = useRef(-1);
  const [dx, setDx] = useState(0);
  const offline = !round;
  const left = useCountdown(TF_BLITZ.secondsPerStatement, i, phase === 'play', () => answer(null));

  async function begin() {
    setPhase('loading');
    setI(0);
    setMarks([]);
    setScore(0);
    setResult(null);
    local.current = [];
    last.current = -1;
    chain.current = Promise.resolve();
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ApiError(0, 'offline');
      const r = await startRound({ game: 'TF_BLITZ' });
      setRound(r);
      setItems(r.questions.map((q) => ({ text: q.prompt, subject: q.subject })));
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 0)) {
        setError(errorMessage(err));
        return setPhase('error');
      }
      // No connection: play the curated facts on the phone.
      setRound(null);
      const facts = seededShuffle(
        TRUE_FALSE_FACTS.filter((f) => f.level === level),
        Math.random,
      ).slice(0, TF_BLITZ.statements);
      setItems(facts.map((f) => ({ id: f.id, text: f.statement, subject: f.subject, answer: f.answer, explain: f.explain })));
    }
    startedAt.current = shownAt.current = Date.now();
    setPhase('play');
  }

  function answer(choice: boolean | null) {
    if (phase !== 'play' || i >= items.length || last.current >= i) return;
    const k = i;
    last.current = k;
    const it = items[k]!;
    const ms = Date.now() - shownAt.current;
    shownAt.current = Date.now();
    setDx(0);
    if (offline) {
      const correct = choice !== null && choice === it.answer;
      play(correct ? 'right' : 'wrong');
      if (!correct) buzz(25);
      local.current.push({ id: it.id!, answer: choice, ms });
      setMarks((m) => [...m, { correct, answer: !!it.answer, explain: it.explain ?? null }]);
      if (correct) setScore((s) => s + 50);
    } else {
      // Sent in order, one after another; the next card shows straight away.
      const id = round!.id;
      chain.current = chain.current.then(async () => {
        try {
          const f: GameAnswerFeedback = await answerRound(id, k, choice === null ? null : choice ? 0 : 1);
          play(f.correct ? 'right' : 'wrong');
          if (!f.correct) buzz(25);
          setMarks((m) => {
            const next = [...m];
            next[k] = { correct: f.correct, answer: f.correctIndex === 0, explain: f.explanation };
            return next;
          });
          setScore(f.score);
        } catch (err) {
          setError(`${errorMessage(err)}`);
          setPhase('error');
          throw err;
        }
      });
      setMarks((m) => {
        const next = [...m];
        next[k] = null;
        return next;
      });
    }
    if (k + 1 < items.length) setI(k + 1);
    else void end();
  }

  async function end() {
    setPhase('finishing');
    if (offline) {
      const input: LocalScoreInput = { game: 'TF_BLITZ', clientId: newClientId(), playedAt: new Date().toISOString(), durationMs: Date.now() - startedAt.current, items: local.current };
      const mark = markLocalRound(input);
      setPhase('result');
      setResult({ local: { correct: mark.correct, total: mark.total } });
      const out = await submitScore(input);
      if (out.kind === 'saved') {
        setResult({ server: out.result, local: { correct: mark.correct, total: mark.total } });
        void qc.invalidateQueries({ queryKey: gk.hub });
      } else setResult({ local: { correct: mark.correct, total: mark.total }, queued: out.kind === 'queued', rejected: out.kind === 'rejected' ? out.message : undefined });
      return;
    }
    try {
      await chain.current;
      const r = await finishRound(round!.id);
      void qc.invalidateQueries({ queryKey: gk.hub });
      setResult({ server: r });
      setPhase('result');
    } catch (err) {
      setError(errorMessage(err));
      setPhase('error');
    }
  }

  useKeys({ t: () => answer(true), f: () => answer(false), ArrowRight: () => answer(true), ArrowLeft: () => answer(false) }, phase === 'play');

  // Swipe the card: right for true, left for false.
  const onDown = (e: PointerEvent) => {
    drag.current = { x: e.clientX, dx: 0 };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag.current) return;
    drag.current.dx = e.clientX - drag.current.x;
    setDx(drag.current.dx);
  };
  const onUp = () => {
    const d = drag.current?.dx ?? 0;
    drag.current = null;
    if (Math.abs(d) > 80) answer(d > 0);
    else setDx(0);
  };

  if (phase === 'intro') {
    return (
      <GameFrame meta={meta}>
        <Intro meta={meta} onStart={() => void begin()} rules={[`${TF_BLITZ.statements} statements, ${TF_BLITZ.secondsPerStatement} seconds each.`, 'Tap True or False, swipe the card right or left, or press T or F.', 'Quick right answers score more. Works offline with the fact packs.']} />
      </GameFrame>
    );
  }
  if (phase === 'loading') return <GameFrame meta={meta}><Loading /></GameFrame>;
  if (phase === 'finishing') return <GameFrame meta={meta}><Loading label="Adding up your score…" /></GameFrame>;
  if (phase === 'error') return <GameFrame meta={meta}><Problem message={error} onRetry={() => void begin()} /></GameFrame>;
  if (phase === 'result' && result) {
    const r = result.server;
    const correct = r?.correct ?? result.local?.correct ?? 0;
    const total = r?.total ?? result.local?.total ?? 0;
    return (
      <GameFrame meta={meta}>
        <ResultView meta={meta} correct={correct} total={total} result={r} queued={result.queued} rejected={result.rejected} review={r?.review} onAgain={() => void begin()} />
      </GameFrame>
    );
  }
  const it = items[i];
  if (!it) return null;
  const lastMark = marks[i - 1];
  const prev = items[i - 1];
  return (
    <GameFrame meta={meta} right={offline ? <WifiOff className="size-4 text-muted-foreground" aria-label="Playing offline" /> : undefined}>
      <Hud
        items={[
          { label: 'Statement', value: `${i + 1}/${items.length}` },
          { label: 'Score', value: score, icon: <Star className="size-3.5 text-warning" aria-hidden /> },
        ]}
      />
      <TimeBar leftMs={left} totalMs={TF_BLITZ.secondsPerStatement * 1000} />
      <div
        className="touch-pan-y select-none rounded-3xl border border-border bg-card p-6 shadow-soft transition-transform duration-150 motion-reduce:transition-none"
        style={{ transform: `translateX(${dx}px) rotate(${dx / 30}deg)` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {it.subject && <p className="mb-2 text-[12px] font-medium text-muted-foreground">{it.subject}</p>}
        <p className="min-h-24 text-xl font-semibold leading-snug" aria-live="polite">
          {it.text}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => answer(false)} className="flex h-16 items-center justify-center gap-2 rounded-2xl border-2 border-danger/40 bg-danger-soft text-lg font-semibold text-foreground transition-transform hover:border-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] motion-reduce:transform-none">
            <X className="size-5 text-danger" aria-hidden /> False
          </button>
          <button type="button" onClick={() => answer(true)} className="flex h-16 items-center justify-center gap-2 rounded-2xl border-2 border-success/40 bg-success-soft text-lg font-semibold text-foreground transition-transform hover:border-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] motion-reduce:transform-none">
            <Check className="size-5 text-success" aria-hidden /> True
          </button>
        </div>
      </div>
      <div className="mt-3 min-h-14 rounded-2xl px-1 text-[13px]" role="status">
        {prev && lastMark && (
          <p className={cn('flex items-start gap-1.5', lastMark.correct ? 'text-success' : 'text-danger')}>
            {lastMark.correct ? <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <X className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
            <span>
              <strong>{lastMark.correct ? 'Right' : 'Wrong'}</strong>: “{prev.text}” is {lastMark.answer ? 'true' : 'false'}.{' '}
              {lastMark.explain && <span className="text-muted-foreground">{lastMark.explain}</span>}
            </span>
          </p>
        )}
      </div>
      <ol className="mt-2 flex flex-wrap gap-1" aria-label="Your answers so far">
        {items.map((_, k) => {
          const m = marks[k];
          return <li key={k} className={cn('size-2.5 rounded-full', k === i ? 'bg-brand' : m === undefined ? 'bg-muted' : m === null ? 'bg-muted-foreground/40' : m.correct ? 'bg-success' : 'bg-danger')} aria-label={m ? (m.correct ? 'right' : 'wrong') : k === i ? 'now' : 'to come'} />;
        })}
      </ol>
    </GameFrame>
  );
}
