import { PLAS_MEDIA, PLAS_MEDIUM_LABEL, PLAS_OBJECTIVES, agarDepth, agarSide, potatoPhase, type PlasMedium } from '@aischool/shared';
import { ArrowLeft, Camera } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { play } from '../../../lab3d-kit/sound';
import { FEEL_TEXT, PHASE_LABEL, potatoShown, usePlasShrink } from '../readings';
import { AgarBeakerSvg, BalanceDisplay, FieldView, RulerSvg } from '../visuals';
import { useOsmoBench } from './bench';
import { agarActs, plasActs, potatoActs, type OsmoCtx } from './lab-actions';

/**
 * The reading views: the ruler (to 1 mm) and the balance (0.01 g) for the
 * cylinder or cube in hand, and the eyepiece of the microscope — the same
 * drawings as the 2D lab, from the same maths — with the controls beside them.
 */

const SHELL = 'pointer-events-auto absolute inset-0 z-[8] overflow-y-auto overscroll-contain p-2 pt-[6.5rem] text-white sm:p-4 sm:pt-28';
const CARD = 'w-full max-w-xl rounded-2xl bg-card p-3 text-card-foreground shadow-2xl';

export function ReadingPanel({ ctx, readOnly, onBack }: { ctx: OsmoCtx; readOnly: boolean; onBack: () => void }) {
  const task = ctx.s.task ?? 'POTATO';
  return task === 'PLASMOLYSIS' ? <Eyepiece ctx={ctx} readOnly={readOnly} onBack={onBack} /> : task === 'AGAR' ? <AgarReading ctx={ctx} readOnly={readOnly} onBack={onBack} /> : <PotatoReading ctx={ctx} readOnly={readOnly} onBack={onBack} />;
}

function Back({ onBack }: { onBack: () => void }) {
  return (
    <Button size="sm" variant="outline" onClick={onBack}>
      <ArrowLeft /> Back to the bench
    </Button>
  );
}

function PotatoReading({ ctx, readOnly, onBack }: { ctx: OsmoCtx; readOnly: boolean; onBack: () => void }) {
  const { o, s } = ctx;
  const w = s.potato;
  const sel = useOsmoBench((b) => b.sel);
  const lying = useOsmoBench((b) => b.lying);
  const i = Math.max(0, Math.min(sel, w.cyl.length - 1));
  const c = w.cyl[i];
  const sh = c ? potatoShown(o.v, s, i) : null;
  return (
    <div className={cn(SHELL, 'bg-black/55')} role="dialog" aria-label="Reading the ruler and the balance">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3">
        <section className={CARD}>
          {!c || !sh ? (
            <p className="text-[13px]">Bore a cylinder first.</p>
          ) : (
            <>
              <p className="mb-2 text-[13px] font-semibold">
                Cylinder {i + 1} — {c.conc === 0 ? 'distilled water' : `${c.conc.toFixed(1)} mol/dm³ sucrose`} <span className="font-normal text-muted-foreground">({PHASE_LABEL[sh.ph]})</span>
              </p>
              {lying === 'ruler' && sh.trueLength !== null ? <RulerSvg length={sh.trueLength} kind="potato" label={`Cylinder ${i + 1} against the ruler: read its end to the nearest millimetre`} /> : <p className="text-[12.5px] text-muted-foreground">{sh.ph === 'SOAK' ? 'It is soaking.' : lying === 'balance' ? 'On the balance pan:' : 'Not on the ruler: measure it to see it against the scale.'}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {lying === 'balance' && <BalanceDisplay mass={sh.mass} />}
                {sh.feel && ctx.scene.felt.has(i) && <span className="text-[12.5px]">{FEEL_TEXT[sh.feel]}</span>}
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground">Write the reading in your notebook: length to the nearest mm, mass exactly as the balance shows it.</p>
              {!readOnly && sh.ph !== 'SOAK' && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => (o.potato.blot(i), play('tick'))} disabled={potatoPhase(c) === 'B' ? c.blotB : c.blotA}>
                    Blot dry
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => potatoActs.measure(ctx, i)}>
                    Measure the length
                  </Button>
                  <Button size="sm" variant="brand" onClick={() => potatoActs.weigh(ctx, i)}>
                    Weigh
                  </Button>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1">
                {w.cyl.map((x, k) => (
                  <button key={k} type="button" onClick={() => useOsmoBench.setState({ sel: k })} aria-pressed={k === i} className={cn('rounded-full border px-2 py-0.5 text-[12px]', k === i ? 'border-brand bg-brand/10' : 'border-border text-muted-foreground')}>
                    {k + 1}. {x.conc.toFixed(1)} M
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="mt-3">
            <Back onBack={onBack} />
          </div>
        </section>
      </div>
    </div>
  );
}

function Eyepiece({ ctx, readOnly, onBack }: { ctx: OsmoCtx; readOnly: boolean; onBack: () => void }) {
  const { o, s } = ctx;
  const w = s.plas;
  const sh = usePlasShrink(o.v, w);
  const tally = useOsmoBench((b) => b.tally);
  const [m, setM] = useState<PlasMedium>('SUCROSE');
  const last = w.irrigations.at(-1);
  const tap = (i: number) => useOsmoBench.setState({ tally: tally.includes(i) ? tally.filter((x) => x !== i) : [...tally, i] });
  return (
    <div className={cn(SHELL, 'bg-[radial-gradient(circle_at_center,#0b0f12_0%,#05070a_70%)]')} role="dialog" aria-label="Looking through the eyepiece">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 md:flex-row md:items-start md:justify-center">
        <div className="flex w-full max-w-[min(560px,62dvh)] flex-col items-center">
          <FieldView v={o.v} g={sh.g} killed={sh.killed} objective={w.objective} placed={w.onStage} tally={new Set(tally)} onTap={readOnly ? undefined : tap} label="Field of view" className="w-full" />
          <p className="mt-1 text-center text-[12.5px] text-white/75" aria-live="polite">
            ×{w.objective} objective · ×{w.objective * 10} total · {w.clock} min since mounting · {tally.length} cells marked{' '}
            {tally.length > 0 && (
              <button type="button" className="underline" onClick={() => useOsmoBench.setState({ tally: [] })}>
                clear
              </button>
            )}
          </p>
        </div>
        <section className="w-full max-w-sm rounded-2xl bg-card p-3 text-card-foreground shadow-2xl" aria-label="Microscope and slide">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 text-[12.5px] text-muted-foreground">Objective</span>
            {PLAS_OBJECTIVES.map((ob) => (
              <Button key={ob} size="sm" variant={w.objective === ob ? 'brand' : 'outline'} aria-pressed={w.objective === ob} disabled={readOnly} onClick={() => (o.plasmolysis.objective(ob), play('creak'))}>
                ×{ob}
              </Button>
            ))}
          </div>
          {!readOnly && (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" variant="brand" onClick={() => (o.plasmolysis.capture(), play('tick'))} disabled={w.captures.some((c) => c.at === w.clock && c.objective === w.objective)}>
                  <Camera /> Record this view
                </Button>
                <Button size="sm" variant="outline" onClick={() => (o.plasmolysis.wait(1), play('tick'))}>
                  Wait 1 min
                </Button>
                <Button size="sm" variant="outline" onClick={() => (o.plasmolysis.wait(5), play('tick'))}>
                  Wait 5 min
                </Button>
              </div>
              <p className="mb-1 mt-3 text-[12.5px] font-semibold">Change the liquid under the cover slip</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <select value={m} onChange={(e) => setM(e.target.value as PlasMedium)} className="h-8 rounded-md border border-input bg-card px-1 text-[12.5px]" aria-label="Liquid for the edge of the cover slip">
                  {PLAS_MEDIA.map((x) => (
                    <option key={x} value={x}>
                      {PLAS_MEDIUM_LABEL[x]}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline" onClick={() => plasActs.drop(ctx, m)}>
                  A drop at one edge
                </Button>
                <Button size="sm" variant="outline" disabled={!last || last.drawn || last.at !== w.clock || !ctx.scene.collected.has('paper')} onClick={() => plasActs.draw(ctx)}>
                  Filter paper at the other edge
                </Button>
              </div>
            </>
          )}
          <p className="mt-2 text-[12px] text-muted-foreground">Tap cells to mark them as you count. Count only cells with their centre inside the field.</p>
          {w.captures.length > 0 && <p className="mt-1 text-[12px] text-muted-foreground">Recorded: {w.captures.map((c) => `${c.at} min ×${c.objective}`).join(' · ')}</p>}
          <div className="mt-3">
            <Back onBack={onBack} />
          </div>
        </section>
      </div>
    </div>
  );
}

function AgarReading({ ctx, readOnly, onBack }: { ctx: OsmoCtx; readOnly: boolean; onBack: () => void }) {
  const { o, s } = ctx;
  const w = s.agar;
  const sel = useOsmoBench((b) => b.sel);
  const i = Math.max(0, Math.min(sel, w.cubes.length - 1));
  const c = w.cubes[i];
  const started = w.cubes.some((x) => x.placedAt !== null);
  return (
    <div className={cn(SHELL, 'bg-black/55')} role="dialog" aria-label="Reading the ruler">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3">
        <section className={CARD}>
          {c ? (
            <>
              <p className="mb-2 text-[13px] font-semibold">
                Cube {i + 1} ({c.size} cm){c.cutAt !== null ? `, cut open at ${c.cutAt} min` : ''}
              </p>
              {c.cutAt !== null ? (
                w.depthMeasured.includes(i) ? <RulerSvg length={agarSide(o.v.agar, i, c)} depth={agarDepth(o.v.agar, i, c, c.cutAt)} kind="section" range={40} label={`The cut face of cube ${i + 1} against the ruler`} /> : <p className="text-[12.5px] text-muted-foreground">Measure the colourless zone to lay it against the ruler.</p>
              ) : w.measured.includes(i) ? (
                <RulerSvg length={agarSide(o.v.agar, i, c)} kind="cube" range={40} label={`Cube ${i + 1} against the ruler`} />
              ) : (
                <p className="text-[12.5px] text-muted-foreground">Measure it to lay it against the ruler.</p>
              )}
              {!readOnly && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.cutAt === null ? (
                    <Button size="sm" variant="outline" onClick={() => agarActs.measure(ctx, i)}>
                      Measure the side
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => agarActs.depth(ctx, i)}>
                      Measure the colourless zone
                    </Button>
                  )}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1">
                {w.cubes.map((x, k) => (
                  <button key={k} type="button" onClick={() => useOsmoBench.setState({ sel: k })} aria-pressed={k === i} className={cn('rounded-full border px-2 py-0.5 text-[12px]', k === i ? 'border-brand bg-brand/10' : 'border-border text-muted-foreground')}>
                    {k + 1}. {x.size} cm{x.cutAt !== null ? ' (cut)' : ''}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[13px]">Cut a cube first.</p>
          )}
          {started && (
            <div className="mt-3">
              <p className="mb-1 text-[12.5px] font-semibold">The beaker: {w.clock} min</p>
              <AgarBeakerSvg v={o.v} w={w} label="The cubes in the acid" />
              {!readOnly && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[1, 5].map((m) => (
                    <Button key={m} size="sm" variant="outline" onClick={() => agarActs.wait(ctx, m)}>
                      Watch {m} min
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="mt-3">
            <Back onBack={onBack} />
          </div>
        </section>
      </div>
    </div>
  );
}
