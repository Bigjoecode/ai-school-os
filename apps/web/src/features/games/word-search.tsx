import { lineLetters, markLocalRound, wordSearchFor, type GameRoundResult, type LocalScoreInput } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Flag, Search } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { gk, newClientId, submitScore } from './api';
import type { GameMeta } from './meta';
import { useGameMode } from './mode';
import { buzz, play } from './sound';
import { speak, stopSpeaking } from './speech';
import { GameFrame, Hud, Intro, ResultView, SpeakButton } from './ui';

const randomSeed = () => {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  } catch {
    return Math.floor(Math.random() * 0xffffffff);
  }
};

type Cell = readonly [number, number];
interface Found {
  word: string;
  r0: number;
  c0: number;
  r1: number;
  c1: number;
  ms: number;
}

/** Highlight colours for found words (chart tokens: fine in light and dark). */
const MARKS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--success)', 'var(--danger)', 'var(--brand)', 'var(--warning)'];

/** The cells of a straight line (across, down or diagonal) from a to b, or null. */
function lineCells(a: Cell, b: Cell): Cell[] | null {
  const dr = Math.sign(b[0] - a[0]);
  const dc = Math.sign(b[1] - a[1]);
  const len = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  if (b[0] - a[0] !== dr * len || b[1] - a[1] !== dc * len) return null;
  return Array.from({ length: len + 1 }, (_, k) => [a[0] + dr * k, a[1] + dc * k] as const);
}

/**
 * Word Search: subject words hidden in a grid built on the phone from a seed
 * (works offline). 6 × 6 across and down for the youngest, 8 × 8 with
 * diagonals for older primary, 10 × 10 every way (backwards too) for
 * secondary. Drag across a word, or tap its first and last letters.
 */
export default function WordSearch({ meta }: { meta: GameMeta }) {
  const mode = useGameMode();
  const qc = useQueryClient();
  const [seed, setSeed] = useState(randomSeed);
  const [phase, setPhase] = useState<'intro' | 'play' | 'result'>('intro');
  const [found, setFound] = useState<Found[]>([]);
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [miss, setMiss] = useState(false);
  const [outcome, setOutcome] = useState<{ result?: GameRoundResult; queued?: boolean; rejected?: string } | null>(null);
  const startedAt = useRef(0);
  const lastFind = useRef(0);
  const dragging = useRef(false);
  const pz = useMemo(() => wordSearchFor(seed, mode.level, mode.year, mode.young), [seed, mode.level, mode.year, mode.young]);
  const n = pz.size;
  const big = mode.young;

  useEffect(() => () => stopSpeaking(), []);

  function begin() {
    setSeed(randomSeed());
    setFound([]);
    setAnchor(null);
    setHover(null);
    setOutcome(null);
    setPhase('play');
    startedAt.current = lastFind.current = Date.now();
  }

  const selection = anchor && hover ? lineCells(anchor, hover) : anchor ? [anchor] : null;
  const inSel = (r: number, c: number) => !!selection?.some(([a, b]) => a === r && b === c);
  const foundAt = (r: number, c: number) => found.findIndex((f) => lineCells([f.r0, f.c0], [f.r1, f.c1])!.some(([a, b]) => a === r && b === c));

  function tryLine(a: Cell, b: Cell) {
    const line = lineLetters(pz.grid, a[0], a[1], b[0], b[1]);
    const back = line ? [...line].reverse().join('') : null;
    const w = pz.words.find((x) => (x.word === line || x.word === back) && !found.some((f) => f.word === x.word));
    setAnchor(null);
    setHover(null);
    if (!w) {
      if (line && line.length > 1) {
        play('wrong');
        buzz(20);
        setMiss(true);
        window.setTimeout(() => setMiss(false), 700);
      }
      return;
    }
    play('right');
    if (big) speak([`${w.word.toLowerCase()}! Well done!`]);
    const now = Date.now();
    const next = [...found, { word: w.word, r0: a[0], c0: a[1], r1: b[0], c1: b[1], ms: Math.min(120_000, now - lastFind.current) }];
    lastFind.current = now;
    setFound(next);
    if (next.length === pz.words.length) void finish(next);
  }

  const finishing = useRef(false);
  async function finish(list = found) {
    if (finishing.current) return;
    finishing.current = true;
    setPhase('result');
    const input: LocalScoreInput = {
      game: 'WORD_SEARCH',
      clientId: newClientId(),
      playedAt: new Date().toISOString(),
      durationMs: Math.min(10 * 60_000, Date.now() - startedAt.current),
      seed,
      level: mode.level,
      year: mode.year,
      young: mode.young,
      found: list.map(({ r0, c0, r1, c1, ms }) => ({ r0, c0, r1, c1, ms })),
    };
    const out = await submitScore(input);
    finishing.current = false;
    if (out.kind === 'saved') {
      setOutcome({ result: out.result });
      void qc.invalidateQueries({ queryKey: gk.hub });
    } else if (out.kind === 'queued') setOutcome({ queued: true });
    else setOutcome({ rejected: out.message });
  }

  // Drag across letters (pointer), or tap the first letter then the last.
  const cellFrom = (e: ReactPointerEvent): Cell | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const v = el?.closest<HTMLElement>('[data-cell]')?.dataset.cell;
    if (!v) return null;
    const [r, c] = v.split(',').map(Number) as [number, number];
    return [r, c];
  };
  const onDown = (e: ReactPointerEvent) => {
    const cell = cellFrom(e);
    if (!cell) return;
    e.preventDefault();
    if (anchor && !dragging.current && (anchor[0] !== cell[0] || anchor[1] !== cell[1])) {
      // Second tap: the end of the word.
      return tryLine(anchor, cell);
    }
    dragging.current = true;
    setAnchor(cell);
    setHover(cell);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!dragging.current || !anchor) return;
    const cell = cellFrom(e);
    if (cell && lineCells(anchor, cell)) setHover(cell);
  };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (anchor && hover && (anchor[0] !== hover[0] || anchor[1] !== hover[1])) tryLine(anchor, hover);
    // A tap on one letter: it stays chosen, waiting for the last letter.
    else setHover(null);
  };

  if (phase === 'intro') {
    return (
      <GameFrame meta={meta}>
        <Intro
          meta={meta}
          onStart={begin}
          rules={
            mode.young
              ? ['Find the hidden words.', 'They go across → or down ↓.', 'Slide your finger over a word.']
              : [
                  `${pz.words.length} words hidden in a ${n} × ${n} grid, on one theme.`,
                  mode.level === 'PRIMARY' ? 'Words run across, down or diagonally.' : 'Words run in any direction: across, down, diagonally, even backwards.',
                  'Drag across a word, or tap its first and last letters. No clock. Works offline.',
                ]
          }
        />
      </GameFrame>
    );
  }
  if (phase === 'result') {
    const mark = markLocalRound({ game: 'WORD_SEARCH', clientId: 'x', playedAt: new Date().toISOString(), durationMs: 600_000, seed, level: mode.level, year: mode.year, young: mode.young, found: found.map(({ r0, c0, r1, c1 }) => ({ r0, c0, r1, c1, ms: 5000 })) });
    return (
      <GameFrame meta={meta}>
        <ResultView
          meta={meta}
          correct={mark.correct}
          total={mark.total}
          headline={`${mark.correct}/${mark.total} words`}
          sub={pz.title}
          result={outcome?.result}
          queued={outcome?.queued}
          rejected={outcome?.rejected}
          onAgain={begin}
          extra={
            <ul className="mt-4 grid grid-cols-2 gap-1.5 text-left text-[13px]">
              {pz.words.map((w) => {
                const ok = found.some((f) => f.word === w.word);
                return (
                  <li key={w.word} className={cn('rounded-lg px-2 py-1', ok ? 'bg-success-soft' : 'bg-muted')}>
                    <span className="font-semibold">{ok ? '✓' : '·'} {w.word}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">{w.clue}</span>
                  </li>
                );
              })}
            </ul>
          }
        />
      </GameFrame>
    );
  }

  return (
    <GameFrame meta={meta}>
      <div className="mb-2 flex items-center gap-2">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className={cn('min-w-0 flex-1 truncate font-semibold', big ? 'text-lg' : 'text-[14px]')}>{pz.title}</p>
        <SpeakButton parts={[pz.title, 'Find these words:', ...pz.words.filter((w) => !found.some((f) => f.word === w.word)).map((w) => w.word.toLowerCase())]} label="Hear the words to find" />
      </div>
      <Hud items={[{ label: 'Found', value: `${found.length} of ${pz.words.length} found` }]} />
      <div
        role="grid"
        aria-label={`Letter grid, ${n} by ${n}`}
        className={cn('grid touch-none select-none gap-[3px] rounded-2xl border-2 bg-card p-1.5 shadow-soft transition-colors', miss ? 'border-danger' : 'border-border')}
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {pz.grid.map((row, r) =>
          [...row].map((ch, c) => {
            const f = foundAt(r, c);
            const sel = inSel(r, c);
            return (
              <div
                key={`${r}-${c}`}
                role="gridcell"
                data-cell={`${r},${c}`}
                aria-selected={sel}
                className={cn(
                  'grid aspect-square place-items-center rounded-md font-display font-semibold uppercase',
                  n <= 6 ? 'text-3xl' : n <= 8 ? 'text-2xl' : 'text-lg',
                  sel ? 'bg-brand text-brand-foreground' : f < 0 && 'bg-muted/40',
                )}
                style={!sel && f >= 0 ? { background: `color-mix(in oklab, ${MARKS[f % MARKS.length]} 30%, transparent)` } : undefined}
              >
                {ch}
              </div>
            );
          }),
        )}
      </div>
      <p className="mt-2 min-h-5 text-center text-[13px] text-muted-foreground" role="status">
        {anchor && !dragging.current ? 'Now tap the last letter of the word.' : miss ? 'That isn’t one of the words. Try again!' : ''}
      </p>
      <ul className={cn('mt-2 grid gap-1.5', big ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')} aria-label="Words to find">
        {pz.words.map((w) => {
          const k = found.findIndex((f) => f.word === w.word);
          return (
            <li key={w.word} className={cn('rounded-xl border px-2.5 py-1.5', k >= 0 ? 'border-transparent' : 'border-border bg-card')} style={k >= 0 ? { background: `color-mix(in oklab, ${MARKS[k % MARKS.length]} 22%, transparent)` } : undefined}>
              <span className={cn('block font-semibold tracking-wide', big ? 'text-lg' : 'text-[13.5px]', k >= 0 && 'line-through decoration-2')}>{w.word}</span>
              {!big && <span className="block truncate text-[11.5px] text-muted-foreground">{w.clue}</span>}
              <span className="sr-only">{k >= 0 ? 'found' : 'not found yet'}</span>
            </li>
          );
        })}
      </ul>
      <Button variant="outline" size="lg" className="mt-4 h-12 w-full" onClick={() => void finish()}>
        <Flag /> {found.length ? 'I’m done' : 'Give up'}
      </Button>
    </GameFrame>
  );
}
