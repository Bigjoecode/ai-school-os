import { crosswordFor, crosswordGrid, entryCells, markLocalRound, type CrosswordEntry, type GameRoundResult, type LocalScoreInput } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Flag, Lightbulb } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { gk, newClientId, submitScore } from './api';
import type { GameMeta } from './meta';
import { useGameMode } from './mode';
import { play } from './sound';
import { forTheEar, stopSpeaking } from './speech';
import { GameFrame, Hud, Intro, ResultView, SpeakButton } from './ui';

const randomSeed = () => {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  } catch {
    return Math.floor(Math.random() * 0xffffffff);
  }
};

/** Points: 10 a word, a revealed letter costs 5 (the server works out XP the same way: hints cost XP). */
const HINT_COST = 5;
const key = (r: number, c: number) => `${r},${c}`;

/**
 * Crossword: 5–8 words from the student's subjects, the meanings as clues,
 * built on the phone from a seed (works offline) and marked again by the
 * server from the same seed. Check shows wrong letters in place; a hint
 * reveals a letter for a few points.
 */
export default function Crossword({ meta }: { meta: GameMeta }) {
  const mode = useGameMode();
  const qc = useQueryClient();
  const [seed, setSeed] = useState(randomSeed);
  const [phase, setPhase] = useState<'intro' | 'play' | 'result'>('intro');
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState(false);
  const [active, setActive] = useState(0);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [hints, setHints] = useState(0);
  const [outcome, setOutcome] = useState<{ result?: GameRoundResult; queued?: boolean; rejected?: string } | null>(null);
  const startedAt = useRef(0);
  const cells = useRef(new Map<string, HTMLInputElement>());
  const pz = useMemo(() => crosswordFor(seed, mode.level, mode.year, mode.young), [seed, mode.level, mode.year, mode.young]);
  const solution = useMemo(() => crosswordGrid(pz), [pz]);
  const entry = pz.entries[active];
  const big = mode.young;

  useEffect(() => () => stopSpeaking(), []);

  function begin() {
    setSeed(randomSeed());
    setLetters({});
    setRevealed(new Set());
    setChecked(false);
    setActive(0);
    setCursor(null);
    setHints(0);
    setOutcome(null);
    setPhase('play');
    startedAt.current = Date.now();
  }

  const typedOf = (e: CrosswordEntry) => entryCells(e).map(([r, c]) => letters[key(r, c)] || '?').join('');
  const solved = (e: CrosswordEntry) => typedOf(e) === e.answer;
  const doneCount = pz.entries.filter(solved).length;
  const points = Math.max(0, doneCount * 10 - hints * HINT_COST);

  function focusCell(r: number, c: number) {
    setCursor([r, c]);
    cells.current.get(key(r, c))?.focus();
  }

  function selectEntry(k: number) {
    const e = pz.entries[k]!;
    setActive(k);
    const empty = entryCells(e).find(([r, c]) => !letters[key(r, c)]) ?? entryCells(e)[0]!;
    focusCell(empty[0], empty[1]);
  }

  /** Tapping a cell: pick the entry through it (tap again to switch across/down). */
  function tapCell(r: number, c: number) {
    const through = pz.entries.map((e, k) => ({ e, k })).filter(({ e }) => entryCells(e).some(([a, b]) => a === r && b === c));
    if (!through.length) return;
    const same = cursor && cursor[0] === r && cursor[1] === c;
    const cur = through.findIndex((x) => x.k === active);
    const pick = same && through.length > 1 ? through[(cur + 1) % through.length]! : cur >= 0 ? through[cur]! : through[0]!;
    setActive(pick.k);
    setCursor([r, c]);
  }

  function type(r: number, c: number, ch: string) {
    if (revealed.has(key(r, c))) return;
    const v = ch.toUpperCase().replace(/[^A-Z]/g, '').slice(-1);
    setLetters((l) => ({ ...l, [key(r, c)]: v }));
    setChecked(false);
    if (!v || !entry) return;
    play('tap');
    // On to the next square of the word.
    const list = entryCells(entry);
    const at = list.findIndex(([a, b]) => a === r && b === c);
    const next = list[at + 1];
    if (next) focusCell(next[0], next[1]);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>, r: number, c: number) {
    if (e.key === 'Backspace' && !letters[key(r, c)] && entry) {
      const list = entryCells(entry);
      const at = list.findIndex(([a, b]) => a === r && b === c);
      const prev = list[at - 1];
      if (prev) {
        e.preventDefault();
        if (!revealed.has(key(prev[0], prev[1]))) setLetters((l) => ({ ...l, [key(prev[0], prev[1])]: '' }));
        focusCell(prev[0], prev[1]);
      }
    }
    if (e.key === 'Enter') check();
  }

  function check() {
    setChecked(true);
    const all = pz.entries.every(solved);
    play(all ? 'done' : doneCount ? 'right' : 'wrong');
    if (all) void finish();
  }

  /** Reveals one letter: the square you're on if it's empty or wrong, else the first such square of the clue. */
  function hint() {
    if (!entry) return;
    const list = entryCells(entry);
    const wrong = ([r, c]: readonly [number, number]) => (letters[key(r, c)] ?? '') !== solution[r]![c];
    const target = (cursor && list.some(([a, b]) => a === cursor[0] && b === cursor[1]) && wrong(cursor) ? cursor : null) ?? list.find(wrong);
    if (!target) return;
    const [r, c] = target;
    setLetters((l) => ({ ...l, [key(r, c)]: solution[r]![c]! }));
    setRevealed((s) => new Set(s).add(key(r, c)));
    setHints((h) => h + 1);
    play('tap');
  }

  const finishing = useRef(false);
  async function finish() {
    if (finishing.current) return;
    finishing.current = true;
    setPhase('result');
    const input: LocalScoreInput = {
      game: 'CROSSWORD',
      clientId: newClientId(),
      playedAt: new Date().toISOString(),
      durationMs: Math.min(10 * 60_000, Date.now() - startedAt.current),
      seed,
      level: mode.level,
      year: mode.year,
      young: mode.young,
      entries: pz.entries.map(typedOf),
      hints,
    };
    const out = await submitScore(input);
    finishing.current = false;
    if (out.kind === 'saved') {
      setOutcome({ result: out.result });
      void qc.invalidateQueries({ queryKey: gk.hub });
    } else if (out.kind === 'queued') setOutcome({ queued: true });
    else setOutcome({ rejected: out.message });
  }

  if (phase === 'intro') {
    return (
      <GameFrame meta={meta}>
        <Intro
          meta={meta}
          onStart={begin}
          rules={
            mode.young
              ? ['Read the clue (or tap the speaker).', 'Type the word in the boxes.', 'Stuck? A hint shows a letter.']
              : ['5 to 8 words from your subjects; the clues are their meanings.', 'Tap a square or a clue, then type. Check shows wrong letters in red.', `A hint reveals a letter and costs ${HINT_COST} points. No clock. Works offline.`]
          }
        />
      </GameFrame>
    );
  }
  if (phase === 'result') {
    const mark = markLocalRound({ game: 'CROSSWORD', clientId: 'x', playedAt: new Date().toISOString(), durationMs: 600_000, seed, level: mode.level, year: mode.year, young: mode.young, entries: pz.entries.map(typedOf), hints });
    return (
      <GameFrame meta={meta}>
        <ResultView
          meta={meta}
          correct={mark.correct}
          total={mark.total}
          headline={`${mark.correct}/${mark.total} words`}
          sub={`${points} points · ${hints} hint${hints === 1 ? '' : 's'}`}
          result={outcome?.result}
          queued={outcome?.queued}
          rejected={outcome?.rejected}
          onAgain={begin}
          extra={
            <ul className="mt-4 space-y-1 text-left text-[13px]">
              {pz.entries.map((e) => (
                <li key={`${e.n}${e.dir}`} className={cn('rounded-lg px-2.5 py-1.5', solved(e) ? 'bg-success-soft' : 'bg-muted/60')}>
                  <span className="font-semibold">
                    {e.n} {e.dir}: {e.answer}
                  </span>{' '}
                  <span className="text-muted-foreground">· {e.clue}</span>
                </li>
              ))}
            </ul>
          }
        />
      </GameFrame>
    );
  }

  const activeCells = new Set(entry ? entryCells(entry).map(([r, c]) => key(r, c)) : []);
  const numbers = new Map(pz.entries.map((e) => [key(e.row, e.col), e.n]));
  const clueText = (e: CrosswordEntry) => `${e.clue} (${e.answer.length})`;

  return (
    <GameFrame meta={meta}>
      <p className={cn('mb-2 truncate font-semibold', big ? 'text-lg' : 'text-[14px]')}>{pz.title}</p>
      <Hud
        items={[
          { label: 'Words', value: `${doneCount} of ${pz.entries.length} words` },
          { label: 'Points', value: `${points} points` },
          ...(hints ? [{ label: 'Hints', value: `${hints} hint${hints === 1 ? '' : 's'}` }] : []),
        ]}
      />
      {entry && (
        <div className="sticky top-2 z-10 mb-3 flex items-start gap-2 rounded-2xl border border-brand/40 bg-brand-soft px-3 py-2.5 shadow-soft">
          <span className={cn('min-w-0 flex-1', big ? 'text-lg' : 'text-[14px]')}>
            <strong className="font-semibold">
              {entry.n} {entry.dir}:
            </strong>{' '}
            {clueText(entry)}
          </span>
          <SpeakButton parts={[`${entry.n} ${entry.dir}.`, forTheEar(entry.clue), `${entry.answer.length} letters.`]} label="Hear the clue" />
        </div>
      )}
      <div className="mx-auto w-fit max-w-full overflow-x-auto rounded-2xl border border-border bg-muted/60 p-1.5 shadow-soft">
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${pz.cols}, ${big ? 'minmax(0, 2.6rem)' : 'minmax(0, 2.15rem)'})` }} role="grid" aria-label="Crossword">
          {solution.map((row, r) =>
            row.map((sol, c) => {
              if (!sol) return <div key={`${r}-${c}`} aria-hidden className="aspect-square" />;
              const k = key(r, c);
              const v = letters[k] ?? '';
              const wrong = checked && v && v !== sol;
              const right = checked && v === sol;
              const here = cursor && cursor[0] === r && cursor[1] === c;
              return (
                <div key={k} className="relative aspect-square" role="gridcell">
                  {numbers.has(k) && <span className="pointer-events-none absolute left-0.5 top-0 text-[9px] font-semibold leading-none text-muted-foreground">{numbers.get(k)}</span>}
                  <input
                    ref={(el) => {
                      if (el) cells.current.set(k, el);
                      else cells.current.delete(k);
                    }}
                    value={v}
                    onChange={(e) => type(r, c, e.target.value)}
                    onKeyDown={(e) => onKey(e, r, c)}
                    onClick={() => tapCell(r, c)}
                    readOnly={revealed.has(k)}
                    maxLength={2}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    aria-label={`Row ${r + 1}, column ${c + 1}${numbers.has(k) ? `, clue ${numbers.get(k)}` : ''}${revealed.has(k) ? ', revealed' : ''}`}
                    className={cn(
                      'size-full rounded-[5px] border text-center font-display font-semibold uppercase caret-transparent outline-none transition-colors',
                      big ? 'text-xl' : 'text-[17px]',
                      activeCells.has(k) ? 'border-brand/50 bg-brand-soft' : 'border-border bg-card',
                      here && 'ring-2 ring-brand',
                      revealed.has(k) && 'text-brand',
                      wrong && 'border-danger bg-danger-soft text-danger',
                      right && !revealed.has(k) && 'text-success',
                    )}
                  />
                </div>
              );
            }),
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button variant="outline" size="lg" className="h-12" onClick={hint} disabled={!entry || solved(entry)}>
          <Lightbulb /> Hint
        </Button>
        <Button variant="brand" size="lg" className="h-12" onClick={check}>
          <CheckCheck /> Check
        </Button>
        <Button variant="outline" size="lg" className="h-12" onClick={() => void finish()}>
          <Flag /> Finish
        </Button>
      </div>
      <p className="mt-1 text-center text-[12px] text-muted-foreground">A hint costs {HINT_COST} points.</p>
      {(['across', 'down'] as const).map((dir) => (
        <section key={dir} className="mt-4">
          <h2 className="mb-1.5 text-[13px] font-semibold capitalize text-muted-foreground">{dir}</h2>
          <ol className="space-y-1">
            {pz.entries.map((e, k) =>
              e.dir === dir ? (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => selectEntry(k)}
                    className={cn('flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition-colors', big ? 'text-[16px]' : 'text-[13.5px]', k === active ? 'bg-brand-soft' : 'hover:bg-muted', solved(e) && checked && 'text-success')}
                  >
                    <span className="w-6 shrink-0 font-semibold tabular">{e.n}</span>
                    <span className={cn('min-w-0', solved(e) && checked && 'line-through')}>{clueText(e)}</span>
                  </button>
                </li>
              ) : null,
            )}
          </ol>
        </section>
      ))}
    </GameFrame>
  );
}
