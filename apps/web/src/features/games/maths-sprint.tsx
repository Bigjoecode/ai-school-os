import { GAME_LEVEL_LABELS, markLocalRound, MATHS_SPRINT, mathsRound, YOUNG_ROUND, type GameLevel, type GameRoundResult, type LocalScoreInput } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Flame, Star } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { gk, newClientId, submitScore } from './api';
import type { GameMeta } from './meta';
import { useGameMode } from './mode';
import { buzz, play } from './sound';
import { forTheEar } from './speech';
import { GameFrame, Hud, Intro, praiseFor, ResultView, SpeakButton, TimeBar, useAutoSpeak, useCountdown, useKeys } from './ui';

const randomSeed = () => {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  } catch {
    return Math.floor(Math.random() * 0xffffffff);
  }
};

/** Maths Sprint: generated on the phone (works offline), marked again by the server from the same seed. */
export default function MathsSprint({ meta }: { meta: GameMeta }) {
  const qc = useQueryClient();
  const mode = useGameMode();
  const level: GameLevel = mode.level;
  const year = mode.year;
  // Young mode: ten sums with no clock.
  const young = mode.young;
  const [seed, setSeed] = useState(randomSeed);
  const [phase, setPhase] = useState<'intro' | 'play' | 'result'>('intro');
  const [answers, setAnswers] = useState<{ choice: number; ms: number }[]>([]);
  const [flash, setFlash] = useState<{ i: number; right: boolean } | null>(null);
  const [outcome, setOutcome] = useState<{ result?: GameRoundResult; queued?: boolean; rejected?: string } | null>(null);
  const askedAt = useRef(0);
  const startedAt = useRef(0);
  const questions = useMemo(() => mathsRound(seed, level, year, young ? YOUNG_ROUND.mathsQuestions : MATHS_SPRINT.maxQuestions), [seed, level, year, young]);
  const i = answers.length;
  const q = questions[i];
  const left = useCountdown(MATHS_SPRINT.seconds, seed, phase === 'play' && !young, () => void finish());
  const said = q ? [`${forTheEar(q.prompt)}${q.prompt.length <= 30 && !/[?]|Solve|Find|Expand|Simple/.test(q.prompt) ? ' equals?' : ''}`, ...q.options.map((o, k) => `${k + 1}: ${forTheEar(o)}.`)] : null;
  useAutoSpeak(phase === 'play' ? said : null, `${seed}-${i}-${phase}`, young);

  const correct = useMemo(() => answers.filter((a, k) => a.choice === questions[k]!.answer).length, [answers, questions]);
  const run = useMemo(() => {
    let n = 0;
    for (let k = answers.length - 1; k >= 0 && answers[k]!.choice === questions[k]!.answer; k--) n++;
    return n;
  }, [answers, questions]);

  function begin() {
    setSeed(randomSeed());
    setAnswers([]);
    setOutcome(null);
    setFlash(null);
    setPhase('play');
    startedAt.current = askedAt.current = performance.now();
  }

  // A new seed starts a new round: the clock starts when the first question shows.
  useEffect(() => {
    if (phase === 'play') startedAt.current = askedAt.current = performance.now();
  }, [seed, phase]);

  function pick(choice: number) {
    if (phase !== 'play' || !q) return;
    const now = performance.now();
    const ms = Math.round(now - askedAt.current);
    askedAt.current = now;
    const right = choice === q.answer;
    play(right ? 'right' : 'wrong');
    if (!right) buzz(30);
    setFlash({ i, right });
    const next = [...answers, { choice, ms }];
    setAnswers(next);
    if (next.length >= questions.length) void finish(next);
  }

  const finishing = useRef(false);
  async function finish(list = answers) {
    if (finishing.current || phase !== 'play') return;
    finishing.current = true;
    setPhase('result');
    const input: LocalScoreInput = {
      game: 'MATHS_SPRINT',
      clientId: newClientId(),
      playedAt: new Date().toISOString(),
      durationMs: Math.min(Math.round(performance.now() - startedAt.current), young ? 10 * 60_000 : (MATHS_SPRINT.seconds + 2) * 1000),
      seed,
      level,
      year,
      ...(young ? { young: true } : {}),
      answers: list.map((a) => ({ ...a, ms: Math.min(120_000, a.ms) })),
    };
    if (!list.length) {
      finishing.current = false;
      return setOutcome({ rejected: 'No answers this time, so nothing to save.' });
    }
    const out = await submitScore(input);
    finishing.current = false;
    if (out.kind === 'saved') {
      setOutcome({ result: out.result });
      void qc.invalidateQueries({ queryKey: gk.hub });
    } else if (out.kind === 'queued') setOutcome({ queued: true });
    else setOutcome({ rejected: out.message });
  }

  useKeys(Object.fromEntries([0, 1, 2, 3].map((k) => [String(k + 1), () => pick(k)])), phase === 'play');

  if (phase === 'intro') {
    return (
      <GameFrame meta={meta}>
        <Intro
          meta={meta}
          onStart={begin}
          rules={young ? [`${YOUNG_ROUND.mathsQuestions} sums.`, 'Take your time. There’s no clock.'] : [`${MATHS_SPRINT.seconds} seconds: answer as many as you can.`, 'Questions get harder as you go.', `Pitched at ${GAME_LEVEL_LABELS[level].toLowerCase()} level. Works offline too.`]}
        />
      </GameFrame>
    );
  }
  if (phase === 'result') {
    const mark = markLocalRound({ game: 'MATHS_SPRINT', clientId: 'x', playedAt: new Date().toISOString(), durationMs: 60_000, seed, level, year, young, answers });
    return (
      <GameFrame meta={meta}>
        <ResultView
          meta={meta}
          correct={mark.correct}
          total={mark.total}
          sub={`${mark.correct} right out of ${mark.total} · best run ${mark.bestRun}`}
          result={outcome?.result}
          queued={outcome?.queued}
          rejected={outcome?.rejected}
          onAgain={begin}
        />
      </GameFrame>
    );
  }
  if (!q) return null;
  return (
    <GameFrame meta={meta}>
      <Hud
        items={[
          { label: 'Right', value: correct, icon: <Star className="size-3.5 text-warning" aria-hidden /> },
          { label: 'Answered', value: young ? `${i} of ${questions.length}` : `${i} done` },
          ...(run >= 3 ? [{ label: 'Run', value: `${run} in a row`, icon: <Flame className="size-3.5 text-warning" aria-hidden /> }] : []),
        ]}
      />
      {young ? <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-brand" style={{ width: `${(100 * i) / questions.length}%` }} /></div> : <TimeBar leftMs={left} totalMs={MATHS_SPRINT.seconds * 1000} />}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="flex items-start gap-2">
          <p className="mb-1 min-w-0 flex-1 text-[12px] font-medium text-muted-foreground">{q.skill}</p>
          {mode.readAloud && said && <SpeakButton parts={said} big={young} label="Hear the sum" />}
        </div>
        <p className={cn('min-h-[4.5rem] font-display font-semibold tabular leading-tight tracking-tight', q.prompt.length > 30 ? 'text-xl' : 'text-4xl')} aria-live="polite">
          {q.prompt}
          {q.prompt.length <= 30 && !/[?]|Solve|Find|Expand|Simple/.test(q.prompt) && ' = ?'}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {q.options.map((o, k) => (
            <button
              key={`${i}-${k}`}
              type="button"
              onClick={() => pick(k)}
              className={cn(
                'flex items-center gap-2 rounded-2xl border-2 border-border bg-card px-3 py-2 text-left font-semibold tabular transition-colors hover:border-border-strong hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] motion-reduce:transform-none',
                young ? 'min-h-20 text-2xl' : 'min-h-16 text-[17px]',
              )}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] text-muted-foreground" aria-hidden>
                {k + 1}
              </span>
              <span className="min-w-0 break-words">{o}</span>
            </button>
          ))}
        </div>
        <p className={cn('mt-3 h-5 text-center text-[13px] font-semibold', flash?.right ? 'text-success' : 'text-danger')} role="status">
          {flash && flash.i === i - 1 ? (flash.right ? (young ? `⭐ ${praiseFor(flash.i)}` : '✓ Right') : `${young ? 'Good try! ' : '✗ '}It was ${questions[flash.i]!.options[questions[flash.i]!.answer]}`) : ''}
        </p>
      </div>
    </GameFrame>
  );
}
