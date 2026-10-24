import { emptyChemTitrationState, type ChemTitrationState, type PracticalCheckResult, type PracticalLessonView } from '@aischool/shared';
import { Check, ChevronLeft, ChevronRight, GraduationCap, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { usePracticalMiniCheck } from '../../../api';
import { ASSISTANT_NAME } from './assistant';
import { explainer } from './explain';
import { SPOT } from './layout';
import { APPARATUS } from './scene-state';
import { useLabView, type Spot } from './store';
import { say } from './voice';

/**
 * "Learn first": Mrs Ada introduces the practical at the student's bench,
 * card by card, from the practical's own lesson — aim, each piece of apparatus
 * (highlighted, with the camera on it), safety, procedure, what to observe,
 * the worked calculation, precautions and common mistakes — then a short
 * three-question check from the lesson's quick check.
 */

/** The bench as Mrs Ada sets it out for the introduction (display only, never saved). */
export const LEARN_STATE: ChemTitrationState = {
  ...emptyChemTitrationState(),
  log: [...APPARATUS.filter((a) => a.needed).map((a) => ({ t: 0, a: `collect:${a.id}` })), { t: 0, a: 'clamp-burette' }, { t: 0, a: 'safety:goggles' }],
};

/** Lesson apparatus lines → the object on the bench (first match wins). */
const ITEM_KEYS: [RegExp, string][] = [
  [/burette/i, 'burette'],
  [/pipette filler|filler/i, 'filler'],
  [/pipette/i, 'pipette'],
  [/conical flask|flask/i, 'flask'],
  [/retort|stand|clamp/i, 'stand'],
  [/white tile|tile/i, 'tile'],
  [/funnel/i, 'funnel'],
  [/wash bottle|distilled water/i, 'washBottle'],
  [/beaker/i, 'beaker'],
];
const ITEM_SPOT: Record<string, Spot> = {
  burette: { target: [SPOT.buretteAxis[0], 0.45, SPOT.buretteAxis[2]], dist: 0.85, pitch: 0.12 },
  pipette: { target: [SPOT.pipette[0], 0.02, SPOT.pipette[2]], dist: 0.55, pitch: 0.55 },
  filler: { target: [SPOT.pipette[0], 0.02, SPOT.pipette[2]], dist: 0.55, pitch: 0.55 },
  flask: { target: [SPOT.flaskHome[0], 0.07, SPOT.flaskHome[2]], dist: 0.42, pitch: 0.35 },
  stand: { target: [SPOT.standBase[0], 0.35, SPOT.standBase[2]], dist: 0.95, pitch: 0.2 },
  tile: { target: [SPOT.buretteAxis[0], 0.02, SPOT.buretteAxis[2]], dist: 0.42, pitch: 0.6 },
  funnel: { target: [SPOT.funnelHome[0], 0.05, SPOT.funnelHome[2]], dist: 0.4, pitch: 0.45 },
  washBottle: { target: [SPOT.washBottle[0], 0.08, SPOT.washBottle[2]], dist: 0.5, pitch: 0.3 },
  beaker: { target: [SPOT.beaker[0], 0.04, SPOT.beaker[2]], dist: 0.42, pitch: 0.4 },
};
const BENCH_SPOT: Spot = { target: [0.12, 0.14, -0.06], dist: 1.05, pitch: 0.55 };

interface LearnCard {
  id: string;
  kicker: string;
  title: string;
  body: ReactNode;
  /** Said aloud when voice is on. */
  speech: string;
  spot: Spot;
  point: string | null;
}

const List = ({ items, ordered }: { items: string[]; ordered?: boolean }) =>
  ordered ? (
    <ol className="list-decimal space-y-1 pl-5">
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ol>
  ) : (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );

export function learnCards(l: PracticalLessonView): LearnCard[] {
  const cards: LearnCard[] = [
    { id: 'aim', kicker: 'The aim', title: l.title, body: <p>{l.aim}</p>, speech: `Welcome! Today's practical: ${l.aim}`, spot: BENCH_SPOT, point: null },
  ];
  const seen = new Set<string>();
  for (const line of l.apparatus ?? []) {
    const id = ITEM_KEYS.find(([re]) => re.test(line))?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const e = explainer(id);
    cards.push({
      id: `item-${id}`,
      kicker: 'Apparatus',
      title: line,
      body: e ? (
        <dl className="space-y-1.5">
          <div>
            <dt className="font-semibold">What it is for</dt>
            <dd className="text-muted-foreground">{e.purpose}</dd>
          </div>
          <div>
            <dt className="font-semibold">How to use it</dt>
            <dd className="text-muted-foreground">{e.how}</dd>
          </div>
        </dl>
      ) : null,
      speech: e ? `This is the ${line.toLowerCase()}. ${e.purpose} ${e.how}` : line,
      spot: ITEM_SPOT[id] ?? BENCH_SPOT,
      point: id,
    });
  }
  if (l.safety?.length) cards.push({ id: 'safety', kicker: 'Safety', title: 'Stay safe', body: <List items={l.safety} />, speech: l.safety.join(' '), spot: BENCH_SPOT, point: null });
  const proc = l.procedure ?? [];
  const half = Math.ceil(proc.length / 2);
  if (proc.length)
    cards.push({ id: 'procedure-1', kicker: 'Procedure', title: proc.length > 4 ? 'What you will do (1 of 2)' : 'What you will do', body: <List ordered items={proc.length > 4 ? proc.slice(0, half) : proc} />, speech: (proc.length > 4 ? proc.slice(0, half) : proc).join(' '), spot: ITEM_SPOT.burette!, point: 'burette' });
  if (proc.length > 4)
    cards.push({
      id: 'procedure-2',
      kicker: 'Procedure',
      title: 'What you will do (2 of 2)',
      body: (
        <ol className="list-decimal space-y-1 pl-5" start={half + 1}>
          {proc.slice(half).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
      ),
      speech: proc.slice(half).join(' '),
      spot: ITEM_SPOT.flask!,
      point: 'flask',
    });
  if (l.expectedObservations) cards.push({ id: 'observe', kicker: 'What to observe', title: 'At the end point', body: <p>{l.expectedObservations}</p>, speech: l.expectedObservations, spot: ITEM_SPOT.tile!, point: 'flask' });
  if (l.dataAndCalculations) cards.push({ id: 'calc', kicker: 'The calculation', title: 'A worked example (sample data)', body: <p className="whitespace-pre-line">{l.dataAndCalculations}</p>, speech: 'Here is how the calculation works, with sample data.', spot: BENCH_SPOT, point: 'book' });
  if (l.precautions?.length || l.commonMistakes?.length)
    cards.push({
      id: 'precautions',
      kicker: 'Precautions and common mistakes',
      title: 'Get the marks',
      body: (
        <div className="space-y-2">
          {!!l.precautions?.length && (
            <div>
              <p className="font-semibold">Precautions</p>
              <List items={l.precautions} />
            </div>
          )}
          {!!l.commonMistakes?.length && (
            <div>
              <p className="font-semibold text-warning">Common mistakes</p>
              <List items={l.commonMistakes} />
            </div>
          )}
        </div>
      ),
      speech: `Precautions: ${(l.precautions ?? []).slice(0, 3).join(' ')}`,
      spot: BENCH_SPOT,
      point: null,
    });
  return cards;
}

export function LearnStage({ lesson, practicalId, onDone, onClose, onCard }: { lesson: PracticalLessonView | undefined; practicalId: string; onDone: () => void; onClose: () => void; onCard: (title: string) => void }) {
  const cards = useMemo(() => (lesson ? learnCards(lesson) : []), [lesson]);
  const checks = useMemo(() => (lesson?.checkQuestions ?? []).slice(0, 3), [lesson]);
  const total = cards.length + (checks.length ? 1 : 0);
  const [i, setI] = useState(0);
  const card = cards[i];
  const onCheck = i >= cards.length;

  useEffect(() => {
    if (!card) return;
    useLabView.setState({ mode: 'bench', spot: card.spot, target: card.point, selected: card.point && card.point !== 'book' ? card.point : null, ada: { at: 'bench', point: card.point, goggles: true } });
    onCard(card.title);
    say(card.speech);
  }, [card, onCard]);
  useEffect(() => {
    if (onCheck) {
      useLabView.setState({ spot: BENCH_SPOT, selected: null, ada: { at: 'bench', point: null, goggles: true } });
      onCard('Quick check');
    }
  }, [onCheck, onCard]);

  if (!lesson)
    return (
      <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-w-lg rounded-2xl bg-card p-4 text-card-foreground shadow-2xl">
        <p className="text-[13.5px] text-muted-foreground">Loading the lesson…</p>
      </section>
    );

  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto flex max-h-[62%] max-w-lg flex-col rounded-2xl border border-border bg-card text-card-foreground shadow-2xl sm:bottom-4" aria-label="Learn first">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2">
        <GraduationCap className="size-4 text-brand" aria-hidden />
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          Learn first · {Math.min(i + 1, total)} of {total} · {onCheck ? 'Quick check' : card?.kicker}
        </p>
        <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={onClose} aria-label="Leave Learn">
          <X />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 text-[13.5px] leading-snug">
        {!onCheck && card && (
          <>
            <h3 className="font-display text-[16px] font-semibold tracking-tight">{card.title}</h3>
            <div className="mt-1.5">{card.body}</div>
            <p className="mt-2 text-[11.5px] text-muted-foreground">{ASSISTANT_NAME} is showing you this at your bench.</p>
          </>
        )}
        {onCheck && <MiniCheck practicalId={practicalId} questions={checks} onPassed={onDone} />}
      </div>
      <footer className="flex items-center gap-2 border-t border-border px-4 py-2">
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: total }, (_, k) => (
            <span key={k} className={cn('size-1.5 rounded-full', k === i ? 'bg-brand' : k < i ? 'bg-brand/40' : 'bg-muted')} />
          ))}
        </div>
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="outline" disabled={i === 0} onClick={() => setI(i - 1)}>
            <ChevronLeft /> Back
          </Button>
          {!onCheck && (
            <Button size="sm" variant="brand" onClick={() => (i + 1 < total ? setI(i + 1) : onDone())}>
              {i + 1 < total ? 'Next' : 'Finish'} <ChevronRight />
            </Button>
          )}
        </div>
      </footer>
    </section>
  );
}

function MiniCheck({ practicalId, questions, onPassed }: { practicalId: string; questions: { q: string; options: string[] }[]; onPassed: () => void }) {
  const [answers, setAnswers] = useState<number[]>(() => questions.map(() => -1));
  const [result, setResult] = useState<PracticalCheckResult | null>(null);
  const check = usePracticalMiniCheck(practicalId);
  return (
    <div className="space-y-3">
      <h3 className="font-display text-[16px] font-semibold tracking-tight">Quick check</h3>
      {questions.map((q, k) => (
        <fieldset key={q.q} className="space-y-1">
          <legend className="font-medium">
            {k + 1}. {q.q}
          </legend>
          {q.options.map((o, j) => {
            const item = result?.items[k];
            const right = item && j === item.answer;
            const wrong = item && j === answers[k] && !item.correct;
            return (
              <label key={o} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5', answers[k] === j ? 'border-brand bg-brand-soft' : 'border-border', right && 'border-success bg-success-soft', wrong && 'border-danger bg-danger-soft')}>
                <input type="radio" name={`q${k}`} checked={answers[k] === j} disabled={!!result} onChange={() => setAnswers((a) => a.map((x, n) => (n === k ? j : x)))} />
                {o}
              </label>
            );
          })}
          {result?.items[k] && <p className={cn('text-[12.5px]', result.items[k]!.correct ? 'text-success' : 'text-muted-foreground')}>{result.items[k]!.explanation}</p>}
        </fieldset>
      ))}
      {check.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{errorMessage(check.error)}</p>}
      {!result ? (
        <Button variant="brand" disabled={answers.some((a) => a < 0) || check.isPending} loading={check.isPending} onClick={() => check.mutate({ answers, questions: questions.map((_, k) => k) }, { onSuccess: setResult })}>
          Check my answers
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('inline-flex items-center gap-1.5 font-semibold', result.passed ? 'text-success' : 'text-warning')}>
            <Check className="size-4" aria-hidden /> {result.correct} of {result.total} right
          </p>
          <Button size="sm" variant="outline" onClick={() => (setResult(null), setAnswers(questions.map(() => -1)))}>
            Try again
          </Button>
          <Button size="sm" variant="brand" onClick={onPassed}>
            Finish Learn
          </Button>
        </div>
      )}
    </div>
  );
}
