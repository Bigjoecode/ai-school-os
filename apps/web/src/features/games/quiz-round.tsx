import { QUIZ_RUSH, type GameAnswerFeedback, type GameRoundResult, type GameRoundView } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Flame, Star, Trophy } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { answerRound, finishRound, gk, startRound, useGamesHub } from './api';
import type { GameMeta } from './meta';
import { buzz, play } from './sound';
import { Feedback, GameFrame, Hud, Intro, Lives, Loading, OptionButton, Problem, ResultView, TimeBar, useCountdown, useKeys } from './ui';

type Phase = { kind: 'intro' } | { kind: 'loading' } | { kind: 'play' } | { kind: 'finishing' } | { kind: 'result'; result: GameRoundResult } | { kind: 'error'; message: string; retry?: () => void };

/**
 * Quiz Rush and the Daily Challenge: multiple-choice questions held by the
 * server. Each answer is sent and marked there; only then does the phone
 * learn the right answer for that question.
 */
export default function QuizRound({ meta }: { meta: GameMeta }) {
  const daily = meta.kind === 'DAILY';
  const qc = useQueryClient();
  const hub = useGamesHub();
  const [params, setParams] = useSearchParams();
  const subject = params.get('subject') || null;
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  const [round, setRound] = useState<GameRoundView | null>(null);
  const [index, setIndex] = useState(0);
  const [fb, setFb] = useState<GameAnswerFeedback | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState<number | null>(null);
  const [run, setRun] = useState(0);
  /** The last question we moved on from (a tap and the auto-advance must not both count). */
  const advanced = useRef(-1);

  const q = round?.questions[index];
  const timed = !daily && phase.kind === 'play' && !fb && !sending;
  const left = useCountdown(round?.secondsPerQuestion ?? 20, `${round?.id}-${index}`, timed, () => void choose(null));

  async function begin() {
    setPhase({ kind: 'loading' });
    try {
      const r = await startRound({ game: daily ? 'DAILY' : 'QUIZ_RUSH', subject: daily ? null : subject });
      setRound(r);
      const last = r.answered.at(-1);
      setIndex(r.answered.length);
      advanced.current = r.answered.length - 1;
      setScore(last?.score ?? 0);
      setLives(last?.livesLeft ?? r.lives);
      setRun(last?.run ?? 0);
      setFb(null);
      setPicked(null);
      if (r.done || r.answered.length >= r.questions.length) return void end(r.id);
      setPhase({ kind: 'play' });
    } catch (err) {
      setPhase({ kind: 'error', message: errorMessage(err), retry: err instanceof ApiError && err.status === 409 ? undefined : () => void begin() });
    }
  }

  async function end(id: string) {
    setPhase({ kind: 'finishing' });
    try {
      const result = await finishRound(id);
      void qc.invalidateQueries({ queryKey: gk.hub });
      setPhase({ kind: 'result', result });
    } catch (err) {
      setPhase({ kind: 'error', message: errorMessage(err), retry: () => void end(id) });
    }
  }

  async function choose(choice: number | null) {
    if (!round || fb || sending || phase.kind !== 'play') return;
    setSending(true);
    setPicked(choice);
    try {
      const f = await answerRound(round.id, index, choice);
      setFb(f);
      setScore(f.score);
      setLives(f.livesLeft);
      setRun(f.run);
      play(f.correct ? 'right' : 'wrong');
      if (!f.correct) buzz();
      // Right answers move on by themselves; a wrong one waits so the explanation can be read.
      if (f.correct) window.setTimeout(() => next(f), 900);
    } catch (err) {
      setPicked(null);
      setPhase({ kind: 'error', message: `${errorMessage(err)} Your round is saved: try again to carry on.`, retry: () => void resume() });
    } finally {
      setSending(false);
    }
  }

  async function resume() {
    if (!round) return void begin();
    await begin();
  }

  function next(f = fb) {
    if (!round || !f || advanced.current >= f.index) return;
    advanced.current = f.index;
    if (f.done) return void end(round.id);
    setFb(null);
    setPicked(null);
    setIndex((i) => i + 1);
  }

  useKeys(
    {
      ...Object.fromEntries((q?.options ?? []).map((_, i) => [String(i + 1), () => void choose(i)])),
      Enter: () => (fb ? next() : undefined),
    },
    phase.kind === 'play',
  );

  if (phase.kind === 'intro') {
    const subjects = (hub.data?.subjects ?? []).filter((s) => s.questions >= 5);
    return (
      <GameFrame meta={meta}>
        <Intro
          meta={meta}
          onStart={() => void begin()}
          startLabel={daily ? (hub.data?.daily.inProgress ? 'Carry on' : 'Start today’s challenge') : 'Start'}
          rules={
            daily
              ? ['8 questions, the same for everyone in your class today.', 'One scored try: take your time, there’s no clock.', 'Double XP for each right answer, plus a bonus for full marks.']
              : [`${QUIZ_RUSH.questions} questions, ${QUIZ_RUSH.secondsPerQuestion} seconds each.`, `${QUIZ_RUSH.lives} lives: a wrong answer or running out of time costs one.`, 'Answer fast for bonus points; keep a run going for more.']
          }
        >
          {!daily && subjects.length > 0 && (
            <fieldset className="mt-5">
              <legend className="mb-2 text-[13px] font-medium">Subject</legend>
              <div className="flex flex-wrap gap-2">
                {[{ subject: '', questions: 0 }, ...subjects].map((s) => {
                  const active = (subject ?? '') === s.subject;
                  return (
                    <button
                      key={s.subject || 'all'}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setParams(s.subject ? { subject: s.subject } : {}, { replace: true })}
                      className={cn('min-h-10 rounded-full border px-3.5 text-[13px] font-medium transition-colors', active ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-card hover:bg-muted')}
                    >
                      {s.subject || 'All my subjects'}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
        </Intro>
      </GameFrame>
    );
  }
  if (phase.kind === 'loading') return <GameFrame meta={meta}><Loading /></GameFrame>;
  if (phase.kind === 'finishing') return <GameFrame meta={meta}><Loading label="Adding up your score…" /></GameFrame>;
  if (phase.kind === 'error') return <GameFrame meta={meta}><Problem message={phase.message} onRetry={phase.retry} /></GameFrame>;
  if (phase.kind === 'result') {
    const r = phase.result;
    return (
      <GameFrame meta={meta}>
        <ResultView meta={meta} correct={r.correct} total={r.total} sub={`${r.score.toLocaleString('en-GB')} points`} result={r} review={r.review} onAgain={() => void begin()} />
      </GameFrame>
    );
  }
  if (!round || !q) return <GameFrame meta={meta}><Loading /></GameFrame>;

  const stateOf = (i: number) => {
    if (!fb) return picked === i && sending ? 'dim' : 'idle';
    if (i === fb.correctIndex) return fb.correct ? 'right' : 'missed';
    if (i === picked) return 'wrong';
    return 'dim';
  };

  return (
    <GameFrame meta={meta}>
      <Hud
        items={[
          { label: 'Question', value: `${index + 1}/${round.questions.length}` },
          { label: 'Score', value: score.toLocaleString('en-GB'), icon: <Star className="size-3.5 text-warning" aria-hidden /> },
          ...(lives !== null && round.lives ? [{ label: 'Lives', value: <Lives left={lives} of={round.lives} /> }] : []),
          ...(run >= 2 ? [{ label: 'Run', value: `${run} in a row`, icon: <Flame className="size-3.5 text-warning" aria-hidden /> }] : []),
        ]}
      />
      {!daily ? <TimeBar leftMs={fb ? 0 : left} totalMs={round.secondsPerQuestion * 1000} paused={!!fb} /> : <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-brand" style={{ width: `${(100 * index) / round.questions.length}%` }} /></div>}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        {(q.subject || q.topic) && <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">{[q.subject, q.topic].filter(Boolean).join(' · ')}</p>}
        <h2 className="text-[17px] font-semibold leading-snug sm:text-lg">{q.prompt}</h2>
        <div className="mt-4 space-y-2.5">
          {q.options.map((o, i) => (
            <OptionButton key={i} n={i + 1} label={o} state={stateOf(i)} disabled={!!fb || sending} onClick={() => void choose(i)} />
          ))}
        </div>
        {fb && <Feedback correct={fb.correct} timedOut={picked === null} text={fb.tooFast ? 'That was too quick to count for points.' : fb.correct ? (fb.points ? `+${fb.points} points` : null) : fb.explanation} />}
        {fb && !fb.correct && (
          <Button size="lg" className="mt-4 h-12 w-full" onClick={() => next()} autoFocus>
            {fb.done ? (
              <>
                <Trophy /> See your score
              </>
            ) : (
              'Next question'
            )}
          </Button>
        )}
      </div>
    </GameFrame>
  );
}
