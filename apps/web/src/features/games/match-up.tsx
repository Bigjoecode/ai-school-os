import { isTrivialPair, MATCH_ROUND, matchPacksFor, seededShuffle, type GameLevel, type GameRoundResult, type LocalScoreInput } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpenCheck, Star, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { gk, newClientId, submitScore, syllabusPack, useGamesHub } from './api';
import type { GameMeta } from './meta';
import { useGameMode } from './mode';
import { buzz, play } from './sound';
import { GameFrame, Hud, Intro, ResultView } from './ui';

interface Deal {
  packId: string;
  title: string;
  leftLabel: string;
  rightLabel: string;
  /** Indexes into a curated pack, or positions in a syllabus pack. */
  pairIds: number[];
  pairs: [string, string][];
}
interface Card {
  key: string;
  pair: number;
  side: 0 | 1;
  text: string;
}

const random = () => Math.random();

/** Match Up: a memory game of pairs from curated packs (offline) or built from the student's syllabus (online). */
export default function MatchUp({ meta }: { meta: GameMeta }) {
  const hub = useGamesHub();
  const qc = useQueryClient();
  const mode = useGameMode();
  const level: GameLevel = mode.level;
  // Packs written for the student's year first (the whole stage if few suit it).
  const packs = matchPacksFor(level, mode.year);
  const subjects = (hub.data?.subjects ?? []).map((s) => s.subject);
  const [choice, setChoice] = useState<string>(packs[0]?.id ?? '');
  const [deal, setDeal] = useState<Deal | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [up, setUp] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [misses, setMisses] = useState(0);
  const [phase, setPhase] = useState<'intro' | 'loading' | 'play' | 'result'>('intro');
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ result?: GameRoundResult; queued?: boolean; rejected?: string } | null>(null);
  const startedAt = useRef(0);
  const busy = useRef(false);

  async function begin() {
    setError(null);
    let d: Deal | null = null;
    if (choice.startsWith('syl:')) {
      setPhase('loading');
      try {
        const p = await syllabusPack(choice.slice(4));
        if (!p) {
          setPhase('intro');
          return setError('That subject’s syllabus doesn’t have enough topics for a game yet. Pick another pack.');
        }
        d = { packId: p.id, title: p.title, leftLabel: p.leftLabel, rightLabel: p.rightLabel, pairIds: p.pairs.map((_, k) => k), pairs: p.pairs };
      } catch (err) {
        setPhase('intro');
        return setError(errorMessage(err));
      }
    } else {
      const pack = packs.find((p) => p.id === choice) ?? packs[0]!;
      const ids = seededShuffle(
        pack.pairs.map((_, k) => k).filter((k) => !isTrivialPair(pack.pairs[k]!)),
        random,
      ).slice(0, MATCH_ROUND.pairs);
      d = { packId: pack.id, title: pack.title, leftLabel: pack.leftLabel, rightLabel: pack.rightLabel, pairIds: ids, pairs: ids.map((k) => pack.pairs[k]!) };
    }
    setDeal(d);
    setCards(
      seededShuffle(
        d.pairs.flatMap(([l, r], k) => [
          { key: `${k}L`, pair: k, side: 0 as const, text: l },
          { key: `${k}R`, pair: k, side: 1 as const, text: r },
        ]),
        random,
      ),
    );
    setUp([]);
    setMatched(new Set());
    setMisses(0);
    setOutcome(null);
    startedAt.current = Date.now();
    setPhase('play');
  }

  function flip(i: number) {
    if (busy.current || up.includes(i) || matched.has(cards[i]!.pair)) return;
    play('tap');
    const now = [...up, i];
    setUp(now);
    if (now.length < 2) return;
    const [a, b] = now.map((k) => cards[k]!);
    busy.current = true;
    if (a!.pair === b!.pair) {
      play('right');
      window.setTimeout(() => {
        setMatched((m) => new Set(m).add(a!.pair));
        setUp([]);
        busy.current = false;
      }, 350);
    } else {
      buzz(25);
      setMisses((x) => x + 1);
      window.setTimeout(() => {
        setUp([]);
        busy.current = false;
      }, 900);
    }
  }

  // All pairs found: send the score.
  useEffect(() => {
    if (phase !== 'play' || !deal || matched.size < deal.pairs.length) return;
    setPhase('result');
    const input: LocalScoreInput = { game: 'MATCH_UP', clientId: newClientId(), playedAt: new Date().toISOString(), durationMs: Date.now() - startedAt.current, packId: deal.packId, pairs: deal.pairIds, matched: matched.size, misses };
    void submitScore(input).then((out) => {
      if (out.kind === 'saved') {
        setOutcome({ result: out.result });
        void qc.invalidateQueries({ queryKey: gk.hub });
      } else if (out.kind === 'queued') setOutcome({ queued: true });
      else setOutcome({ rejected: out.message });
    });
  }, [matched, deal, phase, misses, qc]);

  if (phase === 'intro' || phase === 'loading') {
    return (
      <GameFrame meta={meta}>
        <Intro meta={meta} onStart={() => void begin()} starting={phase === 'loading'} rules={[`${MATCH_ROUND.pairs} pairs hidden under ${MATCH_ROUND.pairs * 2} cards.`, 'Turn two cards at a time. Find each match.', 'Fewer misses earn a bonus. The packs work offline.']}>
          <fieldset className="mt-5">
            <legend className="mb-2 text-[13px] font-medium">Pick a pack</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {packs.map((p) => (
                <PackOption key={p.id} active={choice === p.id} onClick={() => setChoice(p.id)} title={p.title} note={`${p.subject} · ${p.leftLabel} ↔ ${p.rightLabel}`} />
              ))}
              {subjects.map((s) => (
                <PackOption key={s} active={choice === `syl:${s}`} onClick={() => setChoice(`syl:${s}`)} title={`${s}: syllabus topics`} note="From your syllabus · needs internet" syllabus />
              ))}
            </div>
          </fieldset>
          {error && (
            <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[13px]" role="alert">
              {error}
            </p>
          )}
        </Intro>
      </GameFrame>
    );
  }
  if (phase === 'result' && deal) {
    return (
      <GameFrame meta={meta}>
        <ResultView
          meta={meta}
          correct={matched.size}
          total={deal.pairs.length}
          headline={`${misses} miss${misses === 1 ? '' : 'es'}`}
          sub={`All ${deal.pairs.length} pairs found in ${Math.round((Date.now() - startedAt.current) / 1000)} seconds`}
          result={outcome?.result}
          queued={outcome?.queued}
          rejected={outcome?.rejected}
          onAgain={() => void begin()}
          extra={
            <ul className="mt-4 space-y-1 text-left text-[13px]">
              {deal.pairs.map(([l, r]) => (
                <li key={l} className="rounded-lg bg-muted/60 px-2.5 py-1.5">
                  <span className="font-medium">{l}</span> <span className="text-muted-foreground">↔</span> {r}
                </li>
              ))}
            </ul>
          }
        />
      </GameFrame>
    );
  }
  if (!deal) return null;
  return (
    <GameFrame meta={meta}>
      <p className="mb-2 truncate text-[13px] text-muted-foreground">{deal.title}</p>
      <Hud
        items={[
          { label: 'Pairs found', value: `${matched.size}/${deal.pairs.length}`, icon: <Star className="size-3.5 text-warning" aria-hidden /> },
          { label: 'Misses', value: `${misses} miss${misses === 1 ? '' : 'es'}`, icon: <X className="size-3.5 text-danger" aria-hidden /> },
        ]}
      />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {cards.map((c, i) => {
          const isUp = up.includes(i);
          const done = matched.has(c.pair);
          const shown = isUp || done;
          const wrong = isUp && up.length === 2 && cards[up[0]!]!.pair !== cards[up[1]!]!.pair;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => flip(i)}
              disabled={done}
              aria-label={shown ? `${c.side === 0 ? deal.leftLabel : deal.rightLabel}: ${c.text}${done ? ', matched' : ''}` : `Card ${i + 1}, face down`}
              className={cn(
                'relative flex min-h-24 flex-col items-center justify-center rounded-2xl border-2 p-2 text-center text-[12.5px] font-semibold leading-tight transition-[background-color,border-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:min-h-28 sm:text-[13.5px]',
                !shown && 'border-transparent text-white hover:brightness-110',
                shown && !done && !wrong && 'border-brand bg-card',
                wrong && 'border-danger bg-danger-soft',
                done && 'border-success bg-success-soft',
              )}
              style={!shown ? { background: `linear-gradient(135deg, ${meta.accent}, color-mix(in oklab, ${meta.accent} 60%, var(--ai-2)))` } : undefined}
            >
              {shown ? (
                <>
                  <span className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{c.side === 0 ? deal.leftLabel : deal.rightLabel}</span>
                  <span className="break-words">{c.text}</span>
                  {done && <span className="sr-only">matched</span>}
                </>
              ) : (
                <span className="text-2xl" aria-hidden>
                  ?
                </span>
              )}
            </button>
          );
        })}
      </div>
    </GameFrame>
  );
}

function PackOption({ active, onClick, title, note, syllabus }: { active: boolean; onClick: () => void; title: string; note: string; syllabus?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn('flex min-h-14 items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors', active ? 'border-brand bg-brand-soft' : 'border-border bg-card hover:bg-muted')}
    >
      {syllabus && <BookOpenCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium">{title}</span>
        <span className="block text-[12px] text-muted-foreground">{note}</span>
      </span>
    </button>
  );
}

