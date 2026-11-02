import { GERM_TUBES, SEED_REF_LABEL, type SeedRef } from '@aischool/shared';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { lastRespShown, lastSeedShown, lastTropShown } from '../readings';
import { FlasksSvg, GermTubeCloseUp, SeedlingSvg, TropSvg } from '../visuals';
import { useGrowthBench } from './bench';
import { germActs, respActs, seedActs, tropActs, type GrowthCtx } from './lab-actions';

/**
 * The close-up views: the four tubes seed by seed, the seed jar with its
 * rulers and the sawdust box, the flasks' thermometer scales and the CO₂
 * tubes, the light box with the protractor and the cork of radicles — the
 * same drawings as the 2D lab, from the same maths, with the controls.
 */

const SHELL = 'pointer-events-auto absolute inset-0 z-[8] overflow-y-auto overscroll-contain p-2 pt-[6.5rem] text-white sm:p-4 sm:pt-28';
const CARD = 'w-full max-w-2xl rounded-2xl bg-card p-3 text-card-foreground shadow-2xl';

export function ReadingPanel({ ctx, readOnly, onBack }: { ctx: GrowthCtx; readOnly: boolean; onBack: () => void }) {
  const task = ctx.s.task ?? 'GERM';
  return (
    <div className={cn(SHELL, 'bg-black/55')} role="dialog" aria-label={task === 'GERM' ? 'Looking at the tubes' : task === 'SEEDLING' ? 'Looking at the seedlings' : task === 'RESP' ? 'Reading the thermometers' : 'Looking at the seedlings'}>
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3">
        <section className={CARD}>
          {task === 'GERM' ? <GermReading ctx={ctx} readOnly={readOnly} /> : task === 'SEEDLING' ? <SeedReading ctx={ctx} readOnly={readOnly} /> : task === 'RESP' ? <RespReading ctx={ctx} readOnly={readOnly} /> : <TropReading ctx={ctx} readOnly={readOnly} />}
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

function GermReading({ ctx, readOnly }: { ctx: GrowthCtx; readOnly: boolean }) {
  const { p, s } = ctx;
  const w = s.germ;
  return (
    <>
      <p className="mb-2 text-[13px] font-semibold">The tubes on day {w.day} — count the seeds whose radicle shows</p>
      <div className="grid grid-cols-4 gap-1.5">
        {GERM_TUBES.map((n, k) => (
          <div key={n} className="text-center">
            <GermTubeCloseUp v={p.v} w={w} k={k} />
            <p className="mt-0.5 text-[11.5px] font-semibold">Tube {n}</p>
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={w.day >= 7 || !w.tubes.some((t) => t.seeds > 0)} onClick={() => germActs.wait(ctx)}>
            Leave them 1 day
          </Button>
          <Button size="sm" variant="brand" disabled={w.day < 1 || w.looks.includes(w.day)} onClick={() => germActs.look(ctx)}>
            Inspect and count today
          </Button>
        </div>
      )}
      <p className="mt-2 text-[12px] text-muted-foreground">A white radicle growing from a seed means it has germinated. A seed that is only bigger has just taken up water.{w.looks.includes(w.day) ? ' Inspected today: write the counts in your notebook.' : ''}</p>
    </>
  );
}

function SeedReading({ ctx, readOnly }: { ctx: GrowthCtx; readOnly: boolean }) {
  const { p, s } = ctx;
  const w = s.seedling;
  const ref = useGrowthBench((b) => b.ref);
  const last = lastSeedShown(p.v, s);
  const done = (k: 'COWPEA' | 'MAIZE') => w.measures.some((m) => m.day === w.day && m.kind === k);
  return (
    <>
      <p className="mb-2 text-[13px] font-semibold">Day {w.day}: the seed jar (a ruler beside each seedling) and the box of sawdust</p>
      <SeedlingSvg v={p.v} w={w} label={`The seedlings on day ${w.day}`} />
      {last && (
        <p className="mt-2 text-[12.5px]">
          Last measured: {last.kind === 'COWPEA' ? 'cowpea' : 'maize'} on day {last.day} — <span className="font-mono text-[15px] font-semibold">{last.mm} mm</span>
        </p>
      )}
      {!readOnly && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
            <span>Measure from:</span>
            {(['SEED', 'SOIL'] as SeedRef[]).map((r) => (
              <button key={r} type="button" aria-pressed={ref === r} onClick={() => useGrowthBench.setState({ ref: r })} className={cn('rounded-full border px-2 py-0.5', ref === r ? 'border-brand bg-brand/10' : 'border-border text-muted-foreground')}>
                {SEED_REF_LABEL[r]}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" disabled={w.waters.includes(w.day) || (!w.box && !w.jar)} onClick={() => p.seedling.water()}>
              Water
            </Button>
            <Button size="sm" variant="brand" disabled={!w.jar || w.day < 1 || done('COWPEA')} onClick={() => seedActs.measure(ctx, 'COWPEA')}>
              Measure the cowpea shoot
            </Button>
            <Button size="sm" variant="brand" disabled={!w.jar || w.day < 1 || done('MAIZE')} onClick={() => seedActs.measure(ctx, 'MAIZE')}>
              Measure the maize shoot
            </Button>
            <Button size="sm" variant="outline" disabled={w.day < 1 || w.draws.includes(w.day)} onClick={() => p.seedling.draw()}>
              Draw them
            </Button>
            <Button size="sm" variant="outline" disabled={(!w.box && !w.jar) || w.day >= 10} onClick={() => seedActs.wait(ctx)}>
              Leave 1 day
            </Button>
          </div>
        </>
      )}
    </>
  );
}

function RespReading({ ctx, readOnly }: { ctx: GrowthCtx; readOnly: boolean }) {
  const { p, s } = ctx;
  const w = s.resp;
  const last = lastRespShown(p.v, s);
  return (
    <>
      <p className="mb-2 text-[13px] font-semibold">The flasks, their thermometers (°C) and the CO₂ test</p>
      <FlasksSvg v={p.v} w={w} label="The thermometer scales and the CO₂ test" />
      {last && <p className="mt-2 text-[12.5px]">Reading {last.n + 1} ({Math.round(last.at - (w.startAt ?? 0))} h): read the scales — to 0.5 °C.</p>}
      {!readOnly && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="brand" disabled={w.startAt === null || w.reads.includes(w.clock)} onClick={() => respActs.read(ctx)}>
            Read both thermometers
          </Button>
          <Button size="sm" variant="outline" disabled={!w.soaked} onClick={() => respActs.wait(ctx, 1)}>
            Wait 1 h
          </Button>
          <Button size="sm" variant="outline" disabled={!w.soaked} onClick={() => respActs.wait(ctx, 24)}>
            Leave 1 day
          </Button>
          <Button size="sm" variant="outline" disabled={w.co2.at === null} onClick={() => p.resp.co2Look()}>
            Look at the CO₂ test
          </Button>
        </div>
      )}
      <p className="mt-2 text-[12px] text-muted-foreground">Clock: {Math.round(w.clock)} h{w.startAt !== null ? ` (${Math.round(w.clock - w.startAt)} h since the flasks were set up)` : ''}.</p>
    </>
  );
}

function TropReading({ ctx, readOnly }: { ctx: GrowthCtx; readOnly: boolean }) {
  const { p, s } = ctx;
  const w = s.trop;
  const last = lastTropShown(p.v, s);
  const done = (pot: 'TEST' | 'CTRL') => w.measures.some((m) => m.day === w.day && m.pot === pot);
  return (
    <>
      <p className="mb-2 text-[13px] font-semibold">Day {w.day}: the protractor on the tagged shoots, and the radicles</p>
      <TropSvg v={p.v} w={w} label={`The tropism experiments on day ${w.day}`} />
      {last && (
        <p className="mt-2 text-[12.5px]">
          Last measured: {last.pot === 'TEST' ? 'test' : 'control'} shoot on day {last.day} — <span className="font-mono text-[15px] font-semibold">{last.deg}°</span>
        </p>
      )}
      {!readOnly && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={w.waters.includes(w.day) || (!w.box && !w.pinned)} onClick={() => p.trop.water()}>
            Water
          </Button>
          <Button size="sm" variant="brand" disabled={!w.box || w.day < 1 || done('TEST')} onClick={() => tropActs.measure(ctx, 'TEST')}>
            Protractor: test shoot
          </Button>
          <Button size="sm" variant="brand" disabled={!w.ctrl || w.day < 1 || done('CTRL')} onClick={() => tropActs.measure(ctx, 'CTRL')}>
            Protractor: control shoot
          </Button>
          <Button size="sm" variant="outline" disabled={!w.pinned || w.day < 1 || w.countAt === w.day} onClick={() => tropActs.count(ctx)}>
            Count the radicles growing down
          </Button>
          <Button size="sm" variant="outline" disabled={(!w.box && !w.pinned) || w.day >= 5} onClick={() => tropActs.wait(ctx)}>
            Leave 1 day
          </Button>
        </div>
      )}
    </>
  );
}
