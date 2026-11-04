import {
  CROSS_BATCH,
  CROSS_FILLS,
  CROSS_FILL_LABEL,
  DISC_RECORD,
  DISC_RECORD_LABEL,
  DISC_TRIES,
  FOOD_LEVELS,
  FOOD_LEVEL_LABEL,
  FOOD_ORG_LABEL,
  FOOD_SPOTS,
  FOOD_SPOT_LABEL,
  FOOD_SPOT_SHOWS,
  crossPairs,
  type BioGeneticsState,
  type FoodSpot,
} from '@aischool/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { discNow, heightNow, lastPair, type Genetics } from './actions';
import { BeakersSvg, BoardSvg } from './visuals';

/** The bench controls of each task (the 2D lab's bench, and the 3D lab's close-up view): the same actions, with what the apparatus shows now. */

const Box = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-3 rounded-xl border border-border p-3">
    <p className="mb-2 text-[12.5px] font-semibold">{title}</p>
    {children}
  </div>
);
const Row = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap gap-1.5 [&>button]:h-auto [&>button]:min-h-8 [&>button]:whitespace-normal [&>button]:py-1 [&>button]:text-left [&>button]:max-w-full [&>button]:shrink">{children}</div>;
const Say = ({ children }: { children: React.ReactNode }) => <p className="mt-2 rounded-lg bg-muted px-2 py-1 text-[12.5px]">{children}</p>;
function Toggle({ on, onClick, yes, no, readOnly }: { on: boolean; onClick: () => void; yes: string; no: string; readOnly: boolean }) {
  return (
    <Button size="sm" variant={on ? 'secondary' : 'outline'} aria-pressed={on} disabled={readOnly} onClick={onClick} className="h-auto min-h-8 whitespace-normal py-1 text-left">
      {on ? `✓ ${yes}` : no}
    </Button>
  );
}
/** A strip of classmate numbers (tap one to call them up). */
function Strip({ n, at, mark, onPick, readOnly }: { n: number; at: number; mark: (i: number) => string; onPick: (i: number) => void; readOnly: boolean }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Classmates">
      {Array.from({ length: n }, (_, i) => (
        <button key={i} type="button" disabled={readOnly} onClick={() => onPick(i)} aria-label={`Classmate ${i + 1} ${mark(i)}`} aria-current={i === at} className={cn('h-7 min-w-7 rounded-md border px-1 text-[11px] tabular-nums', i === at ? 'border-brand bg-brand/15 font-semibold' : mark(i) ? 'border-success/60 bg-success/10' : 'border-border text-muted-foreground')}>
          {i + 1}
          {mark(i) && <span className="ml-0.5 text-[9px]">{mark(i)}</span>}
        </button>
      ))}
    </div>
  );
}

export function HeightBench({ g, state, readOnly }: { g: Genetics; state: BioGeneticsState; readOnly: boolean }) {
  const w = state.height;
  const a = g.height;
  const now = heightNow(g.v, state);
  const [msg, setMsg] = useState<string | null>(null);
  const done = (i: number) => {
    const h = w.measures.some((m) => m.who === i && m.kind === 'H');
    const s = w.measures.some((m) => m.who === i && m.kind === 'S');
    return g.v.height.people[i]?.declines && state.log.some((e) => e.a === `declined:${i}`) ? '–' : `${h ? 'H' : ''}${s ? 'S' : ''}`;
  };
  const measure = (k: 'H' | 'S') => {
    const r = a.measure(k);
    setMsg(r === 'DECLINED' ? `Classmate ${now.who + 1} would rather not be measured. That is fine — record them as declined and call the next.` : r === null ? 'That is plenty of measurements.' : k === 'H' ? `Classmate ${now.who + 1}: the board reads ${r} cm.` : `Classmate ${now.who + 1}: hand span ${r.toFixed(1)} cm.`);
  };
  return (
    <div>
      <Box title={`Classmate ${now.who + 1} of ${g.v.height.n} at the height board`}>
        <div className="flex flex-wrap items-start gap-3">
          <BoardSvg reading={now.h} square={w.square} shoes={!w.shoesOff} declines={now.declines && state.log.some((e) => e.a === `declined:${now.who}`)} />
          <div className="min-w-[13rem] flex-1 space-y-2 text-[12.5px]">
            <p>Height: {now.h === null ? '—' : `${now.h} cm`} · Hand span: {now.s === null ? '—' : `${now.s.toFixed(1)} cm`}</p>
            {!readOnly && (
              <>
                <Row>
                  <Toggle on={w.shoesOff} onClick={() => a.shoes(!w.shoesOff)} yes="Shoes off" no="Ask them to take their shoes off" readOnly={readOnly} />
                  <Toggle on={w.square} onClick={() => a.square(!w.square)} yes="Set square flat on the head, read at eye level" no="Use a set square on the head" readOnly={readOnly} />
                  <Toggle on={w.spread} onClick={() => a.spread(!w.spread)} yes="Fingers spread fully" no="Ask them to spread the fingers" readOnly={readOnly} />
                </Row>
                <Row>
                  <Button size="sm" variant="brand" onClick={() => measure('H')}>
                    Measure the height
                  </Button>
                  <Button size="sm" variant="brand" onClick={() => measure('S')}>
                    Measure the hand span
                  </Button>
                  <Button size="sm" variant="outline" onClick={a.prev}>
                    Previous
                  </Button>
                  <Button size="sm" variant="outline" onClick={a.next}>
                    Next classmate
                  </Button>
                </Row>
              </>
            )}
            {msg && <Say>{msg}</Say>}
          </div>
        </div>
        <Strip n={g.v.height.n} at={w.at} mark={done} onPick={a.call} readOnly={readOnly} />
      </Box>
    </div>
  );
}

export function DiscBench({ g, state, readOnly }: { g: Genetics; state: BioGeneticsState; readOnly: boolean }) {
  const w = state.disc;
  const a = g.disc;
  const now = discNow(g.v, state);
  const [msg, setMsg] = useState<string | null>(null);
  const mark = (i: number) => `${(w.tries[i] ?? 0) > 0 ? (g.v.disc.people[i]!.roller && g.v.disc.people[i]!.needs <= (w.tries[i] ?? 0) ? 'R' : 'N') : ''}${w.cards[i] ? '•' : ''}`;
  return (
    <div>
      <Box title={`Classmate ${now.who + 1} of ${g.v.disc.n}`}>
        <div className="space-y-2 text-[12.5px]">
          <p>
            Tongue: {now.roll === null ? 'not tried yet' : now.roll === 'R' ? `rolls it into a U (attempt ${now.tries})` : `cannot roll it (${now.tries} attempt${now.tries === 1 ? '' : 's'})`} · Health card: {now.card ?? 'not read'}
          </p>
          {!readOnly && (
            <>
              <Row>
                <Button size="sm" variant="brand" disabled={now.roll === 'R'} onClick={() => {
                  const r = a.roll();
                  setMsg(r === null ? 'No more attempts needed.' : r ? `Classmate ${now.who + 1} rolls the tongue into a U.` : `Classmate ${now.who + 1} cannot roll it this time (attempt ${now.tries + 1}).${now.tries + 1 < DISC_TRIES ? ' Let them try again.' : ''}`);
                }}>
                  {now.roll === 'R' ? 'They can roll it' : now.tries ? `Let them try again (attempt ${now.tries + 1})` : 'Ask them to roll the tongue'}
                </Button>
                <Button size="sm" variant="outline" disabled={!!now.card} onClick={a.card}>
                  Read the health card
                </Button>
                <Button size="sm" variant="outline" onClick={a.prev}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" onClick={a.next}>
                  Next classmate
                </Button>
              </Row>
              <p className="text-muted-foreground">Record the survey:</p>
              <Row>
                {DISC_RECORD.map((r) => (
                  <Button key={r} size="sm" variant={w.recordBy === r ? 'secondary' : 'outline'} aria-pressed={w.recordBy === r} onClick={() => a.recordBy(r)}>
                    {DISC_RECORD_LABEL[r]}
                  </Button>
                ))}
              </Row>
            </>
          )}
          {now.needMore && <Say>Some people manage it only at the second or third attempt.</Say>}
          {msg && <Say>{msg}</Say>}
        </div>
        <Strip n={g.v.disc.n} at={w.at} mark={mark} onPick={a.call} readOnly={readOnly} />
        <p className="mt-2 text-[11.5px] text-muted-foreground">No blood is taken in class: groups come from the school health cards, shared with consent.</p>
      </Box>
    </div>
  );
}

/** The draws so far, ten to a line (the student counts each batch). */
export function PairTally({ state, seed, dark }: { state: BioGeneticsState; seed: number; dark?: boolean }) {
  const ps = crossPairs(state.cross, seed);
  const lines = Array.from({ length: Math.ceil(ps.length / CROSS_BATCH) }, (_, k) => ps.slice(k * CROSS_BATCH, (k + 1) * CROSS_BATCH));
  return (
    <div className="mt-2 text-[12px]">
      <p className={dark ? 'text-white/70' : 'text-muted-foreground'}>Pairs drawn ({ps.length}) — count TT, Tt and tt in each batch yourself.</p>
      <ol className="mt-1 max-h-48 space-y-0.5 overflow-y-auto font-mono leading-relaxed">
        {lines.map((l, k) => (
          <li key={k}>
            Batch {k + 1}: {l.map((p) => p.g).join(' ')}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function CrossBench({ g, state, readOnly }: { g: Genetics; state: BioGeneticsState; readOnly: boolean }) {
  const w = state.cross;
  const a = g.cross;
  const last = lastPair(state, g.v.seed);
  return (
    <div>
      <Box title={`Two beakers of beads — ${w.draws.length} draws`}>
        <BeakersSvg fill={w.fill} last={last?.p ?? null} peek={!w.blind && w.draws.length > 0} className="mx-auto mb-2" />
        {!readOnly && (
          <div className="space-y-2">
            {!w.fill && (
              <Row>
                {CROSS_FILLS.map((f) => (
                  <Button key={f} size="sm" variant={f === 'EQUAL' ? 'brand' : 'outline'} className="h-auto min-h-8 whitespace-normal py-1 text-left" onClick={() => a.fill(f)}>
                    {CROSS_FILL_LABEL[f]}
                  </Button>
                ))}
              </Row>
            )}
            <Row>
              <Toggle on={w.blind} onClick={() => a.blind(!w.blind)} yes="Drawing without looking" no="Draw without looking" readOnly={readOnly} />
              <Toggle on={w.back} onClick={() => a.back(!w.back)} yes="Beads returned and shaken after each draw" no="Return the beads and shake each time" readOnly={readOnly} />
            </Row>
            <Row>
              <Button size="sm" variant="brand" disabled={!w.fill} onClick={() => a.draw(1)}>
                Draw a pair
              </Button>
              <Button size="sm" variant="outline" disabled={!w.fill} onClick={() => a.draw(10)}>
                Draw 10 pairs
              </Button>
            </Row>
          </div>
        )}
        {last && <Say>Draw {last.n}: {last.p.a ? 'red' : 'white'} + {last.p.b ? 'red' : 'white'} → {last.p.g}</Say>}
        <PairTally state={state} seed={g.v.seed} />
      </Box>
    </div>
  );
}

export function SpotCard({ g, state, spot, readOnly }: { g: Genetics; state: BioGeneticsState; spot: FoodSpot; readOnly: boolean }) {
  const seen = state.food.visited.includes(spot);
  const sh = FOOD_SPOT_SHOWS[spot];
  return (
    <div className={cn('rounded-lg border p-2 text-[12px]', seen ? 'border-success/50 bg-success/5' : 'border-border')}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{FOOD_SPOT_LABEL[spot]}</span>
        {!seen && !readOnly && (
          <Button size="sm" variant="outline" className="h-7" onClick={() => g.food.survey(spot)} aria-label={`Survey: ${FOOD_SPOT_LABEL[spot]}`}>
            Survey
          </Button>
        )}
      </div>
      {seen && (
        <>
          <p className="mt-1">Counted: {sh.count.map((o) => `${FOOD_ORG_LABEL[o].toLowerCase()} ${g.v.food.counts[o]}`).join(', ')}</p>
          <ul className="mt-0.5 list-disc pl-4 text-muted-foreground">
            {sh.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
export function EnergyCard({ g }: { g: Genetics }) {
  return (
    <div className="rounded-lg border border-border bg-amber-50/60 p-2 text-[12px] dark:bg-amber-950/20">
      <p className="font-semibold">Data card: energy at each trophic level (kJ/m²/year)</p>
      <p className="mt-0.5 font-mono">{FOOD_LEVELS.map((L) => `${FOOD_LEVEL_LABEL[L].replace(' consumer', '')} ${g.v.food.energy[L]}`).join(' · ')}</p>
    </div>
  );
}

export function FoodBench({ g, state, readOnly }: { g: Genetics; state: BioGeneticsState; readOnly: boolean }) {
  const w = state.food;
  return (
    <div>
      <Box title={`The school field — ${w.visited.length} of ${FOOD_SPOTS.length} spots surveyed (counts in the study area)`}>
        {!readOnly && (
          <Row>
            <Toggle on={w.gloves} onClick={g.food.gloves} yes="Covered shoes and gloves on" no="Put on covered shoes and gloves" readOnly={readOnly || w.gloves} />
          </Row>
        )}
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {FOOD_SPOTS.map((s) => (
            <SpotCard key={s} g={g} state={state} spot={s} readOnly={readOnly} />
          ))}
        </div>
        <div className="mt-2">
          <EnergyCard g={g} />
        </div>
      </Box>
    </div>
  );
}
