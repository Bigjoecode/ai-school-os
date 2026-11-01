import { LEAF_SHORT, OXY_DISTS, POTO_CONDS, POTO_COND_SHORT, oxyLampAt, oxySplint, potoCondAt } from '@aischool/shared';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { play } from '../../../lab3d-kit/sound';
import { lastCountShown, lastRunShown, waterTemp } from '../readings';
import { LeafSvg, OxygenSvg, PotometerSvg, StopwatchDisplay } from '../visuals';
import { usePlantBench } from './bench';
import { oxyActs, potoActs, starchActs, type PlantCtx } from './lab-actions';

/**
 * The close-up views: the potometer's scale with the bubble and the
 * stopwatch, the pondweed with its bubbles and the lamp on the rule, and a
 * leaf on the tile or the grid (tap squares to tick them while counting) —
 * the same drawings as the 2D lab, from the same maths, with the controls.
 */

const SHELL = 'pointer-events-auto absolute inset-0 z-[8] overflow-y-auto overscroll-contain p-2 pt-[6.5rem] text-white sm:p-4 sm:pt-28';
const CARD = 'w-full max-w-xl rounded-2xl bg-card p-3 text-card-foreground shadow-2xl';

export function ReadingPanel({ ctx, readOnly, onBack }: { ctx: PlantCtx; readOnly: boolean; onBack: () => void }) {
  const task = ctx.s.task ?? 'POTOMETER';
  return (
    <div className={cn(SHELL, 'bg-black/55')} role="dialog" aria-label={task === 'POTOMETER' ? 'Reading the potometer' : task === 'OXYGEN' ? 'Watching the pondweed' : 'Looking at the leaf'}>
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3">
        <section className={CARD}>
          {task === 'POTOMETER' ? <PotoReading ctx={ctx} readOnly={readOnly} /> : task === 'OXYGEN' ? <OxyReading ctx={ctx} readOnly={readOnly} /> : <StarchReading ctx={ctx} readOnly={readOnly} />}
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={onBack}>
              <ArrowLeft /> Back to the bench
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function PotoReading({ ctx, readOnly }: { ctx: PlantCtx; readOnly: boolean }) {
  const { p, s } = ctx;
  const w = s.poto;
  const last = lastRunShown(p.v, s);
  const cond = potoCondAt(w, w.clock);
  return (
    <>
      <p className="mb-2 text-[13px] font-semibold">The capillary scale (mm)</p>
      <PotometerSvg v={p.v} w={w} label="The bubble on the capillary scale" />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
        Last timing over 30 mm: <StopwatchDisplay sec={last?.sec ?? null} />
        {last && <span className="text-muted-foreground">({POTO_COND_SHORT[last.run.cond]})</span>}
      </div>
      {!readOnly && w.bubble && (
        <>
          <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Condition">
            {POTO_CONDS.map((c) => (
              <Button key={c} size="sm" variant={cond === c ? 'brand' : 'outline'} aria-pressed={cond === c} onClick={() => potoActs.cond(ctx, c)}>
                {POTO_COND_SHORT[c]}
              </Button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => (p.poto.wait(1), play('tick'))}>
              Wait 1 min
            </Button>
            <Button size="sm" variant="outline" onClick={() => (p.poto.wait(5), play('tick'))}>
              Wait 5 min
            </Button>
            <Button size="sm" variant="outline" disabled={w.zeroAt === w.clock} onClick={() => potoActs.reset(ctx)}>
              Reset the bubble
            </Button>
            <Button size="sm" variant="brand" disabled={w.zeroAt !== w.clock} onClick={() => potoActs.time(ctx)}>
              Time it over 30 mm
            </Button>
          </div>
        </>
      )}
      <p className="mt-2 text-[12px] text-muted-foreground">Write each time in your notebook exactly as the stopwatch shows it. Clock {Math.round(w.clock * 10) / 10} min.</p>
    </>
  );
}

function OxyReading({ ctx, readOnly }: { ctx: PlantCtx; readOnly: boolean }) {
  const { p, s } = ctx;
  const w = s.oxy;
  const d = oxyLampAt(w, w.clock);
  const last = lastCountShown(p.v, s);
  const sp = oxySplint(p.v.oxy, w);
  return (
    <>
      <p className="mb-2 text-[13px] font-semibold">{d === null ? 'Lamp off' : `Lamp at ${d} cm`}</p>
      <OxygenSvg v={p.v} w={w} label="Bubbles rising from the pondweed" />
      <p className="mt-2 text-[12.5px]">
        {last ? (
          <>
            Last count ({last.d} cm): <span className="font-mono text-[15px] font-semibold">{last.bubbles}</span> bubbles in a minute.
          </>
        ) : (
          'No count yet.'
        )}
        {w.temps.length > 0 && <span className="ml-2 text-muted-foreground">Thermometer: {waterTemp(p.v, s).toFixed(1)} °C</span>}
      </p>
      {sp && <p className="mt-1 text-[12.5px]">{sp.relit ? 'The glowing splint relit.' : 'The splint did not relight (too little gas).'}</p>}
      {!readOnly && w.plant && (
        <>
          <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Lamp distance">
            {OXY_DISTS.map((x) => (
              <Button key={x} size="sm" variant={d === x ? 'brand' : 'outline'} aria-pressed={d === x} onClick={() => oxyActs.lamp(ctx, x)}>
                {x}
              </Button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => (p.oxy.wait(5), play('tick'))}>
              Wait 5 min
            </Button>
            <Button size="sm" variant="brand" disabled={d === null} onClick={() => oxyActs.count(ctx)}>
              Count for 1 min
            </Button>
            <Button size="sm" variant="outline" onClick={() => p.oxy.temp()}>
              Read the thermometer
            </Button>
          </div>
        </>
      )}
    </>
  );
}

function StarchReading({ ctx, readOnly }: { ctx: PlantCtx; readOnly: boolean }) {
  const { p, s } = ctx;
  const w = s.starch;
  const sel = usePlantBench((b) => b.sel);
  const tally = usePlantBench((b) => b.tally);
  const i = Math.max(0, Math.min(sel, w.leaves.length - 1));
  const l = w.leaves[i];
  const onGrid = w.grid.leaf === i;
  if (!l) return <p className="text-[13px]">Pick a leaf first.</p>;
  return (
    <>
      <p className="mb-2 text-[13px] font-semibold">
        Leaf {i + 1}: {LEAF_SHORT[l.kind]} {onGrid ? '— on the 1 cm² grid' : l.tile ? '— on the tile' : ''}
      </p>
      <LeafSvg v={p.v} w={w} leaf={l} grid={onGrid} tally={onGrid ? new Set(tally) : undefined} onTap={onGrid && !readOnly ? (k) => usePlantBench.setState({ tally: tally.includes(k) ? tally.filter((x) => x !== k) : [...tally, k] }) : undefined} label={`${LEAF_SHORT[l.kind]}${l.iodine ? ' after iodine' : ''}`} />
      {onGrid && (
        <p className="mt-1 text-[12px] text-muted-foreground">
          Tap squares to tick them as you count: {tally.length} ticked{' '}
          {tally.length > 0 && (
            <button type="button" className="underline" onClick={() => usePlantBench.setState({ tally: [] })}>
              clear
            </button>
          )}
        </p>
      )}
      {!readOnly && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={l.soft} onClick={() => (p.starch.soften(i), play('drip'))}>
            Soften in warm water
          </Button>
          <Button size="sm" variant="outline" disabled={l.tile} onClick={() => (p.starch.tile(i), play('tick'))}>
            Spread on the tile
          </Button>
          <Button size="sm" variant="brand" disabled={!l.tile || l.iodine} onClick={() => (p.starch.iodine(i), play('drip'))}>
            Add iodine
          </Button>
          <Button size="sm" variant="outline" disabled={!l.iodine || onGrid} onClick={() => (p.starch.grid(i), usePlantBench.setState({ tally: [] }))}>
            Lay it on the grid
          </Button>
          {w.hot && l.eth === 0 && (
            <Button size="sm" variant="outline" onClick={() => starchActs.ethanol(ctx, i)}>
              Ethanol in the hot water bath
            </Button>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-1">
        {w.leaves.map((x, k) => (
          <button key={k} type="button" onClick={() => usePlantBench.setState({ sel: k, tally: [] })} aria-pressed={k === i} className={cn('rounded-full border px-2 py-0.5 text-[12px]', k === i ? 'border-brand bg-brand/10' : 'border-border text-muted-foreground')}>
            {k + 1}. {LEAF_SHORT[x.kind]}
          </button>
        ))}
      </div>
    </>
  );
}
