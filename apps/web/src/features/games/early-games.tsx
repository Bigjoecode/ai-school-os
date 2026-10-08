import { EARLY_ROUND, earlyRound, markLocalRound, type EarlyGameKind, type EarlyOption, type GameRoundResult, type LocalScoreInput } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { gk, newClientId, submitScore } from './api';
import type { GameMeta } from './meta';
import { useGameMode } from './mode';
import { ClockSvg, EarlyPicture, ShapeSvg } from './pictures';
import { buzz, play } from './sound';
import { forTheEar, stopSpeaking } from './speech';
import { Feedback, GameFrame, Hud, Intro, praiseFor, ResultView, SpeakButton, useAutoSpeak, useKeys } from './ui';

const randomSeed = () => {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  } catch {
    return Math.floor(Math.random() * 0xffffffff);
  }
};

const RULES: Record<EarlyGameKind, string[]> = {
  COUNT_TAP: ['Count the pictures.', 'Tap the right number.'],
  SHAPES: ['Look at the shapes.', 'Tap the right one.'],
  LETTER_SOUNDS: ['Listen to the sound.', 'Tap the word that starts with it.'],
  TELL_TIME: ['Look at the clock hands.', 'The short hand shows the hour. The long hand shows the minutes.'],
  NAIRA_SHOP: ['Look at the prices.', 'Add them up, or work out the change.'],
};

/**
 * The early-years picture games: ten questions made on the phone from a seed
 * (they work offline), read aloud, with no clock and no lives. A wrong tap
 * says "try again" and the child keeps going until they find it; only the
 * first tap counts for marks. The server marks the round again from the seed.
 */
export default function EarlyGame({ meta }: { meta: GameMeta }) {
  const game = meta.kind as EarlyGameKind;
  const mode = useGameMode();
  const qc = useQueryClient();
  const [seed, setSeed] = useState(randomSeed);
  const [phase, setPhase] = useState<'intro' | 'play' | 'result'>('intro');
  const [i, setI] = useState(0);
  const [firsts, setFirsts] = useState<{ choice: number; ms: number }[]>([]);
  const [wrongTaps, setWrongTaps] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  const [outcome, setOutcome] = useState<{ result?: GameRoundResult; queued?: boolean; rejected?: string } | null>(null);
  const shownAt = useRef(0);
  const startedAt = useRef(0);
  const questions = useMemo(() => earlyRound(game, seed, mode.year, EARLY_ROUND.questions, mode.early), [game, seed, mode.year, mode.early]);
  const q = questions[i];
  const big = mode.young;

  // Say the question (and the options that aren't pictures: reading a picture's name would give it away).
  const parts = q ? [forTheEar(q.say), ...(q.options.some((o) => o.pictureOnly) ? [] : q.options.map((o) => `${forTheEar(o.text)}.`))] : null;
  useAutoSpeak(phase === 'play' ? parts : null, `${seed}-${i}-${phase}`, true);
  useEffect(() => () => stopSpeaking(), []);

  function begin() {
    setSeed(randomSeed());
    setI(0);
    setFirsts([]);
    setWrongTaps([]);
    setSolved(false);
    setOutcome(null);
    setPhase('play');
    startedAt.current = shownAt.current = Date.now();
  }

  function tap(k: number) {
    if (phase !== 'play' || !q || solved || wrongTaps.includes(k)) return;
    // A tap left over from the last question (small fingers tap twice): ignore it rather than count it.
    if (Date.now() - shownAt.current < 600) return;
    if (firsts.length === i) setFirsts((f) => [...f, { choice: k, ms: Math.min(120_000, Date.now() - shownAt.current) }]);
    if (k === q.answer) {
      play('right');
      setSolved(true);
    } else {
      play('wrong');
      buzz(30);
      setWrongTaps((w) => [...w, k]);
    }
  }

  async function next() {
    if (!solved) return;
    if (i + 1 < questions.length) {
      setI(i + 1);
      setWrongTaps([]);
      setSolved(false);
      shownAt.current = Date.now();
      return;
    }
    setPhase('result');
    const input: LocalScoreInput = {
      game,
      clientId: newClientId(),
      playedAt: new Date().toISOString(),
      durationMs: Math.min(10 * 60_000, Date.now() - startedAt.current),
      seed,
      year: mode.year,
      early: mode.early,
      answers: firsts,
    };
    const out = await submitScore(input);
    if (out.kind === 'saved') {
      setOutcome({ result: out.result });
      void qc.invalidateQueries({ queryKey: gk.hub });
    } else if (out.kind === 'queued') setOutcome({ queued: true });
    else setOutcome({ rejected: out.message });
  }

  // A right answer moves on by itself after a moment of praise.
  useEffect(() => {
    if (!solved) return;
    const t = window.setTimeout(() => void next(), wrongTaps.length ? 1800 : 1300);
    return () => window.clearTimeout(t);
  }, [solved]);

  useKeys({ ...Object.fromEntries([0, 1, 2, 3].map((k) => [String(k + 1), () => tap(k)])), Enter: () => void next() }, phase === 'play');

  if (phase === 'intro') {
    return (
      <GameFrame meta={meta}>
        <Intro meta={meta} onStart={begin} rules={[...RULES[game], `${EARLY_ROUND.questions} questions. Take your time: there’s no clock.`]} />
      </GameFrame>
    );
  }
  if (phase === 'result') {
    const mark = markLocalRound({ game, clientId: 'x', playedAt: new Date().toISOString(), durationMs: 600_000, seed, year: mode.year, early: mode.early, answers: firsts });
    return (
      <GameFrame meta={meta}>
        <ResultView meta={meta} correct={mark.correct} total={mark.total} sub={`${mark.correct} right first time out of ${mark.total}`} result={outcome?.result} queued={outcome?.queued} rejected={outcome?.rejected} onAgain={begin} />
      </GameFrame>
    );
  }
  if (!q) return null;
  const firstRight = firsts.filter((a, k) => a.choice === questions[k]!.answer).length;
  const pictures = q.options.some((o) => o.shape || o.clock);

  return (
    <GameFrame meta={meta}>
      <Hud
        items={[
          { label: 'Question', value: `${i + 1} of ${questions.length}` },
          { label: 'Stars', value: firstRight, icon: <Star className="size-3.5 fill-warning text-warning" aria-hidden /> },
        ]}
      />
      <div className="mb-3 flex gap-1" aria-hidden>
        {questions.map((_, k) => (
          <span key={k} className={cn('h-2 flex-1 rounded-full', k < i || (k === i && solved) ? 'bg-success' : k === i ? 'bg-brand' : 'bg-muted')} />
        ))}
      </div>
      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div className="flex items-start gap-3">
          <h2 className={cn('min-w-0 flex-1 font-semibold leading-snug', big ? 'text-2xl' : 'text-xl')} aria-live="polite">
            {q.prompt}
          </h2>
          {parts && <SpeakButton parts={parts} big={big} label="Hear the question" />}
        </div>
        {q.visual && (
          <div className="my-4">
            <EarlyPicture v={q.visual} />
          </div>
        )}
        <div className={cn('mt-4 grid gap-3', q.options.length === 4 && 'grid-cols-2')}>
          {q.options.map((o, k) => (
            <OptionTile key={`${i}-${k}`} o={o} n={k + 1} big={big} pictures={pictures} state={solved && k === q.answer ? 'right' : wrongTaps.includes(k) ? 'wrong' : solved ? 'dim' : 'idle'} onClick={() => tap(k)} />
          ))}
        </div>
        <div className="min-h-[4.5rem]">
          {solved && <Feedback correct young={big} k={i} text={wrongTaps.length ? 'You found it!' : null} />}
          {!solved && wrongTaps.length > 0 && (
            <div role="status" className={cn('mt-3 flex items-center gap-3 rounded-2xl bg-warning-soft px-4 py-3', big ? 'text-lg' : 'text-[14px]')}>
              <span className="text-2xl" aria-hidden>
                🙂
              </span>
              <span>
                <strong className="font-semibold">Try again!</strong> {q.options.length - wrongTaps.length > 1 ? 'Have another look.' : ''}
              </span>
            </div>
          )}
        </div>
        {solved && (
          <Button size="lg" variant="brand" className={cn('mt-2 w-full rounded-2xl', big ? 'h-16 text-xl' : 'h-12')} onClick={() => void next()}>
            {i + 1 < questions.length ? `${praiseFor(i)} Next` : 'See my stars'}
          </Button>
        )}
      </div>
    </GameFrame>
  );
}

function OptionTile({ o, n, big, pictures, state, onClick }: { o: EarlyOption; n: number; big: boolean; pictures: boolean; state: 'idle' | 'right' | 'wrong' | 'dim'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === 'wrong' || state === 'dim'}
      aria-label={`${n}: ${o.text}${state === 'right' ? ', right' : state === 'wrong' ? ', not this one' : ''}`}
      className={cn(
        'relative flex flex-col items-center justify-center gap-1 rounded-3xl border-[3px] px-2 py-3 text-center font-semibold transition-[background-color,border-color,transform,opacity] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring active:scale-[0.97] motion-reduce:transform-none',
        pictures ? 'min-h-36' : big ? 'min-h-24' : 'min-h-20',
        state === 'idle' && 'border-border bg-card hover:border-brand/50 hover:bg-muted/50',
        state === 'right' && 'border-success bg-success-soft',
        state === 'wrong' && 'border-danger/50 bg-danger-soft opacity-50',
        state === 'dim' && 'border-border bg-card opacity-40',
      )}
    >
      {o.shape && <ShapeSvg shape={o.shape} colour={o.colour ?? 'var(--brand)'} className="size-24" />}
      {o.clock && <ClockSvg h={o.clock.h} m={o.clock.m} className="size-28" />}
      {o.emoji && (
        <span className="text-5xl leading-none" aria-hidden>
          {o.emoji}
        </span>
      )}
      <span className={cn(o.pictureOnly ? 'sr-only' : '', o.emoji ? (big ? 'text-xl' : 'text-lg') : big ? 'text-3xl tabular' : 'text-2xl tabular')}>{o.text}</span>
      {state === 'right' && (
        <span className="absolute right-2 top-2 text-2xl" aria-hidden>
          ⭐
        </span>
      )}
    </button>
  );
}
