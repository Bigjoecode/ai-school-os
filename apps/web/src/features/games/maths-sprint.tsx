import { GAME_LEVEL_LABELS, markLocalRound, MATHS_SPRINT, mathsRound, type GameLevel, type GameRoundResult, type LocalScoreInput } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Flame, Star } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { gk, newClientId, rememberedLevel, submitScore, useGamesHub } from './api';
import type { GameMeta } from './meta';
import { buzz, play } from './sound';
import { GameFrame, Hud, Intro, ResultView, TimeBar, useCountdown, useKeys } from './ui';

const randomSeed = () => {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  } catch {
    return Math.floor(Math.random() * 0xffffffff);
  }
};

/** Maths Sprint: generated on the phone (works offline), marked again by the server from the same seed. */
export default function MathsSprint({ meta }: { meta: GameMeta }) {
  const hub = useGamesHub();
  const qc = useQueryClient();
  const known = hub.data ? { level: hub.data.student.level, year: hub.data.student.year } : rememberedLevel();
  const level: GameLevel = known?.level ?? 'JUNIOR';
  const year = known?.year ?? 1;
  const [seed, setSeed] = useState(randomSeed);
  const [phase, setPhase] = useState<'intro' | 'play' | 'result'>('intro');
  const [answers, setAnswers] = useState<{ choice: number; ms: number }[]>([]);
  const [flash, setFlash] = useState<{ i: number; right: boolean } | null>(null);
  const [outcome, setOutcome] = useState<{ result?: GameRoundResult; queued?: boolean; rejected?: string } | null>(null);
  const askedAt = useRef(0);
  const startedAt = useRef(0);
  const questions = useMemo(() => mathsRound(seed, level, year, MATHS_SPRINT.maxQuestions), [seed, level, year]);
  const i = answers.length;
  const q = questions[i];
  const left = useCountdown(MATHS_SPRINT.seconds, seed, phase === 'play', () => void finish());

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
      durationMs: Math.min(Math.round(performance.now() - startedAt.current), (MATHS_SPRINT.seconds + 2) * 1000),
      seed,
      level,
      year,
      answers: list,
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
          rules={[`${MATHS_SPRINT.seconds} seconds: answer as many as you can.`, 'Questions get harder as you go.', `Pitched at ${GAME_LEVEL_LABELS[level].toLowerCase()} level. Works offline too.`]}
        />
      </GameFrame>
    );
  }
  if (phase === 'result') {
    const mark = markLocalRound({ game: 'MATHS_SPRINT', clientId: 'x', playedAt: new Date().toISOString(), durationMs: 60_000, seed, level, year, answers });
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
          { label: 'Answered', value: `${i} done` },
          ...(run >= 3 ? [{ label: 'Run', value: `${run} in a row`, icon: <Flame className="size-3.5 text-warning" aria-hidden /> }] : []),
        ]}
      />
      <TimeBar leftMs={left} totalMs={MATHS_SPRINT.seconds * 1000} />
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <p className="mb-1 text-[12px] font-medium text-muted-foreground">{q.skill}</p>
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
              className="flex min-h-16 items-center gap-2 rounded-2xl border-2 border-border bg-card px-3 py-2 text-left text-[17px] font-semibold tabular transition-colors hover:border-border-strong hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] motion-reduce:transform-none"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] text-muted-foreground" aria-hidden>
                {k + 1}
              </span>
              <span className="min-w-0 break-words">{o}</span>
            </button>
          ))}
        </div>
        <p className={cn('mt-3 h-5 text-center text-[13px] font-semibold', flash?.right ? 'text-success' : 'text-danger')} role="status">
          {flash && flash.i === i - 1 ? (flash.right ? '✓ Right' : `✗ It was ${questions[flash.i]!.options[questions[flash.i]!.answer]}`) : ''}
        </p>
      </div>
    </GameFrame>
  );
}
